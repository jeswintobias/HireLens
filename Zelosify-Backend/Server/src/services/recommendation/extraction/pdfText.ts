import pdf from "pdf-extraction";
import logger from "../../../utils/logger/logger.js";
import {
  MIN_VISIBLE_FONT_PT,
  WHITE,
  isLowContrast,
  type ExtractedResume,
  type HiddenReason,
  type HiddenRun,
  type Rgb,
} from "./hiddenText.js";

/**
 * PDF text extraction with a visibility "proofreader" (no OCR).
 *
 * A PDF page is a list of drawing commands. pdf.js gives us two views of it:
 *   - getTextContent(): every text item with its on-page size and position
 *   - getOperatorList(): the raw commands (colours, shapes, images, text)
 *
 * We replay the commands like a printer would, tracking the current fill
 * colour, opacity, text render mode and transform, and record where filled
 * shapes and images are drawn. Each text item is then checked:
 *   tiny font · invisible render mode · outside the page ·
 *   colour ≈ whatever is drawn behind it · a shape/image drawn on top of it
 *
 * Visible text is returned as the resume text; hidden text is returned
 * separately so it can be reported and never reaches the AI.
 */

type Matrix = [number, number, number, number, number, number];

interface GraphicsState {
  ctm: Matrix;
  /** null = pattern/shading fill (colour unknown). */
  fill: Rgb | null;
  alpha: number;
  renderMode: number;
}

interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Fill colour; null for images / unknown fills. */
  color: Rgb | null;
  alpha: number;
  opIndex: number;
}

