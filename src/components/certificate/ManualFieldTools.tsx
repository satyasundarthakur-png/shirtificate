import { useState } from "react";
import { Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pdfFieldRect, positionPdfField, type FieldRect } from "@/lib/certificate/fieldGeometry";
import type { ParsedPdf, PdfField } from "@/lib/certificate/pdf";

export function ManualFieldTools({ pdfDoc, fields, drawing, canDraw, busy, onDraw, onRedetect, onChange, onRemove, canRedetect }: {
  pdfDoc: ParsedPdf | null; fields: PdfField[]; drawing: boolean; canDraw: boolean; busy: boolean;
  canRedetect: boolean; onDraw: (drawing: boolean) => void; onRedetect: () => void;
  onChange: (field: PdfField) => void; onRemove: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const field = fields.find((f) => f.id === selected);
  const page = pdfDoc?.pages.find((p) => p.index === field?.pageIndex);
  const rect = field && page ? pdfFieldRect(field, page) : null;
  function changeRect(key: keyof FieldRect, value: number) {
    if (!field || !page || !rect || !Number.isFinite(value)) return;
    onChange(positionPdfField(field, page, { ...rect, [key]: value / 100 }));
  }
  return <div className="mt-5 border-y py-4">
    <h3 className="mb-3 font-display text-sm font-bold">Manual field mapping</h3>
    <div className="flex flex-wrap gap-2">
      {canDraw && <Button size="sm" variant={drawing ? "default" : "outline"} disabled={busy} onClick={() => onDraw(!drawing)}>{drawing ? <X /> : <Plus />}{drawing ? "Cancel placement" : "Draw missing field"}</Button>}
      {canRedetect && <Button size="sm" variant="outline" disabled={busy} onClick={onRedetect}><RefreshCw />Re-detect fields</Button>}
    </div>
    {fields.length > 0 && <div className="mt-3 space-y-3">
      <Select value={field?.id ?? "__none"} onValueChange={setSelected}><SelectTrigger aria-label="Field to correct"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">Select field to correct</SelectItem>{fields.map((f, index) => <SelectItem key={f.id} value={f.id}>{index + 1}. {f.text || f.original || "Empty field"}</SelectItem>)}</SelectContent></Select>
      {field && rect && <>
        <div className="grid grid-cols-2 gap-2">{(["x", "y", "width", "height"] as const).map((key) => <label key={key} className="text-xs capitalize">{key} (%)<Input aria-label={`Field ${key} percent`} type="number" min={key === "x" || key === "y" ? 0 : 1} max={100} step={0.1} value={Number((rect[key] * 100).toFixed(1))} onChange={(e) => changeRect(key, Number(e.target.value))} /></label>)}</div>
        <label className="block text-xs">Font size (pt)<Input aria-label="Corrected field font size" type="number" min={4} max={200} value={Number(field.fontSize.toFixed(1))} onChange={(e) => { const value = Number(e.target.value); if (value >= 4 && value <= 200) onChange({ ...field, fontSize: value }); }} /></label>
        <label className="flex items-center justify-between text-xs">Cover color<input aria-label="Field cover color" type="color" value={`#${[field.bg.r, field.bg.g, field.bg.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`} onChange={(e) => { const n = parseInt(e.target.value.slice(1), 16); onChange({ ...field, bg: { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255 } }); }} /></label>
        <Button size="sm" variant="ghost" onClick={() => { onRemove(field.id); setSelected(""); }}><Trash2 />Exclude field</Button>
      </>}
    </div>}
  </div>;
}

export function DrawFieldLayer({ onComplete }: { onComplete: (rect: FieldRect) => void }) {
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<FieldRect | null>(null);
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function box(a: { x: number; y: number }, b: { x: number; y: number }): FieldRect {
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  }
  return <div role="region" aria-label="Draw missing certificate field" className="absolute inset-0 z-30 cursor-crosshair touch-none" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = point(e); setStart(p); setRect(null); }} onPointerMove={(e) => { if (start) setRect(box(start, point(e))); }} onPointerCancel={() => { setStart(null); setRect(null); }} onPointerUp={(e) => {
    if (!start) return;
    const next = box(start, point(e)); setStart(null); setRect(null);
    if (next.width >= 0.01 && next.height >= 0.01) onComplete(next);
  }}>
    {rect && <div className="pointer-events-none absolute border-2 border-primary bg-primary/15" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />}
  </div>;
}
