import type { ResumeExtension } from "../../../helpers/hiring/resumeFileTypes.js";
import type { ExtractedResume } from "./hiddenText.js";
import { extractPdfContent } from "./pdfText.js";
import { extractPptxContent } from "./pptxText.js";

/**
 * Converts a stored resume (PDF or PPTX) into the text a human would see,
 * and separately lists any hidden text (white-on-white, tiny fonts,
 * off-page, covered). Hidden text never reaches the AI.
 * PDF uses the project's existing `pdf-extraction` dependency; PPTX uses the
 * built-in ZIP/XML reader.
 */
export async function extractResumeContent(
  buffer: Buffer,
  fileType: ResumeExtension
): Promise<ExtractedResume> {
  return fileType === "pdf" ? extractPdfContent(buffer) : extractPptxContent(buffer);
}

/** Visible text only. */
export async function extractResumeText(
  buffer: Buffer,
  fileType: ResumeExtension
): Promise<string> {
  return (await extractResumeContent(buffer, fileType)).text;
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
