import logger from "../../utils/logger/logger.js";
import { runRecommendation, type RecommendationOutcome } from "./recommendationService.js";

/**
 * In-process async job queue for recommendations.
 *
 * - Runs outside the request cycle, so uploads return immediately.
 * - Bounded concurrency protects the LLM rate limit and the event loop.
 * - De-duplicates: a profile already queued or running is not added again.
 */

type Job = { profileId: number; force: boolean; trigger: string; enqueuedAt: number };

export class RecommendationQueue {
  private readonly pending: Job[] = [];
  private readonly inFlight = new Set<number>();
  private readonly queued = new Set<number>();
  private idleWaiters: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly worker: (id: number, opts: { force: boolean; trigger: string }) => Promise<RecommendationOutcome> = runRecommendation
  ) {}

  enqueue(profileIds: number[], opts: { force?: boolean; trigger?: string } = {}) {
    for (const profileId of profileIds) {
      if (this.queued.has(profileId) || this.inFlight.has(profileId)) continue;
      this.queued.add(profileId);
      this.pending.push({ profileId, force: !!opts.force, trigger: opts.trigger ?? "auto", enqueuedAt: Date.now() });
    }
    logger.info("recommendation.queue.enqueued", { profileIds, pending: this.pending.length, running: this.inFlight.size });
    this.drain();
  }

  isQueuedOrRunning(profileId: number) {
    return this.queued.has(profileId) || this.inFlight.has(profileId);
  }

  get size() {
    return { pending: this.pending.length, running: this.inFlight.size };
  }

  /** Resolves when nothing is pending or running (used by tests). */
  onIdle(): Promise<void> {
    if (this.pending.length === 0 && this.inFlight.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private drain() {
    while (this.inFlight.size < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.queued.delete(job.profileId);
      this.inFlight.add(job.profileId);
      const queueWaitMs = Date.now() - job.enqueuedAt;

      this.worker(job.profileId, { force: job.force, trigger: job.trigger })
        .then((outcome) => logger.info("recommendation.queue.job_done", { ...outcome, queueWaitMs }))
        .catch((error) => logger.error("recommendation.queue.job_crashed", { profileId: job.profileId, error }))
        .finally(() => {
          this.inFlight.delete(job.profileId);
          this.drain();
          if (this.pending.length === 0 && this.inFlight.size === 0) {
            this.idleWaiters.forEach((r) => r());
            this.idleWaiters = [];
          }
        });
    }
  }
}

export const recommendationQueue = new RecommendationQueue(
  Math.max(1, Number(process.env.RECOMMENDATION_CONCURRENCY ?? 2))
);
