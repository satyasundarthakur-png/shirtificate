import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  Eraser,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
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
import { exportImage, imageToPdf, parseImage, type ParsedImage } from "@/lib/certificate/image";
import { createEraseBox, createOverlay, type Overlay } from "@/lib/certificate/overlay";
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
  return name.replace(/\.(pdf|docx|jpe?g|png|webp)$/i, "");
}

/** Draggable text-box overlays rendered on top of a PDF page or image preview. */
function OverlayBoxes({
  overlays,
  pageIndex,
  mode,
  activeId,
  setActiveId,
  startDrag,
  removeOverlay,
}: {
  overlays: Overlay[];
  pageIndex: number;
  mode: Mode;
  activeId: string | null;
  setActiveId: (id: string) => void;
  startDrag: (e: React.PointerEvent, o: Overlay) => void;
  removeOverlay: (id: string) => void;
}) {
  return (
    <>
      {overlays
        .filter((o) => o.pageIndex === pageIndex)
        .map((o) =>
          o.kind === "erase" ? (
            <div
              key={o.id}
              onPointerDown={(e) => {
                setActiveId(o.id);
                startDrag(e, o);
              }}
              className={`absolute select-none ${
                mode === "edit" ? "cursor-move touch-none" : "pointer-events-none"
              } ${activeId === o.id && mode === "edit" ? "outline outline-1 outline-dashed outline-primary" : "outline outline-1 outline-dashed outline-transparent"}`}
              style={{
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                width: `${o.width * 100}%`,
                height: `${o.height * 100}%`,
                backgroundColor: o.color,
              }}
            >
              {mode === "edit" && activeId === o.id && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeOverlay(o.id)}
                  aria-label="Delete erase box"
                  className="pointer-events-auto absolute -right-3 -top-3 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <div
              key={o.id}
              onPointerDown={(e) => {
                setActiveId(o.id);
                startDrag(e, o);
              }}
              className={`absolute select-none ${
                mode === "edit" ? "cursor-move touch-none" : "pointer-events-none"
              } ${activeId === o.id && mode === "edit" ? "outline outline-1 outline-dashed outline-primary" : ""}`}
              style={{
                left: `${o.x * 100}%`,
                top: `${o.y * 100}%`,
                width: `${o.width * 100}%`,
                textAlign: o.align,
                color: o.color,
                fontWeight: o.bold ? 700 : 400,
                fontFamily: "Helvetica, Arial, sans-serif",
                fontSize: `${o.size * 100}cqh`,
                lineHeight: 1.1,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {o.text}
              {mode === "edit" && activeId === o.id && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeOverlay(o.id)}
                  aria-label="Delete text box"
                  className="pointer-events-auto absolute -right-3 -top-3 rounded-full bg-destructive p-1 text-destructive-foreground shadow"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ),
        )}
    </>
  );
}

function CertificateEditor() {
  const [pdfDoc, setPdfDoc] = useState<ParsedPdf | null>(null);
  const [docxDoc, setDocxDoc] = useState<ParsedDocx | null>(null);
  const [imgDoc, setImgDoc] = useState<ParsedImage | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [pdfFields, setPdfFields] = useState<PdfField[]>([]);
  const [docxFields, setDocxFields] = useState<DocxField[]>([]);

  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [mode, setMode] = useState<Mode>("edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fileName = pdfDoc?.fileName ?? docxDoc?.fileName ?? imgDoc?.fileName ?? "";
  const hasDoc = Boolean(pdfDoc || docxDoc || imgDoc);
  const canOverlay = Boolean(pdfDoc || imgDoc);
  const warningFor = useMemo(() => {
    const map = new Map<string, string>();
    warnings.forEach((w) => map.set(w.id, w.message));
    return map;
  }, [warnings]);

  async function revalidate(nextPdf: PdfField[], nextDocx: DocxField[]) {
    if (pdfDoc) setWarnings(await measureOverflow(nextPdf));
    else if (docxDoc) setWarnings(validateDocxFields(nextDocx));
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setWarnings([]);
    setOverlays([]);
    setMode("edit");
    setBusy("Reading your certificate…");
    try {
      if (/\.pdf$/i.test(file.name)) {
        const parsed = await parsePdf(file);
        setDocxDoc(null);
        setDocxFields([]);
        setImgDoc(null);
        setPdfDoc(parsed);
        setPdfFields(parsed.fields);
      } else if (/\.docx$/i.test(file.name)) {
        const parsed = await parseDocx(file);
        setPdfDoc(null);
        setPdfFields([]);
        setImgDoc(null);
        setDocxDoc(parsed);
        setDocxFields(parsed.fields);
      } else if (/\.(jpe?g|png|webp)$/i.test(file.name) || /^image\//.test(file.type)) {
        const parsed = await parseImage(file);
        setPdfDoc(null);
        setPdfFields([]);
        setDocxDoc(null);
        setDocxFields([]);
        setImgDoc(parsed);
        setOverlays([createOverlay(0, "Your text here")]);
      } else {
        setError("Please upload a PDF, DOCX, JPG or PNG certificate template.");
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

  function updateOverlay(id: string, patch: Partial<Overlay>) {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function addOverlay(pageIndex = 0) {
    const o = createOverlay(pageIndex);
    setOverlays((prev) => [...prev, o]);
    setActiveId(o.id);
    setMode("edit");
  }

  function addEraseBox(pageIndex = 0) {
    const o = createEraseBox(pageIndex);
    setOverlays((prev) => [...prev, o]);
    setActiveId(o.id);
    setMode("edit");
  }

  function clearOverlays() {
    setOverlays([]);
    setActiveId(null);
  }

  function removeOverlay(id: string) {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
  }

  function startDrag(e: React.PointerEvent, o: Overlay) {
    if (mode !== "edit") return;
    const box = e.currentTarget as HTMLElement;
    const surface = box.parentElement;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const dx = e.clientX - (rect.left + o.x * rect.width);
    const dy = e.clientY - (rect.top + o.y * rect.height);
    setActiveId(o.id);
    const move = (ev: PointerEvent) => {
      const nx = (ev.clientX - dx - rect.left) / rect.width;
      const ny = (ev.clientY - dy - rect.top) / rect.height;
      updateOverlay(o.id, {
        x: Math.min(1 - 0.02, Math.max(-0.05, nx)),
        y: Math.min(1 - 0.01, Math.max(-0.02, ny)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function resetAll() {
    setPdfFields((prev) => prev.map((f) => ({ ...f, text: f.original })));
    setDocxFields((prev) => prev.map((f) => ({ ...f, text: f.original })));
    setOverlays([]);
    setWarnings([]);
  }

  function clearDoc() {
    setPdfDoc(null);
    setDocxDoc(null);
    setImgDoc(null);
    setPdfFields([]);
    setDocxFields([]);
    setOverlays([]);
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
        download(await exportPdf(pdfDoc, pdfFields, overlays), `${baseName(fileName)}-edited.pdf`);
      } else if (imgDoc) {
        download(await imageToPdf(imgDoc, overlays), `${baseName(fileName)}-edited.pdf`);
      } else if (docxDoc) {
        download(await docxToPdf(docxDoc, docxFields), `${baseName(fileName)}-edited.pdf`);
      }
    });

  const downloadImage = () =>
    run("Building image…", async () => {
      if (!imgDoc) return;
      download(await exportImage(imgDoc, overlays), `${baseName(fileName)}-edited.png`);
    });

  const downloadDocx = () =>
    run("Building DOCX…", async () => {
      if (docxDoc) {
        download(await exportDocx(docxDoc, docxFields), `${baseName(fileName)}-edited.docx`);
      } else if (pdfDoc) {
        download(await pdfToDocx(pdfDoc, pdfFields), `${baseName(fileName)}-edited.docx`);
      }
    });

  const editedCount =
    pdfFields.filter((f) => f.text !== f.original).length +
    docxFields.filter((f) => f.text !== f.original).length;

  const fieldList: { id: string; label: string; value: string; original: string }[] = pdfDoc
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
              Upload a PDF, DOCX, JPG or PNG certificate, edit its text inline, add your own text
              boxes anywhere, then print or download. Everything runs in your browser.
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
              {canOverlay && (
                <>
                  <button
                    onClick={() => addOverlay(0)}
                    className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
                  >
                    <Plus className="h-4 w-4" /> Add text
                  </button>
                  <button
                    onClick={() => addEraseBox(0)}
                    className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
                  >
                    <Eraser className="h-4 w-4" /> Erase
                  </button>
                </>
              )}
              <button
                onClick={resetAll}
                className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
              {canOverlay && overlays.length > 0 && (
                <button
                  onClick={clearOverlays}
                  className="inline-flex items-center gap-2 rounded-md border border-pulse-foreground/20 px-4 py-2 text-sm font-semibold hover:border-primary"
                >
                  <Trash2 className="h-4 w-4" /> Clean
                </button>
              )}
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
              {imgDoc ? (
                <button
                  onClick={downloadImage}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <ImageIcon className="h-4 w-4" /> PNG
                </button>
              ) : (
                <button
                  onClick={downloadDocx}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Download className="h-4 w-4" /> DOCX
                </button>
              )}
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
              PDF, DOCX, JPG or PNG — text layers are detected automatically, and you can add your
              own text boxes to scans and images
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
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
            <p className="mt-6 text-center text-sm font-medium text-destructive">{error}</p>
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
              {fieldList.length} detected · {editedCount} edited · {overlays.length} added
            </p>
            {canOverlay && fieldList.length === 0 && (
              <div className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                No editable text layer found — this looks like a scan or an image. Use
                <strong className="text-foreground"> Add text</strong> to place your own text boxes
                anywhere on it.
              </div>
            )}

            {warnings.length > 0 && (
              <div className="mt-4 flex gap-2 rounded-lg border border-primary/40 bg-accent p-3 text-xs text-accent-foreground">
                <TriangleAlert className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  {warnings.length} field{warnings.length > 1 ? "s" : ""} may not fit the original
                  layout.
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

            {canOverlay && (
              <div className="mt-8">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-extrabold">Text &amp; erase</h2>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => addOverlay(0)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline"
                    >
                      <Plus className="h-3.5 w-3.5" /> Text
                    </button>
                    <button
                      onClick={() => addEraseBox(0)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary underline"
                    >
                      <Eraser className="h-3.5 w-3.5" /> Erase
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-4">
                  {overlays.map((o) =>
                    o.kind === "erase" ? (
                      <div
                        key={o.id}
                        className={`rounded-lg border bg-card p-3 ${
                          activeId === o.id ? "border-primary" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 text-xs font-semibold">
                            <Eraser className="h-3.5 w-3.5" /> Erase box
                          </span>
                          <button
                            onClick={() => removeOverlay(o.id)}
                            aria-label="Delete erase box"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                          <label className="block">
                            Width
                            <input
                              type="range"
                              min={0.02}
                              max={1}
                              step={0.01}
                              value={o.width}
                              onChange={(e) =>
                                updateOverlay(o.id, { width: Number(e.target.value) })
                              }
                              className="mt-1 w-full accent-[var(--primary)]"
                            />
                          </label>
                          <label className="block">
                            Height
                            <input
                              type="range"
                              min={0.02}
                              max={1}
                              step={0.01}
                              value={o.height}
                              onChange={(e) =>
                                updateOverlay(o.id, { height: Number(e.target.value) })
                              }
                              className="mt-1 w-full accent-[var(--primary)]"
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="color"
                            value={o.color}
                            onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
                            className="h-8 w-10 cursor-pointer rounded border bg-background"
                            aria-label="Fill colour"
                          />
                          <span className="text-[11px] text-muted-foreground">
                            Match the background to hide it, or pick a colour to cover it
                          </span>
                          {pdfDoc && pdfDoc.pages.length > 1 && (
                            <select
                              value={o.pageIndex}
                              onChange={(e) =>
                                updateOverlay(o.id, { pageIndex: Number(e.target.value) })
                              }
                              className="rounded-md border bg-background px-2 py-1.5 text-xs"
                            >
                              {pdfDoc.pages.map((p) => (
                                <option key={p.index} value={p.index}>
                                  Page {p.index + 1}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={o.id}
                        className={`rounded-lg border bg-card p-3 ${
                          activeId === o.id ? "border-primary" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            value={o.text}
                            onFocus={() => setActiveId(o.id)}
                            onChange={(e) => updateOverlay(o.id, { text: e.target.value })}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => removeOverlay(o.id)}
                            aria-label="Delete text box"
                            className="mt-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-muted-foreground">
                          <label className="block">
                            Size
                            <input
                              type="range"
                              min={0.01}
                              max={0.2}
                              step={0.002}
                              value={o.size}
                              onChange={(e) =>
                                updateOverlay(o.id, { size: Number(e.target.value) })
                              }
                              className="mt-1 w-full accent-[var(--primary)]"
                            />
                          </label>
                          <label className="block">
                            Box width
                            <input
                              type="range"
                              min={0.05}
                              max={1}
                              step={0.01}
                              value={o.width}
                              onChange={(e) =>
                                updateOverlay(o.id, { width: Number(e.target.value) })
                              }
                              className="mt-1 w-full accent-[var(--primary)]"
                            />
                          </label>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <input
                            type="color"
                            value={o.color}
                            onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
                            className="h-8 w-10 cursor-pointer rounded border bg-background"
                            aria-label="Text colour"
                          />
                          <button
                            onClick={() => updateOverlay(o.id, { bold: !o.bold })}
                            className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                              o.bold ? "border-primary text-primary" : ""
                            }`}
                          >
                            B
                          </button>
                          {(["left", "center", "right"] as const).map((a) => (
                            <button
                              key={a}
                              onClick={() => updateOverlay(o.id, { align: a })}
                              className={`rounded-md border px-2.5 py-1.5 text-xs capitalize ${
                                o.align === a ? "border-primary text-primary" : ""
                              }`}
                            >
                              {a}
                            </button>
                          ))}
                          {pdfDoc && pdfDoc.pages.length > 1 && (
                            <select
                              value={o.pageIndex}
                              onChange={(e) =>
                                updateOverlay(o.id, { pageIndex: Number(e.target.value) })
                              }
                              className="rounded-md border bg-background px-2 py-1.5 text-xs"
                            >
                              {pdfDoc.pages.map((p) => (
                                <option key={p.index} value={p.index}>
                                  Page {p.index + 1}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                  {overlays.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nothing added yet. Use Text to add a caption, or Erase to cover up unwanted
                      marks, then drag it into place on the preview.
                    </p>
                  )}
                </div>
              </div>
            )}
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
                  <OverlayBoxes
                    overlays={overlays}
                    pageIndex={page.index}
                    mode={mode}
                    activeId={activeId}
                    setActiveId={setActiveId}
                    startDrag={startDrag}
                    removeOverlay={removeOverlay}
                  />
                </div>
              ))}

            {imgDoc && (
              <div
                className="relative mx-auto mb-8 w-full max-w-[1000px] overflow-hidden rounded-lg border bg-white shadow-sm"
                style={{
                  aspectRatio: `${imgDoc.width} / ${imgDoc.height}`,
                  containerType: "size",
                }}
              >
                <img src={imgDoc.dataUrl} alt={imgDoc.fileName} className="block h-full w-full" />
                <OverlayBoxes
                  overlays={overlays}
                  pageIndex={0}
                  mode={mode}
                  activeId={activeId}
                  setActiveId={setActiveId}
                  startDrag={startDrag}
                  removeOverlay={removeOverlay}
                />
              </div>
            )}

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
