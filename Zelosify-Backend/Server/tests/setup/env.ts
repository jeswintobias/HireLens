/**
 * Test environment (runs before every test file, before any app module loads).
 *
 * - Loads .env for DATABASE_URL / ENCRYPTION_KEY, with safe fallbacks so the
 *   unit suite also runs on a fresh clone without secrets.
 * - Replaces Keycloak with a throw-away RSA key pair generated per run: tests
 *   sign their own RS256 tokens, and the real auth middlewares verify them.
 * - Never uses a real LLM key or real S3 (see mocks.ts).
 */
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

process.env.NODE_ENV = "test";
process.env.LOG_SILENT = process.env.LOG_SILENT ?? "true";
process.env.ENCRYPTION_ALGORITHM ||= "aes-256-gcm";
process.env.ENCRYPTION_KEY ||= crypto.randomBytes(32).toString("hex");
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString("hex");
// Registration policy is configured per test.
delete process.env.REGISTRATION_ADMIN_KEY;
delete process.env.SELF_REGISTRATION_ROLES;

// Fake identity provider: the public key is what the middlewares trust.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.KEYCLOAK_URL = "http://keycloak.test/auth";
process.env.KEYCLOAK_REALM = "Zelosify";
process.env.KEYCLOAK_RS256_SIG = publicKey.export({ type: "spki", format: "pem" }).toString();
process.env.TEST_JWT_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

// Real LLM providers must never be called from tests.
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;
