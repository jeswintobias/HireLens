import zlib from "zlib";

/**
 * Minimal .pptx builder for tests (a ZIP of slide XML), with control over
 * run size/colour, shape fill, position, hidden flag and master background.
 */
export interface PptxRun {
  text: string;
  /** Points (default 11). */
  size?: number;
  /** Hex colour, e.g. "FFFFFF". */
  color?: string;
}

export interface PptxShape {
  runs: PptxRun[];
  x?: number;
  y?: number;
  /** Hex fill colour of the shape (default: no fill). */
  fill?: string;
  hidden?: boolean;
}

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function shapeXml(s: PptxShape, id: number) {
  const fill = s.fill ? `<a:solidFill><a:srgbClr val="${s.fill}"/></a:solidFill>` : "<a:noFill/>";
  const paras = s.runs
    .map((r) => {
      const c = r.color ? `<a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill>` : "";
      return `<a:p><a:r><a:rPr lang="en-US" sz="${Math.round((r.size ?? 11) * 100)}">${c}</a:rPr><a:t>${xmlEsc(r.text)}</a:t></a:r></a:p>`;
    })
    .join("");
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="S${id}"${s.hidden ? ' hidden="1"' : ""}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${s.x ?? 457200}" y="${s.y ?? 457200 + id * 600000}"/><a:ext cx="8000000" cy="500000"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</p:spPr><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`
  );
}

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const deflated = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, deflated);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** One-slide deck. `masterBackground` adds layout → master → theme parts. */
export function buildPptx(shapes: PptxShape[], opts: { masterBackground?: string } = {}): Buffer {
  const slide =
    `<?xml version="1.0" encoding="UTF-8"?><p:sld ${NS}><p:cSld><p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    shapes.map((s, i) => shapeXml(s, i + 2)).join("") +
    `</p:spTree></p:cSld></p:sld>`;

  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8"?><p:presentation ${NS}><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`,
    "ppt/slides/slide1.xml": slide,
  };
  if (opts.masterBackground) {
    const rel = (type: string, target: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/${type}" Target="${target}"/></Relationships>`;
    files["ppt/slides/_rels/slide1.xml.rels"] = rel("slideLayout", "../slideLayouts/slideLayout1.xml");
    files["ppt/slideLayouts/slideLayout1.xml"] = `<p:sldLayout ${NS}><p:cSld><p:spTree/></p:cSld></p:sldLayout>`;
    files["ppt/slideLayouts/_rels/slideLayout1.xml.rels"] = rel("slideMaster", "../slideMasters/slideMaster1.xml");
    // Background via theme colour: bg1 → (clrMap) dk1 → theme dk1 colour.
    files["ppt/slideMasters/slideMaster1.xml"] =
      `<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree/></p:cSld>` +
      `<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2"/></p:sldMaster>`;
    files["ppt/slideMasters/_rels/slideMaster1.xml.rels"] = rel("theme", "../theme/theme1.xml");
    files["ppt/theme/theme1.xml"] =
      `<a:theme ${NS}><a:themeElements><a:clrScheme name="t"><a:dk1><a:srgbClr val="${opts.masterBackground}"/></a:dk1>` +
      `<a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme></a:themeElements></a:theme>`;
  }
  return zip(files);
}
