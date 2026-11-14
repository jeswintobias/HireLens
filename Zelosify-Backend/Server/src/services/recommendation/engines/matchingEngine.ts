import { aliasesOf, normalizeSkills } from "./skillNormalizer.js";

/**
 * Deterministic matching engine (no LLM). Implements the task's rules:
 *
 * Experience: candidate < min → 0 · within range → 1 · above max → 0.8
 * Skills:     overlap / requiredSkills
 * Location:   remote opening → 1 · exact city match → 1 · onsite mismatch → 0.5
 */

export interface OpeningRequirements {
  title: string;
  requiredSkills: string[];
  experienceMin: number;
  experienceMax: number | null;
  location: string;
  workMode: "remote" | "onsite";
}

export interface FeatureInput {
  experienceYears: number;
  skills: string[];
  location: string;
}

export interface FeatureVector extends FeatureInput {
  skillMatchScore: number;
  experienceMatchScore: number;
  locationMatchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function experienceMatchScore(
  years: number,
  min: number,
  max: number | null
): number {
  if (years < min) return 0;
  if (max !== null && years > max) return 0.8;
  return 1;
}

export function skillMatch(candidateSkills: string[], requiredSkills: string[]) {
  const required = normalizeSkills(requiredSkills).normalized;
  const have = new Set(
    normalizeSkills(candidateSkills).normalized.map((s) => s.toLowerCase())
  );
  if (required.length === 0) {
    return { score: 1, matched: [] as string[], missing: [] as string[] };
  }
  const matched = required.filter((s) => have.has(s.toLowerCase()));
  const missing = required.filter((s) => !have.has(s.toLowerCase()));
  return { score: round4(matched.length / required.length), matched, missing };
}

const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  bombay: "mumbai",
  madras: "chennai",
  gurgaon: "gurugram",
  calcutta: "kolkata",
  trivandrum: "thiruvananthapuram",
  cochin: "kochi",
};

function normalizePlace(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `;
  for (const [alias, city] of Object.entries(CITY_ALIASES)) {
    t = t.replace(new RegExp(`\\b${alias}\\b`, "g"), city);
  }
  return t;
}

export function locationMatchScore(
  candidateLocation: string,
  openingLocation: string,
  workMode: "remote" | "onsite"
): number {
  if (workMode === "remote") return 1;
  const city = normalizePlace(openingLocation).trim();
  if (!city || !candidateLocation.trim()) return 0.5;
  return normalizePlace(candidateLocation).includes(` ${city} `) ? 1 : 0.5;
}

export function computeFeatureVector(
  input: FeatureInput,
  req: OpeningRequirements
): FeatureVector {
  const skills = skillMatch(input.skills, req.requiredSkills);
  return {
    experienceYears: input.experienceYears,
    skills: normalizeSkills(input.skills).normalized,
    location: input.location,
    skillMatchScore: skills.score,
    experienceMatchScore: experienceMatchScore(
      input.experienceYears,
      req.experienceMin,
      req.experienceMax
    ),
    locationMatchScore: locationMatchScore(input.location, req.location, req.workMode),
    matchedSkills: skills.matched,
    missingSkills: skills.missing,
  };
}

/**
 * Grounding check: keeps only skills that actually appear in the resume text.
 * Stops the LLM (or an injected instruction) from adding skills the
 * candidate never listed.
 */
export function groundSkills(skills: string[], resumeText: string) {
  const haystack = ` ${resumeText.toLowerCase().replace(/\s+/g, " ")} `;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const grounded: string[] = [];
  const ungrounded: string[] = [];
  for (const skill of skills) {
    const variants = [skill, ...aliasesOf(skill)].map((v) => v.toLowerCase());
    const found = variants.some((v) =>
      new RegExp(`(^|[^a-z0-9])${escape(v)}($|[^a-z0-9])`).test(haystack)
    );
    (found ? grounded : ungrounded).push(skill);
  }
  return { grounded, ungrounded };
}
