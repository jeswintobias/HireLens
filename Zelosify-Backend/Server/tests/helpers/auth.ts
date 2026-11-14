import crypto from "crypto";
import jwt from "jsonwebtoken";

/** Signs an RS256 access token shaped like a Keycloak one, with the test key. */
export function signToken(
  sub: string,
  roles: string[],
  opts: { expiresIn?: number; key?: string; issuer?: string } = {}
): string {
  return jwt.sign(
    { sub, realm_access: { roles } },
    opts.key ?? process.env.TEST_JWT_PRIVATE_KEY!,
    {
      algorithm: "RS256",
      keyid: "test-key",
      issuer: opts.issuer ?? `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
      expiresIn: opts.expiresIn ?? 300,
    }
  );
}

/** A token signed by a key the server does not trust (forged token). */
export function forgedToken(sub: string, roles: string[]): string {
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  return signToken(sub, roles, {
    key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
}
