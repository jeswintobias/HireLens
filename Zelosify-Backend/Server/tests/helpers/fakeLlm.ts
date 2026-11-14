import type {
  ConversationTurn,
  FunctionCall,
  LlmClient,
  LlmRequest,
  LlmResponse,
} from "../../src/services/recommendation/llm/llmClient";

/**
 * Deterministic stand-in for Gemini/Groq that speaks the same tool-calling
 * protocol. It reads the tool results it gets back (just like the real model)
 * and follows the documented workflow:
 *
 *   turn 1: parse_resume
 *   turn 2: normalize_skills + extract_features + match_profile + score_profile
 *   turn 3: submit_recommendation (score copied from score_profile)
 *
 * `delayMs` simulates network/model time per call; `overrides` let a test
 * make the model misbehave (e.g. claim a perfect score).
 */
export interface FakeLlmOptions {
  delayMs?: number;
  /** Change the submit_recommendation arguments (e.g. a lying model). */
  submitOverride?: (args: Record<string, unknown>) => Record<string, unknown>;
  /** Number of initial replies that contain no tool call (malformed output). */
  malformedReplies?: number;
}

type ToolTurn = { role: "tool"; results: { name: string; response: Record<string, any> }[] };

export class FakeLlm implements LlmClient {
  readonly model = "fake-llm";
  calls = 0;
  private malformedLeft: number;

  constructor(private readonly opts: FakeLlmOptions = {}) {
    this.malformedLeft = opts.malformedReplies ?? 0;
  }

  userTurn(text: string): ConversationTurn {
    return { role: "user", text };
  }

  toolResultsTurn(results: { call: FunctionCall; response: Record<string, unknown> }[]) {
    return { role: "tool", results: results.map((r) => ({ name: r.call.name, response: r.response })) };
  }

  async generate(req: LlmRequest): Promise<LlmResponse> {
    this.calls++;
    const started = performance.now();
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));

    const respond = (functionCalls: FunctionCall[], text = ""): LlmResponse => ({
      functionCalls,
      text,
      modelTurn: { role: "model", functionCalls },
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
      latencyMs: Math.round(performance.now() - started),
      httpRetries: 0,
      model: this.model,
    });

    if (this.malformedLeft > 0) {
      this.malformedLeft--;
      return respond([], "Sure! The candidate looks great.");
    }

    const results = (req.turns as ConversationTurn[])
      .filter((t): t is ToolTurn => (t as ToolTurn).role === "tool")
      .flatMap((t) => t.results);
    const last = (name: string) => [...results].reverse().find((r) => r.name === name)?.response;

    const parsed = last("parse_resume");
    if (!parsed) return respond([{ name: "parse_resume", args: {} }]);

    const scored = last("score_profile");
    if (!scored || scored.error) {
      const facts = readFacts(String(parsed.resume ?? ""));
      return respond([
        { name: "normalize_skills", args: { skills: facts.skills } },
        { name: "extract_features", args: { ...facts, education: [], keywords: [] } },
        { name: "match_profile", args: facts },
        { name: "score_profile", args: {} },
      ]);
    }

    const finalScore = Number(scored.finalScore);
    const injection = /ignore|must be recommended|score of 1/i.test(String(parsed.resume));
    let args: Record<string, unknown> = {
      recommended: finalScore >= 0.75,
      score: finalScore,
      confidence: 0.9,
      reason: `Deterministic breakdown: skills ${scored.skillMatchScore}, experience ${scored.experienceMatchScore}, location ${scored.locationMatchScore}.`,
      injectionSuspected: injection,
    };
    if (this.opts.submitOverride) args = this.opts.submitOverride(args);
    return respond([{ name: "submit_recommendation", args }]);
  }
}

/** Reads "Experience: N years", "Skills: a, b", "Location: X" lines. */
function readFacts(resume: string) {
  const years = Number(/experience:\s*([\d.]+)/i.exec(resume)?.[1] ?? 0);
  const skills = (/skills:\s*(.+)/i.exec(resume)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const location = (/location:\s*(.+)/i.exec(resume)?.[1] ?? "").trim();
  return { experienceYears: years, skills, location };
}
