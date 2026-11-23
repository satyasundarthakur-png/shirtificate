import type { PdfField, ParsedPdf } from "./pdf";
import type { Overlay } from "./overlay";

/** Rebuilds a PDF certificate's text as a simple DOCX, line by line. */
export async function pdfToDocx(doc: ParsedPdf, fields: PdfField[], overlays: Overlay[] = []): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType, PageOrientation } =
    await import("docx");

  const landscape = (doc.pages[0]?.width ?? 612) > (doc.pages[0]?.height ?? 792);

  const children: InstanceType<typeof Paragraph>[] = [];

  doc.pages.forEach((page) => {
    const pageFields = fields
      .filter((f) => f.pageIndex === page.index)
      .slice()
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines: PdfField[][] = [];
    for (const field of pageFields) {
      const last = lines[lines.length - 1];
      const ref = last?.[0];
      if (last && ref && Math.abs(ref.y - field.y) <= Math.max(2, field.height * 0.6)) {
        last.push(field);
      } else {
        lines.push([field]);
      }
    }

    for (const line of lines) {
      const text = line.map((f) => f.text).join(" ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const size = Math.round((line[0]?.fontSize ?? 12) * 2);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [new TextRun({ text, size, font: "Arial" })],
        }),
      );
    }
    for (const overlay of overlays) {
      if (overlay.kind !== "text" || overlay.pageIndex !== page.index || !overlay.text.trim()) continue;
      children.push(new Paragraph({
        alignment: overlay.align === "left" ? AlignmentType.LEFT : overlay.align === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER,
        children: [new TextRun({ text: overlay.text, bold: overlay.bold, size: Math.round(overlay.size * page.height * 2), font: "Arial" })],
      }));
    }
  });

  const file = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
              ...(landscape ? { orientation: PageOrientation.LANDSCAPE } : {}),
            },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(file);
  return blob;
}
