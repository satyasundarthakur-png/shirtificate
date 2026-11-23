import { useEffect, useRef, useState } from "react";
import { Download, Files, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { autoMap, downloadBatch, generateBatch, parseRecipients, type BatchTemplate, type FieldMapping, type Recipients } from "@/lib/certificate/batch";

export function BatchGenerator({ template }: { template: BatchTemplate }) {
  const [recipients, setRecipients] = useState<Recipients | null>(null);
  const [csvName, setCsvName] = useState("");
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [format, setFormat] = useState<"pdf" | "docx">("pdf");
  const [nameColumn, setNameColumn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ blob: Blob; warnings: string[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const { pdfDoc, docxDoc, imgDoc, pdfFields, docxFields, overlays } = template;
  const fields = [...(pdfDoc ? pdfFields : docxFields), ...overlays.filter((o) => o.kind === "text")];

  useEffect(() => {
    controller.current?.abort();
    setProgress(null);
    setResult(null);
    setMapping({});
    setRecipients(null);
    setCsvName("");
  }, [pdfDoc, docxDoc, imgDoc]);

  useEffect(() => {
    controller.current?.abort();
    setProgress(null);
    setResult(null);
    return () => { controller.current?.abort(); };
  }, [pdfFields, docxFields, overlays, recipients, mapping, format, nameColumn]);

  async function uploadCsv(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setRecipients(null);
    try {
      const parsed = parseRecipients(await file.text());
      setRecipients(parsed);
      setMapping(autoMap(fields, parsed.headers));
      setNameColumn(parsed.headers.find((h) => /^(name|recipient|full[ _]?name)$/i.test(h)) ?? parsed.headers[0] ?? "");
      setCsvName(file.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read that CSV."); }
  }

  async function generate() {
    if (!recipients) return;
    const abort = new AbortController();
    controller.current = abort;
    setProgress(0);
    setResult(null);
    setError(null);
    try {
      const generated = await generateBatch(template, recipients, mapping, format, nameColumn, (done) => {
        if (!abort.signal.aborted) setProgress(done);
      }, abort.signal);
      if (!abort.signal.aborted) setResult(generated);
    } catch (e) {
      if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Batch generation failed.");
    } finally { if (!abort.signal.aborted) setProgress(null); }
  }

  const matched = fields.filter((f) => mapping[f.id]).length;
  const running = progress !== null;
  const example = recipients?.rows[0];

  return (
    <section className="no-print border-b bg-muted/40">
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Files className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold">Batch certificates</h2>
              {recipients && <p className="break-all text-xs text-muted-foreground">{csvName} · {recipients.rows.length} recipients · {matched} matched fields</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={running} onClick={() => input.current?.click()}><Upload />{recipients ? "Replace CSV" : "Upload recipient CSV"}</Button>
            {recipients && <Button variant="ghost" size="icon" aria-label="Clear recipients" disabled={running} onClick={() => { setRecipients(null); setError(null); }}><X /></Button>}
            <input ref={input} aria-label="Recipient CSV" className="sr-only" type="file" accept=".csv,text/csv" onChange={(e) => { void uploadCsv(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
        {error && <p role="alert" className="mt-3 break-words text-sm text-destructive">{error}</p>}
        {recipients && <div className="mt-5 space-y-5">
          {!fields.length && <p className="text-sm text-destructive">Add a text box to this template before matching recipients.</p>}
          {fields.length > 0 && <div className="max-h-80 overflow-auto rounded-md border bg-background">
            <div className="grid grid-cols-2 gap-3 border-b px-3 py-2 text-xs font-semibold text-muted-foreground sm:grid-cols-3"><span>Certificate field</span><span>CSV column</span><span className="hidden sm:block">First recipient</span></div>
            {fields.map((field, index) => <div key={field.id} className="grid grid-cols-2 items-center gap-3 border-b px-3 py-2 last:border-b-0 sm:grid-cols-3">
              <span className="min-w-0 break-words text-sm" title={field.text}>{index + 1}. {field.text || "Empty text box"}</span>
              <Select value={mapping[field.id] || "__keep"} disabled={running} onValueChange={(value) => setMapping((prev) => ({ ...prev, [field.id]: value === "__keep" ? "" : value }))}>
                <SelectTrigger aria-label={`CSV column for field ${index + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__keep">Keep template text</SelectItem>{recipients.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
              </Select>
              <span className="hidden min-w-0 break-words text-sm sm:block">{mapping[field.id] ? example?.[recipients.headers.indexOf(mapping[field.id] ?? "")] || "(empty)" : field.text}</span>
            </div>)}
          </div>}
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-36"><span className="mb-1 block text-xs font-semibold">File format</span><Select value={format} disabled={running} onValueChange={(v) => setFormat(v === "docx" ? "docx" : "pdf")}><SelectTrigger aria-label="Batch file format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pdf">PDF</SelectItem><SelectItem value="docx">DOCX</SelectItem></SelectContent></Select></div>
            <div className="w-48 max-w-full"><span className="mb-1 block text-xs font-semibold">Filename column</span><Select value={nameColumn} disabled={running} onValueChange={setNameColumn}><SelectTrigger aria-label="Filename column"><SelectValue /></SelectTrigger><SelectContent>{recipients.headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent></Select></div>
            <Button disabled={running || !matched} onClick={() => void generate()}>{running ? <Loader2 className="animate-spin" /> : <Files />}{running ? `${progress} / ${recipients.rows.length}` : "Generate ZIP"}</Button>
            {running && <Button variant="outline" onClick={() => { controller.current?.abort(); setProgress(null); }}>Cancel</Button>}
            {result && <Button onClick={() => downloadBatch(result.blob, `certificates-${format}.zip`)}><Download />Download ZIP</Button>}
          </div>
          {running && <progress aria-label="Certificate generation progress" className="h-2 w-full accent-primary" value={progress ?? 0} max={recipients.rows.length} />}
          {result && <p role="status" className="text-sm">{recipients.rows.length} {format.toUpperCase()} certificates ready.{result.warnings.length > 0 && <span className="text-destructive"> {result.warnings.length} layout warnings; review layout-warnings.txt in the ZIP before printing.</span>}</p>}
          {((pdfDoc && format === "docx") || (docxDoc && format === "pdf")) && <p className="text-xs text-muted-foreground">{pdfDoc ? "PDF → DOCX: text-only conversion; artwork and original positioning are not retained." : "DOCX → PDF: simplified text layout; original artwork and formatting are not retained."}</p>}
          {imgDoc && format === "docx" && <p className="text-xs text-muted-foreground">Image certificates are placed in DOCX as a finished image.</p>}
        </div>}
      </div>
    </section>
  );
}
