import logger from "../../utils/logger/logger.js";

/**
 * Hook fired after profiles are committed with status SUBMITTED.
 *
 * Decouples the vendor upload flow from the AI recommendation pipeline:
 * the upload API returns immediately and recommendation runs asynchronously.
 * The recommendation service registers its handler here (Phase 3).
 */

type SubmittedHandler = (profileIds: number[]) => void | Promise<void>;

let submittedHandler: SubmittedHandler | null = null;

export function onProfilesSubmitted(handler: SubmittedHandler) {
  submittedHandler = handler;
}

/** Fire-and-forget: never blocks or fails the caller. */
export function emitProfilesSubmitted(profileIds: number[]) {
  if (profileIds.length === 0) return;
  if (!submittedHandler) {
    logger.warn("profiles.submitted.no_handler", { profileIds });
    return;
  }
  const handler = submittedHandler;
  setImmediate(() => {
    Promise.resolve(handler(profileIds)).catch((error) =>
      logger.error("profiles.submitted.handler_failed", { profileIds, error })
    );
  });
}
