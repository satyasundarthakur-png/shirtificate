import type { PdfField, PdfPage } from "./pdf";

export type FieldRect = { x: number; y: number; width: number; height: number };
export function clampRect(rect: FieldRect): FieldRect {
  const x = Math.max(0, Math.min(0.99, rect.x));
  const y = Math.max(0, Math.min(0.99, rect.y));
  return { x, y, width: Math.max(0.01, Math.min(1 - x, rect.width)), height: Math.max(0.01, Math.min(1 - y, rect.height)) };
}
export function pdfFieldRect(field: PdfField, page: PdfPage): FieldRect {
  return { x: field.left / page.displayWidth, y: field.top / page.displayHeight, width: field.dWidth / page.displayWidth, height: field.dHeight / page.displayHeight };
}
export function positionPdfField(field: PdfField, page: PdfPage, rect: FieldRect): PdfField {
  const box = clampRect(rect);
  const height = box.height * page.height;
  return { ...field, forceRedraw: true,
    ...(field.original ? { sourceBox: field.sourceBox ?? { x: field.x, y: field.y, width: field.width, height: field.height } } : {}),
    x: box.x * page.width, y: page.height - box.y * page.height - height * 0.82,
    width: box.width * page.width, height, left: box.x * page.displayWidth, top: box.y * page.displayHeight,
    dWidth: box.width * page.displayWidth, dHeight: box.height * page.displayHeight };
}
export function newPdfField(page: PdfPage, rect: FieldRect, id: string): PdfField {
  return positionPdfField({ id, pageIndex: page.index, original: "", text: "New field", x: 0, y: 0, width: 0, height: 0,
    fontSize: Math.max(6, rect.height * page.height * 0.8), left: 0, top: 0, dWidth: 0, dHeight: 0, bg: { r: 255, g: 255, b: 255 } }, page, rect);
}
