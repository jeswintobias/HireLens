import { Readable } from "stream";

/** In-memory replacement for the S3 storage service. */
const files = new Map<string, Buffer>();
const PREFIX = "memory://";

export const memoryStorage = {
  files,
  async getObjectURL(key: string) {
    return `${PREFIX}${encodeURIComponent(key)}`;
  },
  async getUploadURL(key: string) {
    return `${PREFIX}${encodeURIComponent(key)}`;
  },
  async getObjectStream(key: string) {
    const buf = files.get(key);
    if (!buf) throw new Error(`NoSuchKey: ${key}`);
    return Readable.from([buf]);
  },
  async putObject(key: string, file: Buffer | string) {
    files.set(key, Buffer.isBuffer(file) ? file : Buffer.from(file));
    return { message: "ok" };
  },
  async listObjects(prefix: string) {
    return [...files.keys()].filter((k) => k.startsWith(prefix)).map((Key) => ({ Key }));
  },
  putFromUrl(url: string, buffer: Buffer) {
    if (!url.startsWith(PREFIX)) throw new Error(`Unexpected upload URL ${url}`);
    files.set(decodeURIComponent(url.slice(PREFIX.length)), buffer);
  },
};
