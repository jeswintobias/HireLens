/**
 * Shared rules for "proofreading" a resume: deciding whether a piece of text
 * would actually be visible to a human reading the document.
 *
 * Hidden text (white on white, 1pt fonts, text outside the page, text under
 * a box) is a classic way to stuff keywords or instructions into a resume
 * that only machines read. It is removed before the AI sees the resume, so
 * it can never count as evidence of a skill, and reported as a signal.
 */

export type HiddenReason =
  | "tiny_font" // rendered below MIN_VISIBLE_FONT_PT
  | "low_contrast" // text colour ≈ the colour behind it (e.g. white on white)
  | "invisible_mode" // PDF text render mode 3/7, PPTX hidden shape
  | "off_page" // positioned outside the page / slide
  | "covered"; // a shape or image is drawn on top of it

export interface HiddenRun {
  reason: HiddenReason;
  /** Page (PDF) or slide (PPTX) number, 1-based. */
  page: number;
  text: string;
}

export interface ExtractedResume {
  /** Text a human would see. */
  text: string;
  /** Text that is present in the file but not visible. */
  hidden: HiddenRun[];
}

/** Smallest font size (in points) still treated as readable. */
export const MIN_VISIBLE_FONT_PT = 4;

/**
 * Contrast ratio (WCAG formula) below which text is treated as invisible
 * against its background. White on white = 1.0; light grey (#DCDCDC) on
 * white ≈ 1.37 stays visible.
 */
export const MIN_VISIBLE_CONTRAST = 1.25;

export type Rgb = [number, number, number];

export const WHITE: Rgb = [255, 255, 255];

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) => {
    const s = Math.min(255, Math.max(0, c)) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function isLowContrast(text: Rgb, background: Rgb): boolean {
  return contrastRatio(text, background) < MIN_VISIBLE_CONTRAST;
}

export function parseHexColor(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
