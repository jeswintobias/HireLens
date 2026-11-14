import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma/prisma.js";
import { sanitizeResumeText } from "../../helpers/hiring/promptInjection.js";
import {
  MAX_RESUME_SIZE_BYTES,
  getResumeExtension,
} from "../../helpers/hiring/resumeFileTypes.js";
import logger from "../../utils/logger/logger.js";
import { createStorageService } from "../storage/storageFactory.js";
import { createAgentState, type AgentState, type LoadedResume } from "./agent/agentState.js";
import { AgentError, runAgent, type AgentUsage } from "./agent/orchestrator.js";
import { extractResumeText, streamToBuffer } from "./extraction/extractResumeText.js";
import { createLlmClient } from "./llm/createLlmClient.js";
import type { LlmClient } from "./llm/llmClient.js";
import { computeConfidence, decide, type Decision } from "./policy/decisionPolicy.js";
import { buildOpeningRequirements } from "./requirements/openingRequirements.js";
import { validate } from "./validation/schemas.js";

/**
 * Recommendation service:
 *   load profile → build trusted requirements → run agent orchestrator
 *   → validate all outputs → apply decision policy → persist atomically.
 *
 * Idempotent: one RecommendationRun row per (profile, agent version); a
 * completed profile is skipped unless `force` is set, and a re-run replaces
 * the previous result in a single transaction (never a partial write).
 */

export const AGENT_VERSION = "agent-v1.0";
export const LATENCY_SLA_MS = 1500;

let llmClient: LlmClient | null = null;
function getLlm(): LlmClient {
  llmClient ??= createLlmClient();
  return llmClient;
}

/** Test hook: inject a fake LLM client. */
export function setLlmClient(client: LlmClient | null) {
  llmClient = client;
}

export interface RecommendationOutcome {
  profileId: number;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  decision?: Decision;
  finalScore?: number;
  latencyMs?: number;
  reason?: string;
}

