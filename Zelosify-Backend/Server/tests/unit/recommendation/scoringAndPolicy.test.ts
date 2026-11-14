import { describe, expect, it } from "vitest";
import { SCORE_WEIGHTS, computeFinalScore } from "../../../src/services/recommendation/engines/scoringEngine";
import { THRESHOLDS, computeConfidence, decide } from "../../../src/services/recommendation/policy/decisionPolicy";

describe("score formula correctness", () => {
  it("weights are 0.5 / 0.3 / 0.2 and sum to 1", () => {
    expect(SCORE_WEIGHTS).toEqual({ skill: 0.5, experience: 0.3, location: 0.2 });
    expect(SCORE_WEIGHTS.skill + SCORE_WEIGHTS.experience + SCORE_WEIGHTS.location).toBeCloseTo(1);
  });

  it.each([
    // skill, experience, location, expected
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [1, 0, 0, 0.5],
    [0, 1, 0, 0.3],
    [0, 0, 1, 0.2],
    [0.75, 1, 0.5, 0.775], // 0.375 + 0.3 + 0.1
    [0.5, 0.8, 0.5, 0.59], // 0.25 + 0.24 + 0.1
    [0.3333, 1, 1, 0.6667],
  ])("FinalScore(%s, %s, %s) = %s", (s, e, l, expected) => {
    expect(
      computeFinalScore({ skillMatchScore: s, experienceMatchScore: e, locationMatchScore: l }).finalScore
    ).toBe(expected);
  });

  it("is deterministic (same input → same output)", () => {
    const input = { skillMatchScore: 0.61, experienceMatchScore: 0.8, locationMatchScore: 0.5 };
    const results = new Set(Array.from({ length: 50 }, () => computeFinalScore(input).finalScore));
    expect(results.size).toBe(1);
  });

  it("clamps out-of-range inputs into [0, 1]", () => {
    const r = computeFinalScore({ skillMatchScore: 7, experienceMatchScore: -2, locationMatchScore: 1 });
    expect(r).toEqual({ skillMatchScore: 1, experienceMatchScore: 0, locationMatchScore: 1, finalScore: 0.7 });
  });
});

describe("decision thresholds", () => {
  it.each([
    [1, "RECOMMENDED"],
    [THRESHOLDS.recommended, "RECOMMENDED"],
    [0.7499, "BORDERLINE"],
    [THRESHOLDS.borderline, "BORDERLINE"],
    [0.4999, "NOT_RECOMMENDED"],
    [0, "NOT_RECOMMENDED"],
  ])("score %s → %s", (score, decision) => {
    expect(decide(score)).toBe(decision);
  });
});

describe("confidence policy", () => {
  const base = { llmConfidence: 0.9, completeness: 1, injectionSuspected: false, retries: 0, ungroundedSkillCount: 0 };

  it("keeps the model's confidence when data is complete and clean", () => {
    expect(computeConfidence(base)).toBe(0.9);
  });

  it("is capped at 0.5 when prompt injection is suspected", () => {
    expect(computeConfidence({ ...base, llmConfidence: 1, injectionSuspected: true })).toBeLessThanOrEqual(0.5);
  });

  it("drops with missing data, retries and hallucinated skills", () => {
    const c = computeConfidence(base);
    expect(computeConfidence({ ...base, completeness: 1 / 3 })).toBeLessThan(c);
    expect(computeConfidence({ ...base, retries: 2 })).toBeLessThan(c);
    expect(computeConfidence({ ...base, ungroundedSkillCount: 3 })).toBeLessThan(c);
  });

  it("stays within [0, 1] for out-of-range model output", () => {
    expect(computeConfidence({ ...base, llmConfidence: 5 })).toBeLessThanOrEqual(1);
    expect(computeConfidence({ ...base, llmConfidence: -1 })).toBe(0);
  });
});
