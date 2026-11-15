import { Router, type RequestHandler } from "express";
import { authenticateUser } from "../../middlewares/auth/authenticateMiddleware.js";
import {
  getNotificationUnreadCount,
  getNotifications,
  readAllNotifications,
  readNotification,
  streamNotifications,
} from "../../controllers/notifications/notificationController.js";

/**
 * /api/v1/notifications — any signed-in user, own notifications only
 * (recipient + tenant scoping happens in the service).
 */
const router = Router();
router.use(authenticateUser as RequestHandler);

router.get("/", getNotifications);
router.get("/unread-count", getNotificationUnreadCount);
/** Live push (Server-Sent Events): one connection per tab, no polling. */
router.get("/stream", streamNotifications);
router.post("/read-all", readAllNotifications);
router.post("/:id/read", readNotification);

export default router;
