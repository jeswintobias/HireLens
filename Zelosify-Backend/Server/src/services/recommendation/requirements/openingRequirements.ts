import type { OpeningRequirements } from "../engines/matchingEngine.js";
import { normalizeSkills } from "../engines/skillNormalizer.js";

/**
 * Builds the curated, trusted requirements DTO the agent sees.
 * The LLM never receives raw database models — only these fields.
 *
 * The Opening schema has no skills column, so required skills are read from
 * the "Required skills: a, b, c" line of the description.
 */

export interface OpeningForRequirements {
  title: string;
  description: string | null;
  location: string | null;
  experienceMin: number;
  experienceMax: number | null;
}

export function parseRequiredSkills(description: string | null): string[] {
  if (!description) return [];
  const line = description
    .split("\n")
    .find((l) => /^\s*required skills\s*:/i.test(l));
  if (!line) return [];
  const raw = line.replace(/^\s*required skills\s*:/i, "").split(/[,;]/);
  return normalizeSkills(raw.map((s) => s.trim())).normalized;
}

export function buildOpeningRequirements(o: OpeningForRequirements): OpeningRequirements {
  const location = (o.location ?? "").trim();
  return {
    title: o.title,
    requiredSkills: parseRequiredSkills(o.description),
    experienceMin: o.experienceMin,
    experienceMax: o.experienceMax,
    location,
    workMode: /\bremote\b/i.test(location) ? "remote" : "onsite",
  };
}
