import zlib from "zlib";
import {
  MIN_VISIBLE_FONT_PT,
  WHITE,
  isLowContrast,
  parseHexColor,
  type ExtractedResume,
  type HiddenReason,
  type HiddenRun,
  type Rgb,
} from "./hiddenText.js";

/**
 * Extracts slide text from a .pptx file without third-party packages.
 *
 * A .pptx is a ZIP archive of XML parts. We read the ZIP central directory,
 * inflate `ppt/slides/slideN.xml` entries with Node's built-in zlib, and
 * collect the text runs (`<a:t>…</a:t>`) paragraph by paragraph.
 *
 * Guards against zip bombs (per-entry and total size caps). ZIP64 archives
 * are not supported (a resume deck never needs them).
 */

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_SLIDES = 200;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function findEndOfCentralDirectory(buf: Buffer): number {
  const minPos = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minPos; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error("Invalid PPTX: ZIP end-of-central-directory not found");
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);
  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (offset === 0xffffffff || entryCount === 0xffff) {
    throw new Error("Unsupported PPTX: ZIP64 archive");
  }

  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new Error("Invalid PPTX: corrupt central directory");
    }
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    entries.push({
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localHeaderOffset: buf.readUInt32LE(offset + 42),
      name: buf.toString("utf8", offset + 46, offset + 46 + nameLen),
    });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const at = entry.localHeaderOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== LOCAL_SIG) {
    throw new Error(`Invalid PPTX: bad local header for ${entry.name}`);
  }
  const dataStart = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error(`PPTX entry too large: ${entry.name}`);
  }
  if (entry.method === 0) return data;
  if (entry.method === 8) {
    return zlib.inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  }
  throw new Error(`Unsupported ZIP compression method ${entry.method}`);
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m])
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

export function extractPptxText(buf: Buffer): string {
  return extractPptxContent(buf).text;
}

// -----------------------------------------------------------------------------
// Visibility proofreading (hidden text detection)
// -----------------------------------------------------------------------------

/** Resolves theme colours: clrMap (bg1 → lt1 …) + theme palette. */
interface ColorContext {
  clrMap: Record<string, string>;
  theme: Record<string, Rgb>;
}

/** Reads a colour element (srgbClr / sysClr / schemeClr) from an XML fragment. */
function readColor(fragment: string | undefined, ctx: ColorContext): Rgb | null {
  if (!fragment) return null;
  const srgb = /<a:srgbClr\b[^>]*\bval="([0-9a-fA-F]{6})"/.exec(fragment);
  if (srgb) return parseHexColor(srgb[1]);
  const sys = /<a:sysClr\b[^>]*\blastClr="([0-9a-fA-F]{6})"/.exec(fragment);
  if (sys) return parseHexColor(sys[1]);
  const scheme = /<a:schemeClr\b[^>]*\bval="(\w+)"/.exec(fragment);
  if (scheme) {
    const name = ctx.clrMap[scheme[1]] ?? scheme[1];
    return ctx.theme[name] ?? null;
  }
  return null;
}

/** Solid background colour of a slide/layout/master; undefined = not set here; null = set but not solid. */
function readBackground(xml: string | undefined, ctx: ColorContext): Rgb | null | undefined {
  const bg = xml && /<p:bg>([\s\S]*?)<\/p:bg>/.exec(xml)?.[1];
  if (!bg) return undefined;
  const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(bg)?.[1];
  if (solid) return readColor(solid, ctx);
  const ref = /<p:bgRef\b[^>]*>([\s\S]*?)<\/p:bgRef>/.exec(bg)?.[1];
  if (ref) return readColor(ref, ctx);
  return null; // gradient / picture background: cannot judge contrast
}

