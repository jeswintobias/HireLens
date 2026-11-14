import { describe, expect, it } from "vitest";
import { extractResumeText } from "../../../src/services/recommendation/extraction/extractResumeText";
import { buildResumePdf } from "../../helpers/resumePdf";

describe("PDF text extraction", () => {
  it("reads small PDFs that live inside Node's shared buffer pool (regression)", async () => {
    // Buffers < 4 KB share one pooled ArrayBuffer at a non-zero offset; the
    // pdf.js 1.x build used to read the whole pool and fail with "bad XRef entry".
    for (let n = 1; n <= 40; n++) {
      const pdf = buildResumePdf([`Candidate ${n}`, "Skills: Node.js"]);
      const pooled = Buffer.concat([Buffer.from("pad".repeat(n)), pdf]).subarray(3 * n);
      expect(pooled.byteOffset).toBeGreaterThan(0);
      const text = await extractResumeText(pooled, "pdf");
      expect(text).toContain(`Candidate ${n}`);
    }
  });
});
