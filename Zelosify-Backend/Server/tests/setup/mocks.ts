/**
 * Global test doubles for external systems (applied to every test file):
 *   Keycloak JWKS → the test public key from env.ts
 *   AWS S3        → in-memory object store
 */
import { vi } from "vitest";
import { memoryStorage } from "../helpers/memoryStorage";

vi.mock("jwks-rsa", () => ({
  default: () => ({
    getSigningKey: async () => ({ getPublicKey: () => process.env.KEYCLOAK_RS256_SIG }),
  }),
}));

vi.mock("@/services/storage/storageFactory", () => ({
  createStorageService: () => memoryStorage,
}));

// The backend pushes files to S3 with an HTTP PUT to a presigned URL;
// with the in-memory store the "URL" is memory://<key>.
vi.mock("@/services/upload/fileUploadService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/services/upload/fileUploadService")>();
  class FileUploadService extends mod.FileUploadService {}
  (FileUploadService.prototype as any).uploadToS3 = async (url: string, buffer: Buffer) => {
    memoryStorage.putFromUrl(url, buffer);
  };
  return { ...mod, FileUploadService };
});