interface TextDraw {
  opIndex: number;
  fill: Rgb | null;
  alpha: number;
  renderMode: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Matrix for "apply a, then b" (PDF row-vector convention). */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function boundsOf(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** pdf.js keeps its settings and operator codes on a global PDFJS object. */
function pdfjsGlobal(): any {
  const g = globalThis as any;
  g.PDFJS ??= {};
  // Font loading needs a browser DOM; we only need text, colours and shapes.
  g.PDFJS.disableFontFace = true;
  return g.PDFJS;
}

/** Replays the page's drawing commands; returns text draws and filled areas. */
function analyseOperators(ops: { fnArray: number[]; argsArray: any[] }, OPS: Record<string, number>) {
  let state: GraphicsState = { ctm: IDENTITY, fill: [0, 0, 0], alpha: 1, renderMode: 0 };
  const stack: GraphicsState[] = [];
  const texts: TextDraw[] = [];
  const areas: Area[] = [];
  let path: [number, number][] = [];

  const textOps = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const endPathOps = new Set([OPS.stroke, OPS.closeStroke, OPS.endPath]);
  const imageOps = new Set([
    OPS.paintImageXObject, OPS.paintJpegXObject, OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup,
  ]);

  const unitSquare = (opIndex: number, color: Rgb | null) => {
    const corners: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    areas.push({ ...boundsOf(corners.map(([x, y]) => apply(state.ctm, x, y))), color, alpha: state.alpha, opIndex });
  };

  ops.fnArray.forEach((fn, i) => {
    const args = ops.argsArray[i];
    if (textOps.has(fn)) {
      texts.push({ opIndex: i, fill: state.fill, alpha: state.alpha, renderMode: state.renderMode });
      return;
    }
    switch (fn) {
      case OPS.save:
        stack.push({ ...state });
        break;
      case OPS.restore:
        state = stack.pop() ?? state;
        break;
      case OPS.transform:
        state.ctm = multiply(args as Matrix, state.ctm);
        break;
      case OPS.paintFormXObjectBegin:
        stack.push({ ...state });
        if (Array.isArray(args?.[0]) && args[0].length === 6) state.ctm = multiply(args[0] as Matrix, state.ctm);
        break;
      case OPS.paintFormXObjectEnd:
        state = stack.pop() ?? state;
        break;
      case OPS.setFillRGBColor:
        state.fill = [Number(args[0]), Number(args[1]), Number(args[2])];
        break;
      case OPS.setFillColorN:
      case OPS.shadingFill:
        state.fill = null;
        break;
      case OPS.setGState:
        for (const [key, value] of (args?.[0] ?? []) as [string, unknown][]) {
          if (key === "ca" && typeof value === "number") state.alpha = value;
        }
        break;
      case OPS.setTextRenderingMode:
        state.renderMode = Number(args[0]);
        break;
      case OPS.constructPath: {
        const [pathOps, coords] = args as [number[], number[]];
        let k = 0;
        for (const op of pathOps) {
          const take = (n: number) => coords.slice(k, (k += n));
          if (op === OPS.rectangle) {
            const [x, y, w, h] = take(4);
            path.push(apply(state.ctm, x, y), apply(state.ctm, x + w, y + h), apply(state.ctm, x, y + h), apply(state.ctm, x + w, y));
          } else if (op === OPS.moveTo || op === OPS.lineTo) {
            const [x, y] = take(2);
            path.push(apply(state.ctm, x, y));
          } else if (op === OPS.curveTo) {
            const c = take(6);
            path.push(apply(state.ctm, c[4], c[5]));
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            const c = take(4);
            path.push(apply(state.ctm, c[2], c[3]));
          }
        }
        break;
      }
      default:
        if (fillOps.has(fn)) {
          if (path.length > 0) areas.push({ ...boundsOf(path), color: state.fill, alpha: state.alpha, opIndex: i });
          path = [];
        } else if (endPathOps.has(fn)) {
          path = [];
        } else if (imageOps.has(fn)) {
          unitSquare(i, null);
        } else if (fn === OPS.paintImageMaskXObject) {
          unitSquare(i, state.fill); // a stencil mask is painted in the fill colour
        }
    }
  });

  return { texts, areas };
}

const contains = (a: Area, x: number, y: number) => x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;

function classify(
  item: { str: string; transform: number[]; width?: number },
  draw: TextDraw | undefined,
  areas: Area[],
  view: number[]
): HiddenReason | null {
  const t = item.transform;
  const size = Math.hypot(t[2], t[3]);
  if (size < MIN_VISIBLE_FONT_PT) return "tiny_font";

  const width = Math.max(0, item.width ?? 0);
  const [px0, py0, px1, py1] = view;
  const [x, y] = [t[4], t[5]];
  if (x >= px1 || y >= py1 || x + width <= px0 || y + size <= py0) return "off_page";

  if (!draw) return null; // operator list unavailable: size/position checks only
  if (draw.renderMode % 4 === 3) return "invisible_mode"; // 3 = invisible, 7 = clip only
  if (draw.alpha < 0.1) return "invisible_mode";

  // Probe the middle of the text, a third of the way up from the baseline.
  const cx = x + width / 2;
  const cy = y + size / 3;
  const pageArea = (px1 - px0) * (py1 - py0);

  // Covered: an opaque shape/image drawn later, over the text (full-page
  // shapes are ignored — some generators paint a page frame last).
  const covered = areas.some(
    (a) =>
      a.opIndex > draw.opIndex &&
      a.alpha >= 0.9 &&
      (a.x1 - a.x0) * (a.y1 - a.y0) < pageArea * 0.9 &&
      a.x1 - a.x0 > 2 && a.y1 - a.y0 > 2 &&
      contains(a, cx, cy)
  );
  if (covered) return "covered";

  // Background: the last opaque shape drawn under the text, else the page.
  if (!draw.fill) return null;
  let background: Rgb | null = WHITE;
  for (const a of areas) {
    if (a.opIndex < draw.opIndex && a.alpha >= 0.9 && a.x1 - a.x0 > 2 && a.y1 - a.y0 > 2 && contains(a, cx, cy)) {
      background = a.color; // later shapes overwrite earlier ones
    }
  }
  if (background === null) return null; // drawn over an image: can't judge
  return isLowContrast(draw.fill, background) ? "low_contrast" : null;
}

export async function extractPdfContent(buffer: Buffer): Promise<ExtractedResume> {
  const PDFJS = pdfjsGlobal();
  const hidden: HiddenRun[] = [];
  let pageNumber = 0;

  const pagerender = async (page: any): Promise<string> => {
    const pageNo = ++pageNumber;
    const textContent = await page.getTextContent({ disableCombineTextItems: true });
    const items: { str: string; transform: number[]; width?: number }[] = textContent.items;

    let draws: ReturnType<typeof analyseOperators> | null = null;
    try {
      draws = analyseOperators(await page.getOperatorList(), PDFJS.OPS);
      if (draws.texts.length !== items.length) {
        logger.warn("resume.pdf.visibility_alignment", { page: pageNo, textOps: draws.texts.length, items: items.length });
        draws = { texts: [], areas: draws.areas };
      }
    } catch (error) {
      logger.warn("resume.pdf.visibility_unavailable", { page: pageNo, error });
    }

    let text = "";
    let lastY: number | undefined;
    items.forEach((item, i) => {
      if (item.str.trim()) {
        const reason = classify(item, draws?.texts[i], draws?.areas ?? [], page.view);
        if (reason) {
          hidden.push({ reason, page: pageNo, text: item.str.trim().replace(/\s+/g, " ").slice(0, 300) });
          return;
        }
      }
      // Same line-joining rule as pdf-extraction's default renderer.
      text += lastY === undefined || lastY === item.transform[5] ? item.str : `\n${item.str}`;
      lastY = item.transform[5];
    });
    return text;
  };

  // The pdf.js 1.x build misreads Node Buffers (small ones are slices of
  // Node's shared pool → "bad XRef entry"); a plain Uint8Array copy is safe.
  const result = await pdf(new Uint8Array(buffer), { pagerender });
  return { text: String(result?.text ?? ""), hidden };
}
