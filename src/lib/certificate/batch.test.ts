import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { autoMap, generateBatch, parseRecipients, personalize, recipientFilename } from "./batch";
import { parseDocx } from "./docx";
import type { PdfField } from "./pdf";

const csv = 'name,subject\r\n"Alex, Smith",CPR\r\n"Sam ""Sunny"" Lee",First Aid\r\n';
test("CSV recipients preserve quotes, commas and every record", () => {
  const result = parseRecipients(csv);
  assert.deepEqual(result.headers, ["name", "subject"]);
  assert.deepEqual(result.rows, [["Alex, Smith", "CPR"], ['Sam "Sunny" Lee', "First Aid"]]);
  assert.throws(() => parseRecipients("name,name\nA,B"), /unique/);
  assert.throws(() => parseRecipients("name,date\nA"), /expected 2/);
  assert.throws(() => parseRecipients("name\n"), /no recipients/);
});
test("each CSV record personalizes mapped fields without changing the template", () => {
  const fields = [{ id: "a", text: "{{name}}" }, { id: "b", text: "Certificate" }];
  const mapping = autoMap(fields, ["name"]);
  assert.deepEqual(personalize(fields, mapping, ["name"], ["Alex"]), [{ id: "a", text: "Alex" }, { id: "b", text: "Certificate" }]);
  assert.equal(fields[0]?.text, "{{name}}");
  assert.throws(() => personalize(fields, mapping, ["name"], [""]), /empty/);
});
test("ZIP filenames remain unique and cannot create paths", () => {
  assert.equal(recipientFilename(0, "Alex/Smith", "pdf"), "0001-Alex_Smith.pdf");
  assert.equal(recipientFilename(1, "Alex/Smith", "docx"), "0002-Alex_Smith.docx");
});
test("ZIP contains one valid personalized DOCX per CSV record", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{{name}}</w:t></w:r></w:p></w:body></w:document>');
  const file = new File([await zip.generateAsync({ type: "arraybuffer" })], "template.docx");
  const doc = await parseDocx(file);
  const recipients = parseRecipients("name\nAlex\nSam");
  const result = await generateBatch({ docxDoc: doc, pdfDoc: null, imgDoc: null, docxFields: doc.fields, pdfFields: [], overlays: [] }, recipients, autoMap(doc.fields, recipients.headers), "docx", "name", () => {}, new AbortController().signal);
  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  assert.deepEqual(Object.keys(archive.files), ["0001-Alex.docx", "0002-Sam.docx"]);
  for (const name of ["Alex", "Sam"]) {
    const entry = archive.file(name === "Alex" ? "0001-Alex.docx" : "0002-Sam.docx");
    assert.ok(entry);
    const individual = await JSZip.loadAsync(await entry.async("uint8array"));
    const xml = await individual.file("word/document.xml")?.async("string");
    assert.ok(xml?.includes(`<w:t>${name}</w:t>`));
    assert.equal(xml?.match(/<\/w:t>/g)?.length, 1);
  }
});
test("ZIP contains one printable PDF per CSV record", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([612, 792]).drawText("Name", { x: 100, y: 400, font, size: 12 });
  const field: PdfField = { id: "name", pageIndex: 0, original: "Name", text: "Name", x: 100, y: 400, width: 150, height: 12, fontSize: 12, left: 100, top: 380, dWidth: 150, dHeight: 12, bg: { r: 255, g: 255, b: 255 } };
  const bytes = await pdf.save();
  const result = await generateBatch({ docxDoc: null, imgDoc: null, docxFields: [], overlays: [], pdfFields: [field], pdfDoc: { kind: "pdf", fileName: "template.pdf", bytes: bytes.buffer as ArrayBuffer, fields: [field], pages: [] } }, parseRecipients("name\nAlex\nSam"), { name: "name" }, "pdf", "name", () => {}, new AbortController().signal);
  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  assert.equal(Object.keys(archive.files).length, 2);
  for (const entry of Object.values(archive.files)) assert.equal((await PDFDocument.load(await entry.async("uint8array"))).getPageCount(), 1);
});
