import type { NextFunction, Request, RequestHandler, Response } from "express";
import logger from "../../utils/logger/logger.js";

/**
 * Failed-attempt limiter (brute-force protection) without extra packages.
 *
 * Counts only FAILED responses (e.g. 401 wrong password / wrong TOTP code)
 * per key. After `maxFailures` failures inside `windowMs`, the key is locked
 * for `lockMs` and requests get 429 + Retry-After. A success clears the key.
 *
 * Requests still in flight count as attempts, so firing hundreds of guesses
 * in parallel cannot slip past the limit before the first ones finish.
 *
 * State is in memory (per process). For several server instances, move the
 * store to Redis — the interface stays the same.
 */

export interface AttemptLimiterOptions {
  /** Used in logs and the error message. */
  name: string;
  maxFailures: number;
  windowMs: number;
  lockMs: number;
  /** Response statuses that count as a failed attempt. */
  failureStatuses: number[];
  /** Key(s) to count against; return null/"" to skip limiting. */
  key: (req: Request) => string | null | undefined;
  /** Max tracked keys (oldest dropped first) — bounds memory. */
  maxKeys?: number;
}

interface Entry {
  failures: number;
  inFlight: number;
  windowStart: number;
  lockedUntil: number;
}

export interface AttemptLimiter extends RequestHandler {
  /** Test/ops hook. */
  reset(): void;
  readonly size: number;
}

export function createAttemptLimiter(opts: AttemptLimiterOptions): AttemptLimiter {
  const store = new Map<string, Entry>();
  const maxKeys = opts.maxKeys ?? 50_000;

  const prune = (now: number) => {
    for (const [k, e] of store) {
      if (e.inFlight === 0 && e.lockedUntil <= now && now - e.windowStart > opts.windowMs) store.delete(k);
    }
  };
  const timer = setInterval(() => prune(Date.now()), 60_000);
  timer.unref();

  const middleware = ((req: Request, res: Response, next: NextFunction) => {
    const key = opts.key(req);
    if (!key) return next();
    const now = Date.now();

    let entry = store.get(key);
    if (entry && entry.lockedUntil <= now && now - entry.windowStart > opts.windowMs && entry.inFlight === 0) {
      store.delete(key);
      entry = undefined;
    }

    if (entry && (entry.lockedUntil > now || entry.failures + entry.inFlight >= opts.maxFailures)) {
      const retryAfterSec = Math.max(1, Math.ceil(((entry.lockedUntil > now ? entry.lockedUntil : now + opts.lockMs) - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      logger.warn("security.attempt_limiter.blocked", { limiter: opts.name, ip: req.ip, retryAfterSec });
      res.status(429).json({
        message: `Too many failed attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
      });
      return;
    }

    if (!entry) {
      if (store.size >= maxKeys) store.delete(store.keys().next().value as string);
      entry = { failures: 0, inFlight: 0, windowStart: now, lockedUntil: 0 };
      store.set(key, entry);
    }
    const tracked = entry;
    tracked.inFlight++;

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      tracked.inFlight--;
      // Client aborted before a response was sent: it learned nothing, so it
      // neither counts as a failure nor clears the counter.
      if (!res.writableFinished) return;
      const t = Date.now();
      if (opts.failureStatuses.includes(res.statusCode)) {
        if (t - tracked.windowStart > opts.windowMs) {
          tracked.windowStart = t;
          tracked.failures = 0;
        }
        tracked.failures++;
        if (tracked.failures >= opts.maxFailures) {
          tracked.lockedUntil = t + opts.lockMs;
          logger.warn("security.attempt_limiter.locked", { limiter: opts.name, ip: req.ip, lockMs: opts.lockMs });
        }
      } else if (res.statusCode < 400) {
        store.delete(key); // success clears the counter
      }
    };
    res.on("finish", settle);
    res.on("close", settle);
    next();
  }) as AttemptLimiter;

  middleware.reset = () => store.clear();
  Object.defineProperty(middleware, "size", { get: () => store.size });
  return middleware;
}
