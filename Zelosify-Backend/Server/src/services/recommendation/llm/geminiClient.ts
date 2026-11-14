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
 * Gemini REST client (generateContent) with function calling, called via the
 * project's existing axios dependency — no Gemini SDK required.
 *
 * - toolConfig mode ANY: the model must answer with tool calls, never prose.
 * - temperature 0 + minimal thinking for deterministic, low-latency turns.
 * - Retries transient failures (429 / 5xx / timeouts) with exponential backoff.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export interface GeminiClientOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxHttpRetries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GeminiClient implements LlmClient {
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxHttpRetries: number;

  constructor(opts: GeminiClientOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    this.apiKey = apiKey;
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
    this.timeoutMs = opts.timeoutMs ?? Number(process.env.GEMINI_TIMEOUT_MS ?? 8000);
    this.maxHttpRetries = opts.maxHttpRetries ?? 2;
  }

  userTurn(text: string): ConversationTurn {
    return { role: "user", parts: [{ text }] };
  }

  toolResultsTurn(
    results: { call: FunctionCall; response: Record<string, unknown> }[]
  ): ConversationTurn {
    return {
      role: "user",
      parts: results.map(({ call, response }) => ({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response,
        },
      })),
    };
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    const body = {
      systemInstruction: { parts: [{ text: req.systemInstruction }] },
      contents: req.turns,
      tools: [{ functionDeclarations: req.tools }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } },
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingLevel: "minimal" },
      },
    };

    const started = Date.now();
    let attempt = 0;
    for (;;) {
      try {
        const res = await axios.post(
          `${BASE_URL}/${this.model}:generateContent`,
          body,
          {
            headers: { "x-goog-api-key": this.apiKey },
            timeout: this.timeoutMs,
          }
        );
        return this.toResponse(res.data, Date.now() - started, attempt);
      } catch (err) {
        const status = (err as AxiosError).response?.status;
        const retryable =
          status === undefined ? (err as AxiosError).code !== "ERR_BAD_REQUEST" : RETRYABLE_STATUS.has(status);
        if (!retryable || attempt >= this.maxHttpRetries) {
          const detail = (err as AxiosError<any>).response?.data?.error?.message;
          throw new Error(
            `Gemini request failed${status ? ` (${status})` : ""}: ${detail ?? (err as Error).message}`
          );
        }
        const delay = 250 * 2 ** attempt + Math.floor(Math.random() * 100);
        logger.warn("llm.http_retry", { model: this.model, status, attempt: attempt + 1, delayMs: delay });
        attempt++;
        await sleep(delay);
      }
    }
  }

  private toResponse(data: any, latencyMs: number, httpRetries: number): LlmResponse {
    const candidate = data?.candidates?.[0];
    const content = candidate?.content ?? { role: "model", parts: [] };
    const parts: any[] = Array.isArray(content.parts) ? content.parts : [];
    const usage = data?.usageMetadata ?? {};
    const promptTokens = Number(usage.promptTokenCount ?? 0);
    const totalTokens = Number(usage.totalTokenCount ?? 0);

    return {
      functionCalls: parts
        .filter((p) => p.functionCall?.name)
        .map((p) => ({
          id: p.functionCall.id,
          name: String(p.functionCall.name),
          args: (p.functionCall.args ?? {}) as Record<string, unknown>,
        })),
      text: parts.map((p) => (typeof p.text === "string" ? p.text : "")).join(""),
      modelTurn: { ...content, role: "model" },
      usage: {
        promptTokens,
        completionTokens: Math.max(0, totalTokens - promptTokens),
        totalTokens,
      },
      latencyMs,
      httpRetries,
      model: this.model,
    };
  }
}
