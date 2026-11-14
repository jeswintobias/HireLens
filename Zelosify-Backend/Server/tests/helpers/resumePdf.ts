/**
 * Builds small but valid PDFs for tests, so they exercise the real PDF
 * signature check, text extraction and hidden-text proofreading.
 */
type Rgb = [number, number, number];

export interface PdfTextItem {
  text: string;
  /** Font size in points (default 11). */
  size?: number;
  /** Text colour 0–255 (default black). */
  rgb?: Rgb;
  /** PDF text render mode (3 = invisible). */
  renderMode?: number;
  /** Position; default: next line from the top-left. */
  x?: number;
  y?: number;
  /** Filled box drawn BEHIND the text. */
  background?: Rgb;
  /** Opaque box drawn OVER the text afterwards. */
  coverWith?: Rgb;
}

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
const color = ([r, g, b]: Rgb) => [r, g, b].map((v) => (v / 255).toFixed(3)).join(" ");

export function buildStyledPdf(items: PdfTextItem[]): Buffer {
  let nextY = 780;
  const ops: string[] = [];
  for (const it of items) {
    const size = it.size ?? 11;
    const x = it.x ?? 50;
    const y = it.y ?? nextY;
    nextY = (it.y ?? nextY) - Math.max(14, size + 3);
    const box = `${x - 4} ${y - 4} ${it.text.length * size * 0.6 + 8} ${size + 8} re f`;
    if (it.background) ops.push(`${color(it.background)} rg`, box);
    ops.push(
      "BT",
      `/F1 ${size} Tf`,
      `${color(it.rgb ?? [0, 0, 0])} rg`,
      `${it.renderMode ?? 0} Tr`,
      `1 0 0 1 ${x} ${y} Tm`,
      `(${esc(it.text)}) Tj`,
      "ET"
    );
    if (it.coverWith) ops.push(`${color(it.coverWith)} rg`, box);
  }
  const content = ops.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** One-page PDF with plain black text lines. */
export function buildResumePdf(lines: string[]): Buffer {
  return buildStyledPdf(lines.map((text) => ({ text })));
}

export interface ResumeSpec {
  name?: string;
  years: number;
  skills: string[];
  location: string;
  extra?: string[];
}

/** Resume text in the shape the scripted fake LLM reads. */
export function resumeLines(r: ResumeSpec): string[] {
  return [
    r.name ?? "Test Candidate",
    `Location: ${r.location}`,
    `Experience: ${r.years} years`,
    `Skills: ${r.skills.join(", ")}`,
    ...(r.extra ?? []),
  ];
}
