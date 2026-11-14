import type { InjectionSignal } from "../../../helpers/hiring/promptInjection.js";
import type { ResumeExtension } from "../../../helpers/hiring/resumeFileTypes.js";
import type { FeatureVector, OpeningRequirements } from "../engines/matchingEngine.js";
import type { ScoreBreakdown } from "../engines/scoringEngine.js";

/**
 * Internal reasoning state of one agent run. Tools read and write it; the
 * LLM only ever sees what tools choose to return.
 */

export interface LoadedResume {
  text: string;
  truncated: boolean;
  suspected: boolean;
  signals: InjectionSignal[];
  parsingMs: number;
}

export interface ParsedResume {
  experienceYears: number;
  skills: string[];
  normalizedSkills: string[];
  location: string;
  education: string[];
  keywords: string[];
}

export interface Submission {
  recommended: boolean;
  score: number;
  confidence: number;
  reason: string;
  injectionSuspected: boolean;
  injectionNotes?: string;
}

export interface ToolTraceEntry {
  turn: number;
  tool: string;
  ok: boolean;
  durationMs: number;
  error?: string;
  notes?: Record<string, unknown>;
}

export interface AgentState {
  readonly requirements: OpeningRequirements;
  readonly fileType: ResumeExtension;
  /** Loads + sanitizes the resume (may already be in flight: prefetch). */
  readonly loadResume: () => Promise<LoadedResume>;

  resume?: LoadedResume;
  parsedResume?: ParsedResume;
  ungroundedSkills: string[];
  featureVector?: FeatureVector;
  scoreBreakdown?: ScoreBreakdown;
  submission?: Submission;

  turn: number;
  retries: number;
  matchingMs: number;
  trace: ToolTraceEntry[];
}

export function createAgentState(init: {
  requirements: OpeningRequirements;
  fileType: ResumeExtension;
  loadResume: () => Promise<LoadedResume>;
}): AgentState {
  return { ...init, ungroundedSkills: [], turn: 0, retries: 0, matchingMs: 0, trace: [] };
}

/** Error a tool returns to the LLM so it can correct itself and retry. */
export class ToolError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ToolError";
  }
}
