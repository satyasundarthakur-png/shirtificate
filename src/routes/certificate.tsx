import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Printer,
  RotateCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";

import {
  exportPdf,
  measureOverflow,
  parsePdf,
  type ParsedPdf,
  type PdfField,
} from "@/lib/certificate/pdf";
import {
  docxToPdf,
  exportDocx,
  parseDocx,
  validateDocxFields,
  type DocxField,
  type ParsedDocx,
} from "@/lib/certificate/docx";
import { pdfToDocx } from "@/lib/certificate/pdfToDocx";

export const Route = createFileRoute("/certificate")({
  head: () => ({
    meta: [
      { title: "Certificate Editor — Edit, Preview, Print & Download" },
      {
        name: "description",
        content:
          "Upload a PDF or DOCX certificate template, edit names, subjects and dates inline, preview live, then print or download as PDF or DOCX.",
      },
      { property: "og:title", content: "Certificate Editor" },
      {
        property: "og:description",
        content:
          "Upload a certificate template, edit its text fields inline, preview the result and export to PDF or DOCX.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CertificateEditor,
});

type Warning = { id: string; message: string };
type Mode = "edit" | "preview";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Approximates the export's shrink-to-fit so the preview matches the output. */
function fitScale(text: string, boxPx: number, fontPx: number) {
  if (typeof document === "undefined" || !text || boxPx <= 0) return 1;
  measureCtx ||= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 1;
  measureCtx.font = `${fontPx}px Helvetica, Arial, sans-serif`;
  const w = measureCtx.measureText(text).width;
  return w > boxPx ? Math.max(0.3, boxPx / w) : 1;
}

function baseName(name: string) {
  return name.replace(/\.(pdf|docx)$/i, "");
}

function CertificateEditor() {
  const [pdfDoc, setPdfDoc] = useState<ParsedPdf | null>(null);
  const [docxDoc, setDocxDoc] = useState<ParsedDocx | null>(null);
  const [pdfFields, setPdfFields] = useState<PdfField[]>([]);
  const [docxFields, setDocxFields] = useState<DocxField[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fileName = pdfDoc?.fileName ?? docxDoc?.fileName ?? "";
  const hasDoc = Boolean(pdfDoc || docxDoc);
  const warningFor = useMemo(() => {
    const map = new Map<string, string>();
    warnings.forEach((w) => map.set(w.id, w.message));
    return map;
  }, [warnings]);

  async function revalidate(nextPdf: PdfField[], nextDocx: DocxField[]) {
    if (pdfDoc) setWarnings(await measureOverflow(nextPdf));
    else setWarnings(validateDocxFields(nextDocx));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setWarnings([]);
    setMode("edit");
    setBusy("Reading your certificate…");
    try {
      if (/\.pdf$/i.test(file.name)) {
        const parsed = await parsePdf(file);
        setDocxDoc(null);
        setDocxFields([]);
        setPdfDoc(parsed);
        setPdfFields(parsed.fields);
      } else if (/\.docx$/i.test(file.name)) {
        const parsed = await parseDocx(file);
        setPdfDoc(null);
        setPdfFields([]);
        setDocxDoc(parsed);
        setDocxFields(parsed.fields);
      } else {
        setError("Please upload a .pdf or .docx certificate template.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  function updatePdfField(id: string, text: string) {
    const next = pdfFields.map((f) => (f.id === id ? { ...f, text } : f));
    setPdfFields(next);
    void revalidate(next, docxFields);
  }

  function updateDocxField(id: string, text: string) {
    const next = docxFields.map((f) => (f.id === id ? { ...f, text } : f));
    setDocxFields(next);
    void revalidate(pdfFields, next);
  }

  function resetAll() {
    setPdfFields((prev) => prev.map((f) => ({ ...f, text: f.original })));
    setDocxFields((prev) => prev.map((f) => ({ ...f, text: f.original })));
    setWarnings([]);
  }

  function clearDoc() {
    setPdfDoc(null);
    setDocxDoc(null);
    setPdfFields([]);
    setDocxFields([]);
    setWarnings([]);
    setError(null);
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  const downloadPdf = () =>
    run("Building PDF…", async () => {
      if (pdfDoc) {
        download(await exportPdf(pdfDoc, pdfFields), `${baseName(fileName)}-edited.pdf`);
      } else if (docxDoc) {
        download(
          await docxToPdf(docxDoc, docxFields),
          `${baseName(fileName)}-edited.pdf`,
        );
      }
    });

  const downloadDocx = () =>
    run("Building DOCX…", async () => {
      if (docxDoc) {
        download(
          await exportDocx(docxDoc, docxFields),
          `${baseName(fileName)}-edited.docx`,
        );
      } else if (pdfDoc) {
        download(
          await pdfToDocx(pdfDoc, pdfFields),
          `${baseName(fileName)}-edited.docx`,
        );
      }
    });

  const editedCount =
    pdfFields.filter((f) => f.text !== f.original).length +
    docxFields.filter((f) => f.text !== f.original).length;

  const fieldList: { id: string; label: string; value: string; original: string }[] =
    pdfDoc
      ? pdfFields.map((f) => ({
          id: f.id,
          label: f.original,
          value: f.text,
          original: f.original,
        }))
      : docxFields.map((f) => ({
          id: f.id,
          label: f.original,
          value: f.text,
          original: f.original,
        }));

  return (
    <main className="min-h-screen bg-background font-body">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #cert-print, #cert-print * { visibility: visible !important; }
        #cert-print { position: absolute; inset: 0; margin: 0; padding: 0; }
        .no-print { display: none !important; }
      }`}</style>

      <header className="no-print border-b bg-pulse text-pulse-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-6">
          <div>
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-pulse-foreground/60 hover:text-primary"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to hub
            </Link>
            <h1 className="mt-3 font-display text-3xl font-black tracking-tight sm:text-4xl">
              Certificate Editor
            </h1>
            <p className="mt-2 max-w-xl text-sm text-pulse-foreground/70">
              Upload a certificate template, edit its text inline, preview it live, then
              print or download as PDF or DOCX. Everything runs in your browser.
            </p>
          </div>
          {hasDoc && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
                className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                {mode === "edit" ? (
                  <>
                    <Eye className="h-4 w-4" /> Preview
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" /> Edit
                  </>
                )}
              </button>
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button
                onClick={downloadPdf}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" /> PDF
              </button>
              <button
                onClick={downloadDocx}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Download className="h-4 w-4" /> DOCX
              </button>
            </div>
          )}
        </div>
      </header>

      {!hasDoc && (
        <section className="no-print mx-auto max-w-3xl px-6 py-20">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-card px-8 py-20 text-center transition-colors hover:border-primary">
            <Upload className="h-10 w-10 text-primary" />
            <span className="mt-6 font-display text-xl font-extrabold">
              Upload a certificate template
            </span>
            <span className="mt-2 text-sm text-muted-foreground">
              PDF or DOCX — text layers are detected automatically
            </span>
            <input
              type="file"
              accept=".pdf,.docx,application/pdf"
              className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <span className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
              Choose file
            </span>
          </label>
          {busy && (
            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {busy}
            </p>
          )}
          {error && (
            <p className="mt-6 text-center text-sm font-medium text-destructive">
              {error}
            </p>
          )}
        </section>
      )}

      {hasDoc && (
        <section className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[340px_1fr]">
          {/* Field panel */}
          <aside className="no-print">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold">Editable fields</h2>
              <button
                onClick={clearDoc}
                className="text-xs font-semibold text-muted-foreground underline hover:text-primary"
              >
                New file
              </button>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {fieldList.length} detected · {editedCount} edited
            </p>
            {warnings.length > 0 && (
              <div className="mt-4 flex gap-2 rounded-lg border border-primary/40 bg-accent p-3 text-xs text-accent-foreground">
                <TriangleAlert className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  {warnings.length} field{warnings.length > 1 ? "s" : ""} may not fit the
                  original layout.
                </span>
              </div>
            )}
            <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-2">
              {fieldList.map((f) => {
                const warn = warningFor.get(f.id);
                return (
                  <div key={f.id}>
                    <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {f.original.slice(0, 42)}
                    </label>
                    <input
                      ref={(el) => {
                        inputRefs.current[f.id] = el;
                      }}
                      value={f.value}
                      onFocus={() => setActiveId(f.id)}
                      onBlur={() => setActiveId(null)}
                      onChange={(e) =>
                        pdfDoc
                          ? updatePdfField(f.id, e.target.value)
                          : updateDocxField(f.id, e.target.value)
                      }
                      className={`mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:border-primary ${
                        warn ? "border-primary" : ""
                      }`}
                    />
                    {warn && <p className="mt-1 text-[11px] text-primary">{warn}</p>}
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Preview */}
          <div id="cert-print" className="min-w-0">
            {pdfDoc &&
              pdfDoc.pages.map((page) => (
                <div
                  key={page.index}
                  className="relative mx-auto mb-8 w-full max-w-[1000px] overflow-hidden rounded-lg border bg-white shadow-sm"
                  style={{
                    aspectRatio: `${page.displayWidth} / ${page.displayHeight}`,
                    containerType: "size",
                  }}
                >
                  <img
                    src={page.image}
                    alt={`Certificate page ${page.index + 1}`}
                    className="block h-full w-full"
                  />
                  {pdfFields
                    .filter((f) => f.pageIndex === page.index)
                    .map((f) => {
                      const changed = f.text !== f.original;
                      const pct = (v: number, total: number) => `${(v / total) * 100}%`;
                      const show = changed || mode === "edit";
                      if (!show) return null;
                      return (
                        <div
                          key={f.id}
                          onClick={() => inputRefs.current[f.id]?.focus()}
                          className={`absolute flex items-center ${
                            mode === "edit" ? "cursor-text" : ""
                          }`}
                          style={{
                            left: pct(f.left, page.displayWidth),
                            top: pct(f.top, page.displayHeight),
                            width: pct(Math.max(f.dWidth, 8), page.displayWidth),
                            height: pct(f.dHeight * 1.35, page.displayHeight),
                            backgroundColor: changed
                              ? `rgb(${f.bg.r},${f.bg.g},${f.bg.b})`
                              : "transparent",
                            outline:
                              mode === "edit"
                                ? activeId === f.id
                                  ? "2px solid var(--primary)"
                                  : "1px dashed rgba(120,120,120,.55)"
                                : "none",
                          }}
                        >
                          {changed && (
                            <span
                              className="w-full whitespace-nowrap text-black"
                              style={{
                                fontSize: `${(f.dHeight / page.displayWidth) * 100 * 0.95}cqw`,
                                lineHeight: 1,
                                transformOrigin: "left center",
                                transform: `scale(${fitScale(f.text, f.dWidth, f.dHeight * 0.95)})`,
                              }}
                            >
                              {f.text}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}

            {docxDoc && (
              <div className="mx-auto w-full max-w-[850px] rounded-lg border bg-white p-16 shadow-sm">
                {docxDoc.paragraphs.map((para) => {
                  const parts = para.fieldIds
                    .map((id) => docxFields.find((f) => f.id === id))
                    .filter((f): f is DocxField => Boolean(f));
                  const first = parts[0];
                  return (
                    <p
                      key={para.index}
                      className="mb-3 leading-relaxed text-neutral-900"
                      style={{
                        textAlign: para.align,
                        fontSize: `${Math.min(30, Math.max(11, first?.fontSize ?? 11))}px`,
                        fontWeight: first?.bold ? 700 : 400,
                      }}
                    >
                      {parts.map((f) => (
                        <span
                          key={f.id}
                          onClick={() => inputRefs.current[f.id]?.focus()}
                          className={
                            mode === "edit"
                              ? `cursor-text rounded-sm px-0.5 ${
                                  activeId === f.id
                                    ? "bg-primary/20 outline outline-1 outline-primary"
                                    : "outline outline-1 outline-dashed outline-neutral-300"
                                }`
                              : ""
                          }
                        >
                          {f.text}
                        </span>
                      ))}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {busy && hasDoc && (
        <div className="no-print fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-full bg-pulse px-5 py-3 text-sm text-pulse-foreground shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> {busy}
        </div>
      )}
      {error && hasDoc && (
        <div className="no-print fixed bottom-6 right-6 rounded-md bg-destructive px-5 py-3 text-sm text-destructive-foreground shadow-lg">
          {error}
        </div>
      )}

      {!hasDoc && (
        <section className="no-print mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: FileText,
                title: "Detects text layers",
                body: "Names, subjects and dates are pulled straight out of the PDF or DOCX.",
              },
              {
                icon: Eye,
                title: "Live preview",
                body: "See every edit on the real template before you commit to it.",
              },
              {
                icon: Download,
                title: "Print or export",
                body: "Download the result as a PDF or DOCX, or print it directly.",
              },
            ].map((c) => (
              <div key={c.title} className="rounded-xl border bg-card p-6">
                <c.icon className="h-6 w-6 text-primary" />
                <p className="mt-4 font-display font-bold">{c.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
