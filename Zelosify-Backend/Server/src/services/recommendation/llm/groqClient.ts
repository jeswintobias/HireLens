import axios, { AxiosError } from "axios";
import logger from "../../../utils/logger/logger.js";
import type {
  ConversationTurn,
  FunctionCall,
  LlmClient,
  LlmRequest,
  LlmResponse,
} from "./llmClient.js";

/**
 * Groq client (OpenAI-compatible chat completions with tool calling), called
 * via the project's existing axios dependency.
 *
 * Model chain (GROQ_MODELS, comma-separated). Default:
 *   qwen/qwen3.8-27b    – returns several tool calls per turn (3-turn runs)
 *   openai/gpt-oss-120b – fallback, one tool call per turn
 *   openai/gpt-oss-20b  – fallback
 * Each Groq model has its own free-tier token budget, so on a 429 the client
 * moves to the next model (same message format, so a run can continue).
 *
 * - tool_choice "required": the model must answer with tool calls.
 * - Groq validates tool arguments server-side; a 400 "tool_use_failed" is a
 *   malformed model output and is handed back to the orchestrator to retry.
 * - 5xx / timeouts are retried with exponential backoff.
 */

const URL = "https://api.groq.com/openai/v1/chat/completions";
const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);
const DEFAULT_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];

export interface GroqClientOptions {
  apiKey?: string;
  models?: string[];
  timeoutMs?: number;
  maxHttpRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const v = JSON.parse(String(raw ?? "{}"));
    return v && typeof v === "object" ? v : (null as any);
  } catch {
    // Malformed JSON → null fails schema validation → model is asked to retry.
    return null as any;
  }
}

function modelParams(model: string) {
  if (model.startsWith("qwen/")) return { reasoning_effort: "none" };
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "low" };
  return {};
}

export class GroqClient implements LlmClient {
  private readonly apiKey: string;
  private readonly models: string[];
  private readonly timeoutMs: number;
  private readonly maxHttpRetries: number;

  constructor(opts: GroqClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
    this.apiKey = apiKey;
    this.models =
      opts.models ??
      (process.env.GROQ_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) || DEFAULT_MODELS);
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.GROQ_TIMEOUT_MS ?? 6000);
    this.maxHttpRetries = opts.maxHttpRetries ?? 2;
  }

  get model(): string {
    return this.models[0];
  }

  userTurn(text: string): ConversationTurn {
    return { role: "user", content: text };
  }

  toolResultsTurn(results: { call: FunctionCall; response: Record<string, unknown> }[]): ConversationTurn[] {
    return results.map(({ call, response }) => ({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(response),
    }));
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const base = {
      messages: [{ role: "system", content: req.systemInstruction }, ...req.turns],
      tools: req.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      tool_choice: "required",
      parallel_tool_calls: true,
      temperature: 0,
      max_tokens: 800,
    };

    const started = Date.now();
    let retries = 0;
    let modelIndex = 0;
    let transientAttempts = 0;

    for (;;) {
      const model = this.models[modelIndex];
      try {
        const res = await axios.post(
          URL,
          { ...base, model, ...modelParams(model) },
          { headers: { Authorization: `Bearer ${this.apiKey}` }, timeout: this.timeoutMs }
        );
        return this.toResponse(res.data, model, Date.now() - started, retries);
      } catch (err) {
        const e = err as AxiosError<any>;
        const status = e.response?.status;
        const apiError = e.response?.data?.error;

        // Malformed tool call (rejected by Groq's server-side schema check).
        if (status === 400 && apiError?.code === "tool_use_failed") {
          return {
            functionCalls: [],
            text: "",
            modelTurn: { role: "assistant", content: "" },
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latencyMs: Date.now() - started,
            httpRetries: retries,
            model,
            malformed: String(apiError.message ?? "tool_use_failed"),
          };
        }

        // Rate limited: switch to the next model in the chain.
        if (status === 429 && modelIndex < this.models.length - 1) {
          logger.warn("llm.model_fallback", { provider: "groq", from: model, to: this.models[modelIndex + 1], reason: "rate_limited" });
          modelIndex++;
          retries++;
          continue;
        }

        const transient = status === undefined || RETRYABLE_STATUS.has(status);
        if (!transient || transientAttempts >= this.maxHttpRetries) {
          throw new Error(`Groq request failed${status ? ` (${status})` : ""} [${model}]: ${apiError?.message ?? e.message}`);
        }
        const delay = 200 * 2 ** transientAttempts + Math.floor(Math.random() * 100);
        logger.warn("llm.http_retry", { provider: "groq", model, status, attempt: transientAttempts + 1, delayMs: delay });
        transientAttempts++;
        retries++;
        await sleep(delay);
      }
    }
  }

  private toResponse(data: any, model: string, latencyMs: number, httpRetries: number): LlmResponse {
    const message = data?.choices?.[0]?.message ?? {};
    const toolCalls: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const usage = data?.usage ?? {};
    return {
      functionCalls: toolCalls
        .filter((c) => c?.function?.name)
        .map((c) => ({ id: c.id, name: String(c.function.name), args: parseArgs(c.function.arguments) })),
      text: typeof message.content === "string" ? message.content : "",
      // Only the fields the API accepts back (drops e.g. `reasoning`).
      modelTurn: {
        role: "assistant",
        content: typeof message.content === "string" ? message.content : "",
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      usage: {
        promptTokens: Number(usage.prompt_tokens ?? 0),
        completionTokens: Number(usage.completion_tokens ?? 0),
        totalTokens: Number(usage.total_tokens ?? 0),
      },
      latencyMs,
      httpRetries,
      model,
    };
  }
}
