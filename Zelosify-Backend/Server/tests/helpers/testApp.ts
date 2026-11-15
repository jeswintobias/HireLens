import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import type { Server } from "http";
import vendorRoutes from "../../src/routers/vendor/vendorRoutes";
import hiringManagerRoutes from "../../src/routers/hiring/hiringManagerRoutes";
import localAuthRoutes from "../../src/routers/auth/local/localAuthRoutes";
import notificationRoutes from "../../src/routers/notifications/notificationRoutes";

/**
 * The production routers (with the real authenticate + authorize
 * middlewares) mounted exactly like src/index.ts, on a random local port.
 * Keycloak's session middleware is left out: these APIs use bearer tokens.
 */
export async function startTestServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1/auth", localAuthRoutes);
  app.use("/api/v1/vendor", vendorRoutes);
  app.use("/api/v1/hiring-manager", hiringManagerRoutes);
  app.use("/api/v1/notifications", notificationRoutes);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  const request = async (
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {}
  ) => {
    const headers: Record<string, string> = { ...opts.headers };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    let body: BodyInit | undefined;
    if (opts.form) body = opts.form;
    else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("application/json") ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data: data as any, headers: res.headers };
  };

  /** Opens the notification stream (SSE) and collects events until aborted. */
  const openStream = async (token: string) => {
    const controller = new AbortController();
    const events: { event: string; data: any }[] = [];
    const res = await fetch(`${baseUrl}/notifications/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status !== 200) return { status: res.status, events, close: () => controller.abort() };
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const event = /^event: (.+)$/m.exec(block)?.[1];
            const data = /^data: (.+)$/m.exec(block)?.[1];
            if (event) events.push({ event, data: data ? JSON.parse(data) : null });
          }
        }
      } catch {
        /* aborted */
      }
    })();
    return { status: res.status, events, close: () => controller.abort() };
  };

  return {
    request,
    openStream,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
