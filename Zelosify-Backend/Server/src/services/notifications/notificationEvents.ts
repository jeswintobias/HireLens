import { EventEmitter } from "events";
import type { Notification } from "@prisma/client";

/**
 * Live delivery of notifications over Server-Sent Events.
 *
 * Notifications are written to the database in the same transaction as the
 * event that causes them; *after* that transaction commits, they are
 * published here and pushed to the recipient's open browser tabs.
 *
 * In-process bus: correct for one server instance. With several instances,
 * swap the emitter for Redis pub/sub (same publish/subscribe interface).
 */

const bus = new EventEmitter();
bus.setMaxListeners(0);

const channel = (userId: string) => `user:${userId}`;

/** Push a committed notification to its recipient's live connections. */
export function publishNotification(notification: Notification) {
  bus.emit(channel(notification.userId), notification);
}

export function subscribeToNotifications(userId: string, listener: (n: Notification) => void) {
  bus.on(channel(userId), listener);
  return () => {
    bus.off(channel(userId), listener);
  };
}

/** Caps open streams per user (several tabs are fine; hundreds are not). */
export const MAX_STREAMS_PER_USER = 5;
const openStreams = new Map<string, number>();

export function acquireStream(userId: string): boolean {
  const count = openStreams.get(userId) ?? 0;
  if (count >= MAX_STREAMS_PER_USER) return false;
  openStreams.set(userId, count + 1);
  return true;
}

export function releaseStream(userId: string) {
  const count = (openStreams.get(userId) ?? 1) - 1;
  if (count <= 0) openStreams.delete(userId);
  else openStreams.set(userId, count);
}
