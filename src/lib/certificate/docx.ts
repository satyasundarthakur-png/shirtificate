// Client-only DOCX parsing / editing helpers.

export type DocxField = {
  id: string;
  /** index into the w:t token list of document.xml */
  tokenIndex: number;
  paragraphIndex: number;
  original: string;
  text: string;
  bold: boolean;
  fontSize: number;
  align: "left" | "center" | "right";
};

export type DocxParagraph = {
  index: number;
  align: "left" | "center" | "right";
  fieldIds: string[];
};

export type ParsedDocx = {
  kind: "docx";
  fileName: string;
  bytes: ArrayBuffer;
  xml: string;
  /** literal chunks between w:t bodies; rebuild = chunks[0] + text[0] + chunks[1] ... */
  chunks: string[];
  tokens: string[];
  paragraphs: DocxParagraph[];
  fields: DocxField[];
};

const TEXT_RE = /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g;
const PARA_RE = /<w:p\b[\s\S]*?<\/w:p>/g;

function unescapeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&#x2019;/g, "\u2019")
    .replace(/&#x201C;/g, "\u201C")
    .replace(/&#x201D;/g, "\u201D")
    .replace(/&amp;/g, "&");
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function parseDocx(file: File): Promise<ParsedDocx> {
  const bytes = await file.arrayBuffer();
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes.slice(0));
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("This file does not look like a valid .docx document.");
  const xml = await entry.async("string");

  const chunks: string[] = [];
  const tokens: string[] = [];
  const positions: number[] = [];
  let cursor = 0;
  for (const match of xml.matchAll(TEXT_RE)) {
    const start = match.index ?? 0;
    chunks.push(xml.slice(cursor, start) + (match[1] ?? ""));
    tokens.push(match[2] ?? "");
    positions.push(start);
    cursor = start + match[0].length - (match[3] ?? "").length;
  }
  chunks.push(xml.slice(cursor));

  const paraRanges: { start: number; end: number; xml: string }[] = [];
  for (const match of xml.matchAll(PARA_RE)) {
    const start = match.index ?? 0;
    paraRanges.push({ start, end: start + match[0].length, xml: match[0] });
  }

  const paragraphs: DocxParagraph[] = paraRanges.map((_, index) => ({
    index,
    align: "left",
    fieldIds: [],
  }));
  paraRanges.forEach((range, i) => {
    const para = paragraphs[i]!;
    para.align = /w:jc\s+w:val="center"/.test(range.xml)
      ? "center"
      : /w:jc\s+w:val="right"/.test(range.xml)
        ? "right"
        : "left";
  });

  const fields: DocxField[] = [];
  tokens.forEach((token, i) => {
    const value = unescapeXml(token);
    if (!value.trim()) return;
    const pos = positions[i] ?? 0;
    const paragraphIndex = paraRanges.findIndex((r) => pos >= r.start && pos < r.end);
    const paraXml = paraRanges[paragraphIndex]?.xml ?? "";
    const szMatch = /<w:sz\s+w:val="(\d+)"/.exec(paraXml);
    const field: DocxField = {
      id: `t${i}`,
      tokenIndex: i,
      paragraphIndex: paragraphIndex < 0 ? 0 : paragraphIndex,
      original: value,
      text: value,
      bold: /<w:b\/>|<w:b\s/.test(paraXml),
      fontSize: szMatch ? Number(szMatch[1]) / 2 : 11,
      align:
        paragraphIndex >= 0 ? (paragraphs[paragraphIndex]?.align ?? "left") : "left",
    };
    fields.push(field);
    paragraphs[field.paragraphIndex]?.fieldIds.push(field.id);
  });

  return {
    kind: "docx",
    fileName: file.name,
    bytes,
    xml,
    chunks,
    tokens,
    paragraphs: paragraphs.filter((p) => p.fieldIds.length > 0),
    fields,
  };
}

function rebuildXml(doc: ParsedDocx, fields: DocxField[]) {
  const tokens = [...doc.tokens];
  for (const field of fields) {
    tokens[field.tokenIndex] = escapeXml(field.text);
  }
  let out = "";
  doc.chunks.forEach((chunk, i) => {
    out += chunk;
    if (i < tokens.length) out += `${tokens[i]}</w:t>`;
  });
  return out;
}

export async function exportDocx(doc: ParsedDocx, fields: DocxField[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(doc.bytes.slice(0));
  zip.file("word/document.xml", rebuildXml(doc, fields));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/** Renders the edited DOCX text into a simple, faithful-enough PDF. */
export async function docxToPdf(doc: ParsedDocx, fields: DocxField[]): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 64;
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const byId = new Map(fields.map((f) => [f.id, f]));

  for (const para of doc.paragraphs) {
    const paraFields = para.fieldIds
      .map((id) => byId.get(id))
      .filter((f): f is DocxField => Boolean(f));
    const text = paraFields
      .map((f) => f.text)
      .join("")
      .trim();
    const first = paraFields[0];
    const size = Math.min(24, Math.max(9, first?.fontSize ?? 11));
    const useFont = first?.bold ? bold : font;
    const lineHeight = size * 1.45;

    if (!text) {
      y -= lineHeight * 0.6;
      continue;
    }

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (useFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);

    for (const l of lines) {
      if (y < margin) {
        page = pdf.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      const w = useFont.widthOfTextAtSize(l, size);
      const align = first?.align ?? "left";
      const x =
        align === "center"
          ? (pageWidth - w) / 2
          : align === "right"
            ? pageWidth - margin - w
            : margin;
      page.drawText(l, { x, y, size, font: useFont, color: rgb(0.1, 0.1, 0.1) });
      y -= lineHeight;
    }
    y -= lineHeight * 0.35;
  }

  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: "application/pdf" });
}

export function validateDocxFields(fields: DocxField[]) {
  const warnings: { id: string; message: string }[] = [];
  for (const field of fields) {
    if (field.text === field.original) continue;
    if (!field.text.trim()) {
      warnings.push({ id: field.id, message: "Field is empty" });
      continue;
    }
    if (field.text.length > Math.max(12, field.original.length * 1.8)) {
      warnings.push({
        id: field.id,
        message: "Much longer than the original — the line may wrap and shift the layout",
      });
    }
  }
  return warnings;
}
