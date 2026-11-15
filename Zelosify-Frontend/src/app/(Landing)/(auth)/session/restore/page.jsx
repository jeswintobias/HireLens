"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import axiosInstance from "@/utils/Axios/AxiosInstance";

/**
 * /session/restore?next=/path
 *
 * The route guard sends users here when their access token has expired but a
 * refresh token cookie exists. We renew the session silently and return to
 * the page they asked for; if the session has ended, we go to sign-in.
 */

/** Only same-site relative paths, never "//evil.com" or absolute URLs. */
const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : "/login";

const ATTEMPT_KEY = "session-restore-attempt";

export default function RestoreSessionPage() {
  useEffect(() => {
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));

    // Loop guard: if we were already here moments ago for the same page,
    // the refreshed session still is not accepted, so go to sign-in.
    let recent = null;
    try {
      recent = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || "null");
    } catch {
      /* storage unavailable */
    }
    if (recent && recent.next === next && Date.now() - recent.at < 15_000) {
      try {
        sessionStorage.removeItem(ATTEMPT_KEY);
      } catch {}
      window.location.replace("/login?expired=1");
      return;
    }

    axiosInstance
      .post("/auth/refresh")
      .then(() => {
        try {
          sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ next, at: Date.now() }));
        } catch {}
        window.location.replace(next);
      })
      .catch(() => window.location.replace("/login?expired=1"));
  }, []);

  return (
    <div
      className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg flex flex-col items-center gap-3 text-center"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-6 w-6 animate-spin text-gray-500 dark:text-gray-300" aria-hidden="true" />
      <p className="text-sm text-gray-600 dark:text-gray-300">Restoring your session…</p>
    </div>
  );
}
