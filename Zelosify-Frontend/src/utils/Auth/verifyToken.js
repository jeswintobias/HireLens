/**
 * Verifies a Keycloak access token (RS256) inside Next.js middleware, using
 * the Web Crypto API that the middleware runtime provides (no packages).
 *
 * Why: the route guard used to trust any cookie named access_token and read
 * the role from it unverified, so hand-made cookies opened the page frame of
 * any role. Now the signature and expiry are checked before a page renders.
 *
 * Public key source (first available):
 *   1. KEYCLOAK_RS256_SIG in the frontend environment (optional)
 *   2. GET {NEXT_PUBLIC_BACKEND_URL}/auth/public-key (cached for an hour)
 * If neither is reachable, verification fails closed (treated as signed out).
 */

const KEY_TTL_MS = 60 * 60 * 1000;
const FAILURE_RETRY_MS = 10 * 1000;
const CLOCK_SKEW_SEC = 30;

let cached = { key: null, until: 0 };
let inflight = null;

const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const bytesToJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

async function importKey(base64Spki) {
  const der = Uint8Array.from(atob(base64Spki.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("spki", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
}

async function loadKey() {
  const fromEnv = process.env.KEYCLOAK_RS256_SIG;
  if (fromEnv) return importKey(fromEnv);
  const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/public-key`, { cache: "no-store" });
  if (!res.ok) throw new Error(`public key request failed: ${res.status}`);
  const { publicKey } = await res.json();
  return importKey(publicKey);
}

async function getKey() {
  if (Date.now() < cached.until) return cached.key;
  inflight ??= loadKey()
    .then((key) => (cached = { key, until: Date.now() + KEY_TTL_MS }).key)
    .catch((err) => {
      console.warn("[auth] cannot load token public key:", err.message);
      cached = { key: null, until: Date.now() + FAILURE_RETRY_MS };
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * @returns {Promise<object|null>} the token payload if the signature is valid
 *          and it has not expired; otherwise null.
 */
export async function verifyAccessToken(token) {
  try {
    const parts = token?.split(".");
    if (!parts || parts.length !== 3) return null;
    const header = bytesToJson(b64urlToBytes(parts[0]));
    if (header.alg !== "RS256") return null; // rejects "alg: none" and HMAC tricks

    const key = await getKey();
    if (!key) return null;

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return null;

    const payload = bytesToJson(b64urlToBytes(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SEC < now) return null;
    return payload;
  } catch {
    return null;
  }
}
