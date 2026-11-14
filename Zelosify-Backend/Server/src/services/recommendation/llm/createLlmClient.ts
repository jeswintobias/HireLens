import { GeminiClient } from "./geminiClient.js";
import { GroqClient } from "./groqClient.js";
import type { LlmClient } from "./llmClient.js";

/**
 * Selects the LLM provider from LLM_PROVIDER (gemini | groq).
 * Both providers implement the same tool-calling interface, so the agent
 * orchestrator does not change between them.
 */
export function createLlmClient(): LlmClient {
  const provider = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  switch (provider) {
    case "groq":
      return new GroqClient();
    case "gemini":
      return new GeminiClient();
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
  }
}
