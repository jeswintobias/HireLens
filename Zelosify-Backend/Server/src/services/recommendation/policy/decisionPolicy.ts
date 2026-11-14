/**
 * Decision policy: turns the deterministic score into a decision and a
 * confidence value. The LLM's suggestion never overrides these rules.
 *
 *   score ≥ 0.75        → RECOMMENDED
 *   0.50 ≤ score < 0.75 → BORDERLINE
 *   score < 0.50        → NOT_RECOMMENDED
 */

export type Decision = "RECOMMENDED" | "BORDERLINE" | "NOT_RECOMMENDED";

export const THRESHOLDS = { recommended: 0.75, borderline: 0.5 } as const;

export function decide(finalScore: number): Decision {
  if (finalScore >= THRESHOLDS.recommended) return "RECOMMENDED";
  if (finalScore >= THRESHOLDS.borderline) return "BORDERLINE";
  return "NOT_RECOMMENDED";
}

export interface ConfidenceInput {
  /** Agent's self-assessed confidence (0..1), already schema-validated. */
  llmConfidence: number;
  /** Fraction of key fields found in the resume (experience, skills, location). */
  completeness: number;
  injectionSuspected: boolean;
  /** Malformed-output retries spent in this run. */
  retries: number;
  /** Skills the LLM listed that were not found in the resume text. */
  ungroundedSkillCount: number;
}

/**
 * Confidence = agent confidence, scaled by data completeness, and reduced for
 * prompt-injection signals, retries and ungrounded (hallucinated) skills.
 */
export function computeConfidence(i: ConfidenceInput): number {
  let c = Math.min(1, Math.max(0, i.llmConfidence));
  c *= 0.6 + 0.4 * Math.min(1, Math.max(0, i.completeness));
  if (i.injectionSuspected) c = Math.min(c * 0.5, 0.5);
  c *= Math.pow(0.95, i.retries);
  c *= Math.pow(0.9, Math.min(i.ungroundedSkillCount, 5));
  return Math.round(c * 100) / 100;
}