function cleanReason(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** Starts downloading + parsing immediately so it overlaps the first LLM call. */
function prefetchResume(s3Key: string, fileType: "pdf" | "pptx"): () => Promise<LoadedResume> {
  const promise = (async () => {
    const t0 = performance.now();
    const stream = await createStorageService().getObjectStream(s3Key);
    const buffer = await streamToBuffer(stream, MAX_RESUME_SIZE_BYTES);
    const raw = await extractResumeText(buffer, fileType);
    const sanitized = sanitizeResumeText(raw);
    if (sanitized.text.length < 20) throw new Error("Resume contains no extractable text");
    return { ...sanitized, parsingMs: Math.round(performance.now() - t0) };
  })();
  promise.catch(() => undefined); // surfaced when the tool awaits it
  return () => promise;
}

function finalize(state: AgentState) {
  const { parsedResume, featureVector, scoreBreakdown, submission, resume } = state;
  if (!resume || !parsedResume || !featureVector || !scoreBreakdown || !submission) {
    throw new Error("Agent finished without a complete result");
  }
  for (const [name, value] of [
    ["parsedResume", parsedResume],
    ["featureVector", featureVector],
    ["scoreBreakdown", scoreBreakdown],
  ] as const) {
    const check = validate(name, value);
    if (!check.valid) throw new Error(`Invalid ${name}: ${check.errors.join("; ")}`);
  }

  const finalScore = scoreBreakdown.finalScore;
  const decision = decide(finalScore);
  const injectionSuspected = resume.suspected || submission.injectionSuspected;
  const completeness =
    [parsedResume.experienceYears > 0, parsedResume.normalizedSkills.length > 0, parsedResume.location !== ""]
      .filter(Boolean).length / 3;

  const confidence = computeConfidence({
    llmConfidence: submission.confidence,
    completeness,
    injectionSuspected,
    retries: state.retries,
    ungroundedSkillCount: state.ungroundedSkills.length,
  });

  let reason = cleanReason(submission.reason);
  if (injectionSuspected) {
    reason = `⚠️ Resume contains text that attempts to manipulate the AI; it was ignored. ${reason}`.slice(0, 400);
  }

  return {
    finalScore,
    decision,
    recommended: decision === "RECOMMENDED",
    confidence,
    reason,
    injectionSuspected,
    llmScoreMismatch: Math.abs(submission.score - finalScore) > 0.005,
    llmRecommendedMismatch: submission.recommended !== (decision === "RECOMMENDED"),
  };
}

const json = (v: unknown) =>
  v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

function runMetadata(state: AgentState, usage: AgentUsage | undefined) {
  return {
    parsingMs: state.resume?.parsingMs ?? null,
    matchingMs: Math.round(state.matchingMs),
    llmMs: usage?.llmMs ?? null,
    llmCalls: usage?.llmCalls ?? 0,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    toolTrace: state.trace as unknown as Prisma.InputJsonValue,
    parsedResume: json(state.parsedResume),
    featureVector: json(state.featureVector),
    scoreBreakdown: json(state.scoreBreakdown),
    injectionSignals: (state.resume?.signals ?? []) as unknown as Prisma.InputJsonValue,
    retries: state.retries,
  };
}

export async function runRecommendation(
  profileId: number,
  opts: { force?: boolean; trigger?: string } = {}
): Promise<RecommendationOutcome> {
  const profile = await prisma.hiringProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true, s3Key: true, isDeleted: true, recommendedAt: true, recommendationVersion: true,
      opening: {
        select: {
          id: true, tenantId: true, title: true, description: true,
          location: true, experienceMin: true, experienceMax: true,
        },
      },
    },
  });

  if (!profile || profile.isDeleted) {
    return { profileId, status: "SKIPPED", reason: "profile missing or deleted" };
  }
  if (!opts.force && profile.recommendedAt && profile.recommendationVersion === AGENT_VERSION) {
    return { profileId, status: "SKIPPED", reason: "already recommended (idempotent)" };
  }
  const fileType = getResumeExtension(profile.s3Key);
  if (!fileType) return { profileId, status: "SKIPPED", reason: "unsupported file type" };

  const llm = getLlm();
  const startedAt = new Date();
  const t0 = performance.now();
  const ctx = {
    profileId, openingId: profile.opening.id, tenantId: profile.opening.tenantId,
    version: AGENT_VERSION, trigger: opts.trigger ?? "auto",
  };
  logger.info("recommendation.started", { ...ctx, model: llm.model, startedAt: startedAt.toISOString() });

  const runModel = () => (usage?.models.length ? usage.models.join(",") : llm.model);
  let usage: AgentUsage | undefined;

  await prisma.recommendationRun.upsert({
    where: { profileId_version: { profileId, version: AGENT_VERSION } },
    create: { profileId, version: AGENT_VERSION, status: "RUNNING", model: llm.model, startedAt },
    update: { status: "RUNNING", model: llm.model, startedAt, completedAt: null, error: null, attempt: { increment: 1 } },
  });

  const state = createAgentState({
    requirements: buildOpeningRequirements(profile.opening),
    fileType,
    loadResume: prefetchResume(profile.s3Key, fileType),
  });

  try {
    usage = await runAgent({ llm, state, logContext: ctx });
    if (state.resume) logger.info("recommendation.parsed", { ...ctx, parsingMs: state.resume.parsingMs, characters: state.resume.text.length, injectionSuspected: state.resume.suspected });
    logger.info("recommendation.matched", { ...ctx, matchingMs: Math.round(state.matchingMs * 1000) / 1000, featureVector: state.featureVector });

    const result = finalize(state);
    const latencyMs = Math.round(performance.now() - t0);
    const completedAt = new Date();

    await prisma.$transaction([
      prisma.hiringProfile.update({
        where: { id: profileId },
        data: {
          recommended: result.recommended,
          recommendationScore: result.finalScore,
          recommendationConfidence: result.confidence,
          recommendationReason: result.reason,
          recommendationLatencyMs: latencyMs,
          recommendationVersion: AGENT_VERSION,
          recommendedAt: completedAt,
        },
      }),
      prisma.recommendationRun.update({
        where: { profileId_version: { profileId, version: AGENT_VERSION } },
        data: {
          status: "SUCCEEDED", completedAt, latencyMs, model: runModel(),
          decision: result.decision, injectionSuspected: result.injectionSuspected,
          ...runMetadata(state, usage),
        },
      }),
    ]);

    logger.info("recommendation.completed", {
      ...ctx, finalScore: result.finalScore, decision: result.decision, confidence: result.confidence,
      latencyMs, slaBreached: latencyMs > LATENCY_SLA_MS, models: usage.models, llmCalls: usage.llmCalls, llmMs: usage.llmMs,
      totalTokens: usage.totalTokens, retries: state.retries, injectionSuspected: result.injectionSuspected,
      llmScoreMismatch: result.llmScoreMismatch, llmRecommendedMismatch: result.llmRecommendedMismatch,
    });
    return { profileId, status: "SUCCEEDED", decision: result.decision, finalScore: result.finalScore, latencyMs };
  } catch (error) {
    const latencyMs = Math.round(performance.now() - t0);
    usage ??= error instanceof AgentError ? error.usage : undefined;
    const message = (error as Error).message.slice(0, 1000);
    logger.error("recommendation.failed", { ...ctx, latencyMs, error, retries: state.retries, llmCalls: usage?.llmCalls });
    await prisma.recommendationRun
      .update({
        where: { profileId_version: { profileId, version: AGENT_VERSION } },
        data: { status: "FAILED", completedAt: new Date(), latencyMs, model: runModel(), error: message, ...runMetadata(state, usage) },
      })
      .catch((e) => logger.error("recommendation.run_update_failed", { ...ctx, error: e }));
    return { profileId, status: "FAILED", latencyMs, reason: message };
  }
}