function resolveTarget(fromPart: string, target: string): string {
  const parts = fromPart.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relsTarget(read: (name: string) => string | undefined, part: string, type: string): string | undefined {
  const relsPath = part.replace(/([^/]+)$/, "_rels/$1.rels");
  const rels = read(relsPath);
  const m = rels && new RegExp(`<Relationship\\b[^>]*Type="[^"]*/${type}"[^>]*Target="([^"]+)"`).exec(rels);
  const m2 = rels && new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Type="[^"]*/${type}"`).exec(rels);
  const target = m?.[1] ?? m2?.[1];
  return target ? resolveTarget(part, target) : undefined;
}

const attr = (tag: string | undefined, name: string) =>
  tag ? new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] : undefined;

function shapeText(shape: string): string[] {
  return (shape.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [])
    .map((p) => [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join(""))
    .filter((l) => l.trim());
}

/**
 * Splits one slide into visible lines and hidden runs. Checks, per shape and
 * per text run: hidden shape · positioned off the slide · font < 4pt ·
 * explicit run colour ≈ shape fill / slide background.
 */
function proofreadSlide(
  xml: string,
  slideNo: number,
  slideSize: { cx: number; cy: number } | null,
  slideBackground: Rgb | null,
  ctx: ColorContext,
  hidden: HiddenRun[]
): string {
  const lines: string[] = [];
  const grouped = new Set((xml.match(/<p:grpSp>[\s\S]*?<\/p:grpSp>/g) ?? []).join("\n").match(/<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g) ?? []);
  const shapes = xml.match(/<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g) ?? [];

  const hide = (reason: HiddenReason, text: string) => {
    if (text.trim()) hidden.push({ reason, page: slideNo, text: text.trim().replace(/\s+/g, " ").slice(0, 300) });
  };

  for (const shape of shapes) {
    const nvPr = /<p:cNvPr\b[^>]*>/.exec(shape)?.[0];
    if (/^(1|true)$/.test(attr(nvPr, "hidden") ?? "")) {
      shapeText(shape).forEach((t) => hide("invisible_mode", t));
      continue;
    }

    // Off-slide (top-level shapes only: group children use group coordinates).
    const off = /<a:off\b[^>]*>/.exec(shape)?.[0];
    const ext = /<a:ext\b[^>]*\bcx="[^"]*"[^>]*>/.exec(shape)?.[0];
    if (slideSize && off && ext && !grouped.has(shape)) {
      const x = Number(attr(off, "x")), y = Number(attr(off, "y"));
      const cx = Number(attr(ext, "cx")), cy = Number(attr(ext, "cy"));
      if (x >= slideSize.cx || y >= slideSize.cy || x + cx <= 0 || y + cy <= 0) {
        shapeText(shape).forEach((t) => hide("off_page", t));
        continue;
      }
    }

    // What is behind this shape's text: its own fill, else the slide background.
    // (outline settings in <a:ln> also contain fills, so they are dropped first)
    const spPr = (/<p:spPr\b[\s\S]*?<\/p:spPr>/.exec(shape)?.[0] ?? "").replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, "");
    let background: Rgb | null = slideBackground;
    const solid = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(spPr)?.[1];
    if (solid) background = readColor(solid, ctx);
    else if (/<a:(gradFill|blipFill|pattFill)\b/.test(spPr)) background = null; // cannot judge
    else if (!/<a:noFill\s*\/>/.test(spPr)) {
      // Shapes without an explicit fill may take one from their theme style.
      const fillRef = /<a:fillRef\b[^>]*\bidx="(\d+)"[^>]*>([\s\S]*?)<\/a:fillRef>/.exec(shape);
      if (fillRef && fillRef[1] !== "0") background = readColor(fillRef[2], ctx);
    }

    for (const para of shape.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? []) {
      let line = "";
      for (const run of para.match(/<a:(r|fld)\b[\s\S]*?<\/a:\1>/g) ?? []) {
        const text = [...run.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map((m) => decodeXml(m[1])).join("");
        if (!text) continue;
        const rPr = /<a:rPr\b[^>]*\/>|<a:rPr\b[\s\S]*?<\/a:rPr>/.exec(run)?.[0];
        const sz = Number(attr(/<a:rPr\b[^>]*>/.exec(rPr ?? "")?.[0], "sz"));
        if (Number.isFinite(sz) && sz > 0 && sz / 100 < MIN_VISIBLE_FONT_PT) {
          hide("tiny_font", text);
          continue;
        }
        // Only explicit run colours are judged; inherited theme text colours
        // are designed to contrast with the theme background.
        const runFill = rPr && /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(rPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/g, ""))?.[1];
        const color = runFill ? readColor(runFill, ctx) : null;
        if (color && background && isLowContrast(color, background)) {
          hide("low_contrast", text);
          continue;
        }
        line += text;
      }
      if (line.trim()) lines.push(line);
    }
  }
  return lines.join("\n");
}

