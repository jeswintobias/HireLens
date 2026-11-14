import logger from "../../../utils/logger/logger.js";
import type { ConversationTurn, FunctionCall, LlmClient } from "../llm/llmClient.js";
import { validate } from "../validation/schemas.js";
import { ToolError, type AgentState } from "./agentState.js";
import { NOT_A_TOOL_CALL_MESSAGE, SYSTEM_PROMPT, buildTaskMessage } from "./prompts.js";
import { TOOL_DECLARATIONS, TOOL_INDEX } from "./tools.js";

/**
 * Agent orchestrator: runs the LLM ⇄ tool loop.
 *
 *   LLM (tool-calling) → validate args → execute tool → feed result back → …
 *
 * - The LLM decides which tools to call; tools run in the order requested.
 * - Malformed output (no tool call, unknown tool, invalid args, broken
 *   ordering) is reported back to the model and retried, up to maxRetries.
 * - Token usage and latency are tracked for every LLM call.
 */

export interface OrchestratorOptions {
  llm: LlmClient;
  state: AgentState;
  maxTurns?: number;
  maxRetries?: number;
  deadlineMs?: number;
  /** Correlation fields added to every log line. */
  logContext?: Record<string, unknown>;
}

export interface AgentUsage {
  llmCalls: number;
  llmMs: number;
  httpRetries: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Distinct models used during the run (fallbacks included). */
  models: string[];
}

export class AgentError extends Error {
  constructor(message: string, public readonly usage: AgentUsage) {
    super(message);
    this.name = "AgentError";
  }
}

export async function runAgent(opts: OrchestratorOptions): Promise<AgentUsage> {
  const { llm, state, maxTurns = 6, maxRetries = 3, deadlineMs = 20_000, logContext = {} } = opts;
  const deadline = Date.now() + deadlineMs;
  const usage: AgentUsage = {
    llmCalls: 0, llmMs: 0, httpRetries: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, models: [],
  };
  const turns: ConversationTurn[] = [llm.userTurn(buildTaskMessage(state.requirements))];

  const fail = (message: string): never => {
    throw new AgentError(message, usage);
  };

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (Date.now() > deadline) fail("Agent deadline exceeded");
    state.turn = turn;

    let response;
    try {
      response = await llm.generate({ systemInstruction: SYSTEM_PROMPT, turns, tools: TOOL_DECLARATIONS });
    } catch (err) {
      fail((err as Error).message);
    }
    response = response!;

    usage.llmCalls++;
    usage.llmMs += response.latencyMs;
    usage.httpRetries += response.httpRetries;
    usage.promptTokens += response.usage.promptTokens;
    usage.completionTokens += response.usage.completionTokens;
    usage.totalTokens += response.usage.totalTokens;
    if (!usage.models.includes(response.model)) usage.models.push(response.model);

    logger.info("llm.call", {
      ...logContext,
      model: response.model,
      turn,
      latencyMs: response.latencyMs,
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
      toolCalls: response.functionCalls.map((c) => c.name),
    });

    // Malformed output: no usable tool call (or provider rejected the call).
    if (response.functionCalls.length === 0 || response.malformed) {
      state.retries++;
      const error = response.malformed ? `MALFORMED_TOOL_CALL: ${response.malformed}` : "NO_TOOL_CALL";
      state.trace.push({ turn, tool: "(none)", ok: false, durationMs: 0, error: error.slice(0, 300) });
      logger.warn("agent.malformed_output", { ...logContext, turn, error: error.slice(0, 300), retries: state.retries });
      if (state.retries > maxRetries) fail("Too many malformed LLM responses");
      const hint = response.malformed ? ` Error: ${response.malformed.slice(0, 300)}` : "";
      turns.push(llm.userTurn(NOT_A_TOOL_CALL_MESSAGE + hint));
      continue;
    }

    turns.push(response.modelTurn);
    const results: { call: FunctionCall; response: Record<string, unknown> }[] = [];
    let finished = false;

    for (const call of response.functionCalls) {
      let result;
      try {
        result = await executeCall(call, state, turn);
      } catch (err) {
        fail(`Tool ${call.name} failed: ${(err as Error).message}`);
      }
      result = result!;
      results.push({ call, response: result.response });
      if (!result.ok) state.retries++;
      if (result.ok && TOOL_INDEX.get(call.name)?.terminal) finished = true;
    }

    if (finished) return usage;
    if (state.retries > maxRetries) fail("Too many invalid tool calls");
    turns.push(...([] as ConversationTurn[]).concat(llm.toolResultsTurn(results)));
  }

  return fail(`Agent did not finish within ${maxTurns} turns`);
}

async function executeCall(call: FunctionCall, state: AgentState, turn: number) {
  const started = performance.now();
  const tool = TOOL_INDEX.get(call.name);
  const record = (ok: boolean, error?: string) =>
    state.trace.push({
      turn,
      tool: call.name,
      ok,
      durationMs: Math.round(performance.now() - started),
      ...(error ? { error } : {}),
    });

  if (!tool) {
    record(false, "UNKNOWN_TOOL");
    return {
      ok: false,
      response: { error: "UNKNOWN_TOOL", message: `No tool named ${call.name}`, availableTools: [...TOOL_INDEX.keys()] },
    };
  }

  const check = validate(tool.argsSchema, call.args ?? {});
  if (!check.valid) {
    record(false, `INVALID_ARGUMENTS: ${check.errors.join("; ")}`);
    return {
      ok: false,
      response: { error: "INVALID_ARGUMENTS", details: check.errors, hint: "Fix the arguments and call the tool again." },
    };
  }

  try {
    const response = await tool.execute(call.args ?? {}, state);
    record(true);
    return { ok: true, response };
  } catch (err) {
    if (err instanceof ToolError) {
      record(false, `${err.code}: ${err.message}`);
      return { ok: false, response: { error: err.code, message: err.message } };
    }
    // Infrastructure failures (e.g. S3 download) are not the model's fault.
    record(false, `TOOL_FAILURE: ${(err as Error).message}`);
    throw err;
  }
}
