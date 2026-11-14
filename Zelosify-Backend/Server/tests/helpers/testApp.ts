import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import type { Server } from "http";
import vendorRoutes from "../../src/routers/vendor/vendorRoutes";
import hiringManagerRoutes from "../../src/routers/hiring/hiringManagerRoutes";
import localAuthRoutes from "../../src/routers/auth/local/localAuthRoutes";

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

  return {
    request,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
