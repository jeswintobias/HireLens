import zlib from "zlib";

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

/** Text of one slide: one line per paragraph, runs concatenated. */
function slideXmlToText(xml: string): string {
  const paragraphs = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [];
  return paragraphs
    .map((p) =>
      [...p.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
        .map((m) => decodeXml(m[1]))
        .join("")
    )
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

export function extractPptxText(buf: Buffer): string {
  const slides = readCentralDirectory(buf)
    .map((e) => ({ e, n: /^ppt\/slides\/slide(\d+)\.xml$/.exec(e.name)?.[1] }))
    .filter((s): s is { e: ZipEntry; n: string } => s.n !== undefined)
    .sort((a, b) => Number(a.n) - Number(b.n))
    .slice(0, MAX_SLIDES);

  if (slides.length === 0) {
    throw new Error("Invalid PPTX: no slides found");
  }

  let total = 0;
  const texts: string[] = [];
  for (const { e } of slides) {
    const xml = readEntry(buf, e);
    total += xml.length;
    if (total > MAX_TOTAL_BYTES) throw new Error("PPTX content too large");
    texts.push(slideXmlToText(xml.toString("utf8")));
  }
  return texts.filter(Boolean).join("\n\n");
}
