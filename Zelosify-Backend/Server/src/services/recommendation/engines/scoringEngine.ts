/**
 * Deterministic scoring engine (no LLM).
 *
 * FinalScore = 0.5 * skillMatchScore + 0.3 * experienceMatchScore
 *            + 0.2 * locationMatchScore
 */

export const SCORE_WEIGHTS = { skill: 0.5, experience: 0.3, location: 0.2 } as const;

export interface ScoreInput {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
}

export interface ScoreBreakdown extends ScoreInput {
  finalScore: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function computeFinalScore(input: ScoreInput): ScoreBreakdown {
  const skill = clamp01(input.skillMatchScore);
  const experience = clamp01(input.experienceMatchScore);
  const location = clamp01(input.locationMatchScore);
  return {
    skillMatchScore: skill,
    experienceMatchScore: experience,
    locationMatchScore: location,
    finalScore: round4(
      SCORE_WEIGHTS.skill * skill +
        SCORE_WEIGHTS.experience * experience +
        SCORE_WEIGHTS.location * location
    ),
  };
}
