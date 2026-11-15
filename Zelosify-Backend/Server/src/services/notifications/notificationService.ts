import { Prisma, type NotificationType } from "@prisma/client";
import prisma from "../../config/prisma/prisma.js";
import type { Actor, PaginatedResult } from "../../types/hiring.js";
import type { Pagination } from "../../helpers/hiring/requestValidation.js";
import { HttpError } from "../../utils/errors/httpError.js";

/**
 * In-app notifications (a "Notifications" tab, no pop-ups):
 *   - hiring manager ← "N new profiles submitted for <opening>"
 *   - IT vendor      ← "<file> was shortlisted / rejected for <opening>"
 *
 * Notifications are created inside the same Prisma transaction as the event
 * that causes them, so a decision is never saved without its notification
 * (or the other way round). Every read is scoped to the recipient + tenant.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  openingId: string | null;
  profileId: number | null;
  read: boolean;
  createdAt: Date;
}

export function notifyProfilesSubmitted(
  db: Db,
  input: { tenantId: string; hiringManagerId: string; openingId: string; openingTitle: string; count: number }
) {
  const plural = input.count === 1 ? "profile" : "profiles";
  return db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.hiringManagerId,
      type: "PROFILES_SUBMITTED",
      title: `${input.count} new ${plural} for ${input.openingTitle}`,
      message: `A vendor submitted ${input.count} candidate ${plural}. AI recommendations are being prepared.`,
      link: `/hiring-manager/openings/${input.openingId}`,
      openingId: input.openingId,
    },
  });
}

export function notifyDecision(
  db: Db,
  input: {
    tenantId: string;
    vendorUserId: string;
    openingId: string;
    openingTitle: string;
    profileId: number;
    fileName: string;
    decision: "SHORTLISTED" | "REJECTED";
  }
) {
  const word = input.decision === "SHORTLISTED" ? "shortlisted" : "rejected";
  return db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.vendorUserId,
      type: input.decision === "SHORTLISTED" ? "PROFILE_SHORTLISTED" : "PROFILE_REJECTED",
      title: `Candidate ${word} for ${input.openingTitle}`,
      message: `${input.fileName} was ${word} by the hiring manager.`,
      link: `/vendor/openings/${input.openingId}`,
      openingId: input.openingId,
      profileId: input.profileId,
    },
  });
}

const own = (actor: Actor): Prisma.NotificationWhereInput => ({ userId: actor.userId, tenantId: actor.tenantId });

export const toNotificationItem = (n: Prisma.NotificationGetPayload<object>): NotificationItem => ({
  id: n.id,
  type: n.type,
  title: n.title,
  message: n.message,
  link: n.link,
  openingId: n.openingId,
  profileId: n.profileId,
  read: n.readAt !== null,
  createdAt: n.createdAt,
});

export async function listNotifications(
  actor: Actor,
  { page, limit, skip }: Pagination,
  unreadOnly = false
): Promise<PaginatedResult<NotificationItem> & { unreadCount: number }> {
  const where: Prisma.NotificationWhereInput = { ...own(actor), ...(unreadOnly ? { readAt: null } : {}) };
  const [total, rows, unreadCount] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip, take: limit }),
    prisma.notification.count({ where: { ...own(actor), readAt: null } }),
  ]);
  return {
    data: rows.map(toNotificationItem),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    unreadCount,
  };
}

export function getUnreadCount(actor: Actor) {
  return prisma.notification.count({ where: { ...own(actor), readAt: null } });
}

export async function markNotificationRead(actor: Actor, id: string) {
  const { count } = await prisma.notification.updateMany({
    where: { id, ...own(actor), readAt: null },
    data: { readAt: new Date() },
  });
  if (count === 0) {
    // Already read is fine; anything else is not found (incl. someone else's).
    const exists = await prisma.notification.count({ where: { id, ...own(actor) } });
    if (!exists) throw HttpError.notFound("Notification not found");
  }
}

export async function markAllNotificationsRead(actor: Actor) {
  const { count } = await prisma.notification.updateMany({
    where: { ...own(actor), readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
