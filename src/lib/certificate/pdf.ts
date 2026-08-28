// Client-only PDF parsing / editing helpers.

export type PdfField = {
  id: string;
  pageIndex: number;
  original: string;
  text: string;
  /** PDF user-space (y-up, origin bottom-left) */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  /** display coords in rendered image pixels */
  left: number;
  top: number;
  dWidth: number;
  dHeight: number;
  /** background colour sampled behind the text, used when re-drawing */
  bg: { r: number; g: number; b: number };
};

export type PdfPage = {
  index: number;
  image: string;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
};

export type ParsedPdf = {
  kind: "pdf";
  fileName: string;
  bytes: ArrayBuffer;
  pages: PdfPage[];
  fields: PdfField[];
};

const TARGET_WIDTH = 1000;

async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

export async function parsePdf(file: File): Promise<ParsedPdf> {
  const bytes = await file.arrayBuffer();
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;

  const pages: PdfPage[] = [];
  const fields: PdfField[] = [];

  for (let p = 0; p < doc.numPages; p++) {
    const page = await doc.getPage(p + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = TARGET_WIDTH / base.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as never).promise;

    pages.push({
      index: p,
      image: canvas.toDataURL("image/png"),
      width: base.width,
      height: base.height,
      displayWidth: canvas.width,
      displayHeight: canvas.height,
    });

    const content = await page.getTextContent();
    content.items.forEach((raw, i) => {
      const item = raw as {
        str: string;
        width: number;
        height: number;
        transform: number[];
      };
      if (!item.str || !item.str.trim()) return;
      const [a, b, , d, e, f] = item.transform as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      const fontSize = Math.hypot(b, d) || Math.abs(d) || Math.abs(a) || 12;
      const height = item.height || fontSize;
      const left = e * scale;
      const top = viewport.height - (f + height * 0.82) * scale;
      const dWidth = item.width * scale;
      const dHeight = height * scale;

      let bg = { r: 255, g: 255, b: 255 };
      const sx = Math.min(canvas.width - 1, Math.max(0, Math.round(left + 1)));
      const sy = Math.min(canvas.height - 1, Math.max(0, Math.round(top - 3)));
      try {
        const px = ctx.getImageData(sx, sy, 1, 1).data;
        bg = { r: px[0] ?? 255, g: px[1] ?? 255, b: px[2] ?? 255 };
      } catch {
        /* keep white */
      }

      fields.push({
        id: `p${p}-t${i}`,
        pageIndex: p,
        original: item.str,
        text: item.str,
        x: e,
        y: f,
        width: item.width,
        height,
        fontSize,
        left,
        top,
        dWidth,
        dHeight,
        bg,
      });
    });
  }

  return { kind: "pdf", fileName: file.name, bytes, pages, fields };
}

export async function exportPdf(
  doc: ParsedPdf,
  fields: PdfField[],
  overlays: Overlay[] = [],
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.load(doc.bytes.slice(0));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();


  for (const field of fields) {
    if (field.text === field.original) continue;
    const page = pages[field.pageIndex];
    if (!page) continue;

    const pad = field.height * 0.28;
    page.drawRectangle({
      x: field.x - 1,
      y: field.y - pad,
      width: field.width + 2,
      height: field.height + pad * 1.6,
      color: rgb(field.bg.r / 255, field.bg.g / 255, field.bg.b / 255),
    });

    if (!field.text.trim()) continue;
    let size = field.fontSize;
    while (size > 4 && font.widthOfTextAtSize(field.text, size) > field.width) {
      size -= 0.5;
    }
    page.drawText(field.text, {
      x: field.x,
      y: field.y,
      size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}

/** Measures whether the edited text still fits its original box. */
export async function measureOverflow(fields: PdfField[]) {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const warnings: { id: string; message: string }[] = [];
  for (const field of fields) {
    if (field.text === field.original) continue;
    if (!field.text.trim()) {
      warnings.push({ id: field.id, message: "Field is empty" });
      continue;
    }
    const w = font.widthOfTextAtSize(field.text, field.fontSize);
    if (w > field.width * 1.02) {
      const shrink = Math.round((1 - field.width / w) * 100);
      warnings.push({
        id: field.id,
        message: `Too long for its box — text will shrink about ${shrink}%`,
      });
    }
  }
  return warnings;
}
