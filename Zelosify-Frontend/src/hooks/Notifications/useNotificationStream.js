import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import axiosInstance from "@/utils/Axios/AxiosInstance";
import { notificationReceived } from "@/redux/features/Notifications/notificationsSlice";

/**
 * Live notifications over Server-Sent Events (GET /notifications/stream).
 *
 * The backend pushes each notification the moment it is committed:
 *   - the unread badge and the Notifications tab update instantly
 *   - one small card appears (auto-dismisses after a few seconds)
 *   - open opening pages refresh themselves (see selectLastReceivedNotification)
 *
 * The browser's EventSource reconnects by itself after network drops; if
 * the stream is refused (e.g. the access token expired), the session is
 * refreshed and the stream reopened with growing back-off.
 */
const useNotificationStream = (enabled) => {
  const dispatch = useDispatch();
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !("EventSource" in window)) return undefined;

    let source = null;
    let retryTimer = null;
    let attempt = 0;
    let stopped = false;

    const connect = () => {
      source = new EventSource(`${process.env.NEXT_PUBLIC_BACKEND_URL}/notifications/stream`, {
        withCredentials: true,
      });

      source.addEventListener("ready", () => {
        attempt = 0;
      });

      source.addEventListener("notification", (event) => {
        let item;
        try {
          item = JSON.parse(event.data);
        } catch {
          return;
        }
        dispatch(notificationReceived(item));
        toast(item.title, {
          description: item.message,
          duration: 8000,
          ...(item.link ? { action: { label: "View", onClick: () => router.push(item.link) } } : {}),
        });
      });

      source.onerror = () => {
        // CONNECTING = the browser is already retrying; CLOSED = refused (e.g. 401).
        if (source.readyState !== EventSource.CLOSED || stopped) return;
        source.close();
        const delay = Math.min(30_000, 2_000 * 2 ** attempt++);
        retryTimer = setTimeout(async () => {
          await axiosInstance.post("/auth/refresh").catch(() => undefined);
          if (!stopped) connect();
        }, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [enabled, dispatch, router]);
};

export default useNotificationStream;
