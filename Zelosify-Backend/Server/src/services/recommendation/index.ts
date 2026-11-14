import prisma from "../../config/prisma/prisma.js";
import logger from "../../utils/logger/logger.js";
import { onProfilesSubmitted } from "../hiring/profileEvents.js";
import { recommendationQueue } from "./recommendationQueue.js";
import { AGENT_VERSION } from "./recommendationService.js";

/**
 * Wires the AI recommendation agent into the app:
 * - automatic trigger when an IT vendor submits profiles
 * - recovery of profiles that were submitted but never scored (e.g. the
 *   server restarted mid-run), so no submission is silently lost
 */

export async function recoverPendingRecommendations(limit = 200) {
  const pending = await prisma.hiringProfile.findMany({
    where: {
      isDeleted: false,
      status: "SUBMITTED",
      OR: [{ recommendedAt: null }, { recommendationVersion: { not: AGENT_VERSION } }],
    },
    select: { id: true },
    orderBy: { submittedAt: "asc" },
    take: limit,
  });
  if (pending.length > 0) {
    recommendationQueue.enqueue(pending.map((p) => p.id), { trigger: "recovery" });
  }
  return pending.length;
}

export function initRecommendationAgent() {
  onProfilesSubmitted((profileIds) => recommendationQueue.enqueue(profileIds, { trigger: "auto" }));

  setTimeout(() => {
    recoverPendingRecommendations()
      .then((count) => logger.info("recommendation.recovery.done", { enqueued: count }))
      .catch((error) => logger.error("recommendation.recovery.failed", { error }));
  }, 3000).unref();

  logger.info("recommendation.agent.ready", {
    version: AGENT_VERSION,
    provider: process.env.LLM_PROVIDER ?? "gemini",
  });
}

export { recommendationQueue } from "./recommendationQueue.js";
export { runRecommendation, AGENT_VERSION } from "./recommendationService.js";
