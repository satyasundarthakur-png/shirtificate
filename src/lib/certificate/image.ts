// Client-only image (JPG/PNG) certificate support.

import { hexToRgb, type Overlay } from "./overlay";

export type ParsedImage = {
  kind: "image";
  fileName: string;
  dataUrl: string;
  mime: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
};

export async function parseImage(file: File): Promise<ParsedImage> {
  const bytes = await file.arrayBuffer();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
  const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not decode that image."));
    img.src = dataUrl;
  });
  return {
    kind: "image",
    fileName: file.name,
    dataUrl,
    mime: file.type || (/\.png$/i.test(file.name) ? "image/png" : "image/jpeg"),
    bytes,
    width: size.width,
    height: size.height,
  };
}

/** Draws the image plus overlays onto a canvas and returns a PNG blob. */
export async function exportImage(doc: ParsedImage, overlays: Overlay[]): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not decode that image."));
    el.src = doc.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = doc.width;
  canvas.height = doc.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, doc.width, doc.height);
  drawOverlaysOnCanvas(ctx, overlays, doc.width, doc.height, 0);
  return new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

export function drawOverlaysOnCanvas(
  ctx: CanvasRenderingContext2D,
  overlays: Overlay[],
  width: number,
  height: number,
  pageIndex: number,
) {
  // Erase boxes are drawn first so text overlays can sit on top of them.
  for (const o of overlays) {
    if (o.pageIndex !== pageIndex || o.kind !== "erase") continue;
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x * width, o.y * height, o.width * width, o.height * height);
  }
  for (const o of overlays) {
    if (o.pageIndex !== pageIndex || o.kind !== "text" || !o.text.trim()) continue;
    const fontPx = o.size * height;
    ctx.font = `${o.bold ? "bold " : ""}${fontPx}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = o.color;
    ctx.textBaseline = "top";
    const boxW = o.width * width;
    let scale = 1;
    const w = ctx.measureText(o.text).width;
    if (w > boxW) scale = boxW / w;
    const drawW = w * scale;
    const x =
      o.align === "center"
        ? o.x * width + (boxW - drawW) / 2
        : o.align === "right"
          ? o.x * width + boxW - drawW
          : o.x * width;
    ctx.save();
    ctx.translate(x, o.y * height);
    ctx.scale(scale, scale);
    ctx.fillText(o.text, 0, 0);
    ctx.restore();
  }
}

/** Wraps the image in a single-page PDF with the overlays baked in. */
export async function imageToPdf(doc: ParsedImage, overlays: Overlay[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const bytes = new Uint8Array(doc.bytes.slice(0));
  const embedded = /png/i.test(doc.mime) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([embedded.width, embedded.height]);
  page.drawImage(embedded, {
    x: 0,
    y: 0,
    width: embedded.width,
    height: embedded.height,
  });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  drawOverlaysOnPdfPage(page, overlays, 0, embedded.width, embedded.height, {
    regular,
    bold,
    rgb,
  });
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}

type PdfFonts = {
  regular: { widthOfTextAtSize: (t: string, s: number) => number };
  bold: { widthOfTextAtSize: (t: string, s: number) => number };
  rgb: (r: number, g: number, b: number) => unknown;
};

export function drawOverlaysOnPdfPage(
  page: {
    drawText: (t: string, o: Record<string, unknown>) => void;
    drawRectangle: (o: Record<string, unknown>) => void;
  },
  overlays: Overlay[],
  pageIndex: number,
  width: number,
  height: number,
  fonts: PdfFonts,
) {
  // Erase boxes are drawn first so text overlays can sit on top of them.
  for (const o of overlays) {
    if (o.pageIndex !== pageIndex || o.kind !== "erase") continue;
    const { r, g, b } = hexToRgb(o.color);
    page.drawRectangle({
      x: o.x * width,
      y: height - o.y * height - o.height * height,
      width: o.width * width,
      height: o.height * height,
      color: fonts.rgb(r / 255, g / 255, b / 255),
    });
  }
  for (const o of overlays) {
    if (o.pageIndex !== pageIndex || o.kind !== "text" || !o.text.trim()) continue;
    const font = o.bold ? fonts.bold : fonts.regular;
    const boxW = o.width * width;
    let size = o.size * height;
    while (size > 3 && font.widthOfTextAtSize(o.text, size) > boxW) size -= 0.5;
    const textW = font.widthOfTextAtSize(o.text, size);
    const x =
      o.align === "center"
        ? o.x * width + (boxW - textW) / 2
        : o.align === "right"
          ? o.x * width + boxW - textW
          : o.x * width;
    const { r, g, b } = hexToRgb(o.color);
    page.drawText(o.text, {
      x,
      y: height - o.y * height - size,
      size,
      font,
      color: fonts.rgb(r / 255, g / 255, b / 255),
    });
  }
}
