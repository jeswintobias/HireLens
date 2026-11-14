/**
 * Provider-neutral LLM interface used by the agent orchestrator.
 * The Gemini implementation lives in geminiClient.ts; tests inject a fake.
 */

export interface FunctionCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  /** JSON-Schema subset understood by the provider. */
  parameters: Record<string, unknown>;
}

/** Opaque conversation turn; the orchestrator never inspects provider fields. */
export type ConversationTurn = Record<string, unknown>;

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResponse {
  functionCalls: FunctionCall[];
  text: string;
  /** The model turn exactly as returned (kept for thought signatures). */
  modelTurn: ConversationTurn;
  usage: LlmUsage;
  latencyMs: number;
  httpRetries: number;
  /** Model that actually produced this response (may differ on fallback). */
  model: string;
  /** Set when the provider rejected the model's output as a malformed tool call. */
  malformed?: string;
}

export interface LlmRequest {
  systemInstruction: string;
  turns: ConversationTurn[];
  tools: ToolDeclaration[];
}

export interface LlmClient {
  readonly model: string;
  generate(req: LlmRequest): Promise<LlmResponse>;
  userTurn(text: string): ConversationTurn;
  /** One or more provider messages carrying the tool results. */
  toolResultsTurn(
    results: { call: FunctionCall; response: Record<string, unknown> }[]
  ): ConversationTurn | ConversationTurn[];
}
