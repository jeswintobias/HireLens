import pdf from "pdf-extraction";
import type { ResumeExtension } from "../../../helpers/hiring/resumeFileTypes.js";
import { extractPptxText } from "./pptxText.js";

/**
 * Converts a stored resume (PDF or PPTX) into plain text.
 * PDF uses the project's existing `pdf-extraction` dependency; PPTX uses the
 * built-in ZIP/XML reader.
 */
export async function extractResumeText(
  buffer: Buffer,
  fileType: ResumeExtension
): Promise<string> {
  if (fileType === "pdf") {
    const result = await pdf(buffer);
    return String(result?.text ?? "");
  }
  return extractPptxText(buffer);
}

export async function streamToBuffer(
  stream: NodeJS.ReadableStream,
  maxBytes: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
    size += buf.length;
    if (size > maxBytes) throw new Error("Resume file exceeds size limit");
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}