/** Slide text a human would see, plus any hidden text found in the deck. */
export function extractPptxContent(buf: Buffer): ExtractedResume {
  const entries = readCentralDirectory(buf);
  const byName = new Map(entries.map((e) => [e.name, e]));
  let total = 0;
  const cache = new Map<string, string | undefined>();
  const read = (name: string): string | undefined => {
    if (cache.has(name)) return cache.get(name);
    const entry = byName.get(name);
    let xml: string | undefined;
    if (entry) {
      const data = readEntry(buf, entry);
      total += data.length;
      if (total > MAX_TOTAL_BYTES) throw new Error("PPTX content too large");
      xml = data.toString("utf8");
    }
    cache.set(name, xml);
    return xml;
  };

  const slides = entries
    .map((e) => ({ e, n: /^ppt\/slides\/slide(\d+)\.xml$/.exec(e.name)?.[1] }))
    .filter((s): s is { e: ZipEntry; n: string } => s.n !== undefined)
    .sort((a, b) => Number(a.n) - Number(b.n))
    .slice(0, MAX_SLIDES);

  if (slides.length === 0) {
    throw new Error("Invalid PPTX: no slides found");
  }

  const sldSz = /<p:sldSz\b[^>]*>/.exec(read("ppt/presentation.xml") ?? "")?.[0];
  const slideSize = sldSz ? { cx: Number(attr(sldSz, "cx")), cy: Number(attr(sldSz, "cy")) } : null;

  const hidden: HiddenRun[] = [];
  const texts: string[] = [];
  for (const { e, n } of slides) {
    const slideXml = read(e.name) ?? "";
    // Theme colours + background: slide → layout → master.
    const layoutPart = relsTarget(read, e.name, "slideLayout");
    const masterPart = layoutPart && relsTarget(read, layoutPart, "slideMaster");
    const themePart = masterPart && relsTarget(read, masterPart, "theme");
    const masterXml = masterPart ? read(masterPart) : undefined;
    const themeXml = themePart ? read(themePart) : undefined;

    const ctx: ColorContext = { clrMap: {}, theme: {} };
    const clrMapTag = /<p:clrMap\b[^>]*>/.exec(masterXml ?? "")?.[0] ?? "";
    for (const [, k, v] of clrMapTag.matchAll(/\b(\w+)="(\w+)"/g)) ctx.clrMap[k] = v;
    const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(themeXml ?? "")?.[0] ?? "";
    for (const [, name, body] of scheme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)>([\s\S]*?)<\/a:\1>/g)) {
      const c = readColor(body, { clrMap: {}, theme: {} });
      if (c) ctx.theme[name] = c;
    }

    let background: Rgb | null | undefined = readBackground(slideXml, ctx);
    if (background === undefined && layoutPart) background = readBackground(read(layoutPart), ctx);
    if (background === undefined) background = readBackground(masterXml, ctx);
    if (background === undefined) background = WHITE; // PowerPoint's default slide

    texts.push(proofreadSlide(slideXml, Number(n), slideSize, background, ctx, hidden));
  }
  return { text: texts.filter(Boolean).join("\n\n"), hidden };
}
