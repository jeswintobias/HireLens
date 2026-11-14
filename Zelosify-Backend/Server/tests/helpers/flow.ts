import type { startTestServer } from "./testApp";

type Api = Awaited<ReturnType<typeof startTestServer>>["request"];

/** Vendor flow as the frontend does it: presign → multipart upload with tokens. */
export async function uploadProfiles(
  request: Api,
  token: string,
  openingId: string,
  files: { name: string; buffer: Buffer; type?: string }[]
) {
  const presign = await request("POST", `/vendor/openings/${openingId}/profiles/presign`, {
    token,
    body: { filenames: files.map((f) => f.name) },
  });
  if (presign.status !== 200) return presign;

  const form = new FormData();
  for (const f of files) {
    form.append("files", new Blob([f.buffer], { type: f.type ?? "application/pdf" }), f.name);
  }
  form.append("uploadTokens", JSON.stringify(presign.data.data.map((t: { uploadToken: string }) => t.uploadToken)));
  return request("POST", `/vendor/openings/${openingId}/profiles/upload`, { token, form });
}

/** Polls until `check` returns a truthy value (or times out). */
export async function waitFor<T>(check: () => Promise<T | undefined | null | false>, timeoutMs = 10_000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}
