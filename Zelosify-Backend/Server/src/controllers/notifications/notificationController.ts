import type { Request, Response } from "express";
import { getActor } from "../../helpers/hiring/actor.js";
import { parsePagination, parseUuidParam } from "../../helpers/hiring/requestValidation.js";
import {
  acquireStream,
  releaseStream,
  subscribeToNotifications,
} from "../../services/notifications/notificationEvents.js";
import {
  toNotificationItem,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/notifications/notificationService.js";
import { sendError } from "../../utils/handler/sendError.js";

/** GET /api/v1/notifications?page&limit&unread=true */
export async function getNotifications(req: Request, res: Response) {
  try {
    res.json(await listNotifications(getActor(req), parsePagination(req.query), req.query.unread === "true"));
  } catch (err) {
    sendError(res, err, "notifications.list.failed");
  }
}

/** GET /api/v1/notifications/unread-count */
export async function getNotificationUnreadCount(req: Request, res: Response) {
  try {
    res.json({ unreadCount: await getUnreadCount(getActor(req)) });
  } catch (err) {
    sendError(res, err, "notifications.count.failed");
  }
}

/** POST /api/v1/notifications/:id/read */
export async function readNotification(req: Request, res: Response) {
  try {
    await markNotificationRead(getActor(req), parseUuidParam(req.params.id, "notification id"));
    res.json({ message: "Marked as read" });
  } catch (err) {
    sendError(res, err, "notifications.read.failed");
  }
}

/** POST /api/v1/notifications/read-all */
export async function readAllNotifications(req: Request, res: Response) {
  try {
    res.json({ updated: await markAllNotificationsRead(getActor(req)) });
  } catch (err) {
    sendError(res, err, "notifications.read_all.failed");
  }
}

/**
 * GET /api/v1/notifications/stream (Server-Sent Events)
 *
 * Keeps one connection open per tab and pushes `notification` events the
 * moment a notification for this user is committed. Heartbeat comments keep
 * proxies from closing an idle stream; the browser's EventSource reconnects
 * by itself after network drops.
 */
export function streamNotifications(req: Request, res: Response) {
  let actor;
  try {
    actor = getActor(req);
  } catch (err) {
    sendError(res, err, "notifications.stream.failed");
    return;
  }
  if (!acquireStream(actor.userId)) {
    res.status(429).json({ message: "Too many open notification streams" });
    return;
  }

  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 5000\n\n");
  res.write("event: ready\ndata: {}\n\n");

  const { userId, tenantId } = actor;
  const unsubscribe = subscribeToNotifications(userId, (n) => {
    if (n.userId !== userId || n.tenantId !== tenantId) return; // defence in depth
    res.write(`event: notification\ndata: ${JSON.stringify(toNotificationItem(n))}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    releaseStream(userId);
  });
}
