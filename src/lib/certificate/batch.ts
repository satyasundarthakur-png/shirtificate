import Papa from "papaparse";
import type { DocxField, ParsedDocx } from "./docx";
import type { PdfField, ParsedPdf } from "./pdf";
import type { Overlay } from "./overlay";
import type { ParsedImage } from "./image";

export type Recipients = { headers: string[]; rows: string[][] };
export type BatchField = { id: string; text: string };
export type FieldMapping = Record<string, string>;
export type BatchTemplate = {
  pdfDoc: ParsedPdf | null;
  docxDoc: ParsedDocx | null;
  imgDoc: ParsedImage | null;
  pdfFields: PdfField[];
  docxFields: DocxField[];
  overlays: Overlay[];
};

export function parseRecipients(csv: string): Recipients {
  const result = Papa.parse<string[]>(csv.replace(/^\uFEFF/, ""), { delimiter: ",", skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error(`Invalid CSV: ${result.errors[0]?.message ?? "Could not read rows"}`);
  const [rawHeaders, ...rows] = result.data;
  const headers = rawHeaders?.map((value) => value.trim()) ?? [];
  if (!headers.length || headers.some((header) => !header)) throw new Error("Every CSV column needs a header.");
  if (new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) throw new Error("CSV column headers must be unique.");
  if (!rows.length) throw new Error("The CSV has no recipients. Add at least one row below the headers.");
  const invalid = rows.findIndex((row) => row.length !== headers.length);
  if (invalid >= 0) throw new Error(`Recipient ${invalid + 1} has ${rows[invalid]?.length} values; expected ${headers.length}.`);
  return { headers, rows };
}

export function autoMap(fields: BatchField[], headers: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  for (const field of fields) {
    const label = field.text.trim().replace(/^\{\{\s*|\s*\}\}$/g, "").toLowerCase();
    const header = headers.find((h) => h.toLowerCase() === label);
    if (header) mapping[field.id] = header;
  }
  return mapping;
}

export function personalize<T extends BatchField>(fields: T[], mapping: FieldMapping, headers: string[], row: string[]): T[] {
  return fields.map((field) => {
    const column = mapping[field.id];
    if (!column) return { ...field };
    const index = headers.indexOf(column);
    if (index < 0) throw new Error(`Missing CSV column: ${column}`);
    const text = row[index] ?? "";
    if (!text.trim()) throw new Error(`Column “${column}” is empty.`);
    return { ...field, text };
  });
}

export function recipientFilename(index: number, label: string, format: "pdf" | "docx") {
  const safe = label.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim().slice(0, 90) || "recipient";
  return `${String(index + 1).padStart(4, "0")}-${safe}.${format}`;
}

async function imageDocx(doc: ParsedImage, overlays: Overlay[]) {
  const { exportImage } = await import("./image");
  const { Document, Packer, Paragraph, ImageRun } = await import("docx");
  const blob = await exportImage(doc, overlays);
  const width = 650;
  const height = width * doc.height / doc.width;
  return Packer.toBlob(new Document({ sections: [{
    properties: { page: { size: { width: Math.round(width * 15), height: Math.round(height * 15) }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
    children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [new ImageRun({ type: "png", data: new Uint8Array(await blob.arrayBuffer()), transformation: { width, height } })] })],
  }] }));
}

export async function generateBatch(
  template: BatchTemplate, recipients: Recipients, mapping: FieldMapping,
  format: "pdf" | "docx", nameColumn: string,
  onProgress: (completed: number) => void, signal: AbortSignal,
): Promise<{ blob: Blob; warnings: string[] }> {
  if (!Object.values(mapping).some(Boolean)) throw new Error("Match at least one certificate field to a CSV column.");
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const warnings: string[] = [];
  for (const [index, row] of recipients.rows.entries()) {
    if (signal.aborted) throw new DOMException("Batch cancelled", "AbortError");
    try {
      const pdfFields = personalize(template.pdfFields, mapping, recipients.headers, row);
      const docxFields = personalize(template.docxFields, mapping, recipients.headers, row);
      const overlays = personalize(template.overlays, mapping, recipients.headers, row);
      let blob: Blob;
      if (template.pdfDoc) {
        const { exportPdf, measureOverflow } = await import("./pdf");
        const checks = await measureOverflow(pdfFields);
        warnings.push(...checks.map((w) => `Recipient ${index + 1}: ${w.message}`));
        blob = format === "pdf" ? await exportPdf(template.pdfDoc, pdfFields, overlays)
          : await (await import("./pdfToDocx")).pdfToDocx(template.pdfDoc, pdfFields, overlays);
      } else if (template.docxDoc) {
        const { exportDocx, docxToPdf, validateDocxFields } = await import("./docx");
        warnings.push(...validateDocxFields(docxFields).map((w) => `Recipient ${index + 1}: ${w.message}`));
        blob = format === "pdf" ? await docxToPdf(template.docxDoc, docxFields) : await exportDocx(template.docxDoc, docxFields);
      } else if (template.imgDoc) {
        blob = format === "pdf" ? await (await import("./image")).imageToPdf(template.imgDoc, overlays)
          : await imageDocx(template.imgDoc, overlays);
      } else throw new Error("Upload a certificate template first.");
      const label = row[recipients.headers.indexOf(nameColumn)] ?? "recipient";
      zip.file(recipientFilename(index, label, format), await blob.arrayBuffer());
      onProgress(index + 1);
      await new Promise((resolve) => setTimeout(resolve, 0));
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(`Recipient ${index + 1}: ${error instanceof Error ? error.message : "Export failed"}`);
    }
  }
  if (signal.aborted) throw new DOMException("Batch cancelled", "AbortError");
  if (warnings.length) zip.file("layout-warnings.txt", warnings.join("\n"));
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  return { blob, warnings };
}

export function downloadBatch(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
