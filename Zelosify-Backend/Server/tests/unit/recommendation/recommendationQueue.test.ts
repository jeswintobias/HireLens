import { describe, expect, it } from "vitest";
import { RecommendationQueue } from "../../../src/services/recommendation/recommendationQueue";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("recommendation queue", () => {
  it("never runs more than `concurrency` jobs at once", async () => {
    let running = 0;
    let peak = 0;
    const queue = new RecommendationQueue(2, async (profileId) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(10);
      running--;
      return { profileId, status: "SUCCEEDED" };
    });
    queue.enqueue([1, 2, 3, 4, 5, 6]);
    await queue.onIdle();
    expect(peak).toBe(2);
  });

  it("de-duplicates a profile that is already queued or running", async () => {
    const seen: number[] = [];
    const queue = new RecommendationQueue(1, async (profileId) => {
      seen.push(profileId);
      await sleep(10);
      return { profileId, status: "SUCCEEDED" };
    });
    queue.enqueue([7, 8]);
    queue.enqueue([7, 8, 7]); // 7 running, 8 queued → both ignored
    expect(queue.isQueuedOrRunning(8)).toBe(true);
    await queue.onIdle();
    expect(seen).toEqual([7, 8]);
  });

  it("keeps processing after a job crashes", async () => {
    const done: number[] = [];
    const queue = new RecommendationQueue(1, async (profileId) => {
      if (profileId === 1) throw new Error("boom");
      done.push(profileId);
      return { profileId, status: "SUCCEEDED" };
    });
    queue.enqueue([1, 2]);
    await queue.onIdle();
    expect(done).toEqual([2]);
  });

  it("passes force/trigger through to the worker", async () => {
    const calls: unknown[] = [];
    const queue = new RecommendationQueue(1, async (profileId, opts) => {
      calls.push({ profileId, ...opts });
      return { profileId, status: "SUCCEEDED" };
    });
    queue.enqueue([3], { force: true, trigger: "manual_rerun" });
    await queue.onIdle();
    expect(calls).toEqual([{ profileId: 3, force: true, trigger: "manual_rerun" }]);
  });
});
