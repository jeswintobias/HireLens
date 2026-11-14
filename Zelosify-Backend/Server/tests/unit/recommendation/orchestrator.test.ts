import { describe, expect, it } from "vitest";
import { sanitizeResumeText } from "../../../src/helpers/hiring/promptInjection";
import { createAgentState } from "../../../src/services/recommendation/agent/agentState";
import { AgentError, runAgent } from "../../../src/services/recommendation/agent/orchestrator";
import type { LlmClient, LlmResponse, FunctionCall } from "../../../src/services/recommendation/llm/llmClient";
import { FakeLlm } from "../../helpers/fakeLlm";
import { resumeLines } from "../../helpers/resumePdf";

const requirements = {
  title: "Backend Engineer",
  requiredSkills: ["Node.js", "TypeScript", "PostgreSQL", "Docker"],
  experienceMin: 3,
  experienceMax: 6,
  location: "Bangalore",
  workMode: "onsite" as const,
};

function stateFor(text: string) {
  return createAgentState({
    requirements,
    fileType: "pdf",
    loadResume: async () => ({ ...sanitizeResumeText(text), parsingMs: 1 }),
  });
}

const strongResume = resumeLines({
  years: 4,
  skills: ["Node.js", "TypeScript", "PostgreSQL", "Docker"],
  location: "Bengaluru",
}).join("\n");

/** LLM that replays a fixed list of responses (for misbehaviour tests). */
function scripted(steps: FunctionCall[][]): LlmClient {
  let i = 0;
  return {
    model: "scripted",
    userTurn: (text) => ({ role: "user", text }),
    toolResultsTurn: (results) => ({ role: "tool", results }),
    async generate(): Promise<LlmResponse> {
      const functionCalls = steps[Math.min(i++, steps.length - 1)];
      return {
        functionCalls, text: "", modelTurn: {}, latencyMs: 1, httpRetries: 0, model: "scripted",
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      };
    },
  };
}

describe("agent orchestrator (LLM ⇄ tool loop)", () => {
  it("runs the full tool workflow and records usage + trace", async () => {
    const state = stateFor(strongResume);
    const usage = await runAgent({ llm: new FakeLlm(), state });

    expect(state.trace.map((t) => t.tool)).toEqual([
      "parse_resume", "normalize_skills", "extract_features", "match_profile", "score_profile", "submit_recommendation",
    ]);
    expect(state.trace.every((t) => t.ok)).toBe(true);
    expect(state.scoreBreakdown).toEqual({
      skillMatchScore: 1, experienceMatchScore: 1, locationMatchScore: 1, finalScore: 1,
    });
    expect(usage).toMatchObject({ llmCalls: 3, totalTokens: 360, models: ["fake-llm"] });
  });

  it("recovers from malformed (non tool-call) replies and counts retries", async () => {
    const state = stateFor(strongResume);
    const usage = await runAgent({ llm: new FakeLlm({ malformedReplies: 2 }), state });
    expect(state.retries).toBe(2);
    expect(usage.llmCalls).toBe(5);
    expect(state.submission).toBeDefined();
  });

  it("gives up after too many malformed replies", async () => {
    const state = stateFor(strongResume);
    await expect(runAgent({ llm: new FakeLlm({ malformedReplies: 10 }), state, maxRetries: 3 })).rejects.toBeInstanceOf(
      AgentError
    );
  });

  it("rejects unknown tools and invalid arguments without executing them", async () => {
    const state = stateFor(strongResume);
    await expect(
      runAgent({
        llm: scripted([
          [{ name: "delete_database", args: {} }],
          [{ name: "extract_features", args: { experienceYears: -5, skills: "nope", location: 1 } }],
        ]),
        state,
        maxRetries: 1,
      })
    ).rejects.toThrow(/Too many invalid tool calls/);
    expect(state.trace[0]).toMatchObject({ tool: "delete_database", ok: false, error: "UNKNOWN_TOOL" });
    expect(state.trace[1].error).toMatch(/^INVALID_ARGUMENTS/);
    expect(state.parsedResume).toBeUndefined();
  });

  it("enforces tool ordering (cannot score or submit before matching)", async () => {
    const state = stateFor(strongResume);
    await expect(
      runAgent({
        llm: scripted([[
          { name: "score_profile", args: {} },
          { name: "submit_recommendation", args: { recommended: true, score: 1, confidence: 1, reason: "Looks great to me", injectionSuspected: false } },
        ]]),
        state,
        maxRetries: 1,
      })
    ).rejects.toThrow();
    expect(state.trace.map((t) => t.error?.split(":")[0])).toEqual(["PRECONDITION_FAILED", "PRECONDITION_FAILED"]);
    expect(state.submission).toBeUndefined();
  });

  it("drops skills the model claims but the resume does not contain", async () => {
    const state = stateFor(resumeLines({ years: 4, skills: ["Node.js"], location: "Bangalore" }).join("\n"));
    await runAgent({
      llm: scripted([
        [{ name: "parse_resume", args: {} }],
        [
          { name: "extract_features", args: { experienceYears: 4, skills: ["Node.js", "TypeScript", "Docker"], location: "Bangalore" } },
          { name: "match_profile", args: {} },
          { name: "score_profile", args: {} },
        ],
        [{ name: "submit_recommendation", args: { recommended: false, score: 0.6, confidence: 0.8, reason: "Partial skill match.", injectionSuspected: false } }],
      ]),
      state,
    });
    expect(state.parsedResume?.normalizedSkills).toEqual(["Node.js"]);
    expect(state.ungroundedSkills).toEqual(["TypeScript", "Docker"]);
    expect(state.featureVector?.skillMatchScore).toBe(0.25);
  });

  it("stops at the deadline", async () => {
    const state = stateFor(strongResume);
    await expect(
      runAgent({ llm: new FakeLlm({ delayMs: 30 }), state, deadlineMs: 10 })
    ).rejects.toThrow(/deadline/);
  });
});
