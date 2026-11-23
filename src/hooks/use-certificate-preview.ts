import { useEffect, useState } from "react";
import type { BatchTemplate } from "@/lib/certificate/batch";

/** Render the actual exported file, so preview and download use identical drawing rules. */
export function useCertificatePreview(template: BatchTemplate) {
  const [images, setImages] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pdfDoc, imgDoc, pdfFields, overlays } = template;
  useEffect(() => { setImages([]); }, [pdfDoc, imgDoc]);
  useEffect(() => {
    let cancelled = false;
    if (!pdfDoc && !imgDoc) { setImages([]); return; }
    setPending(true);
    setError(null);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          let next: string[];
          if (pdfDoc) {
            const { exportPdf, parsePdf } = await import("@/lib/certificate/pdf");
            const blob = await exportPdf(pdfDoc, pdfFields, overlays);
            const rendered = await parsePdf(new File([blob], "preview.pdf"));
            next = rendered.pages.map((page) => page.image);
          } else if (imgDoc) {
            const { exportImage } = await import("@/lib/certificate/image");
            const blob = await exportImage(imgDoc, overlays);
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(new Error("Could not render preview."));
              reader.readAsDataURL(blob);
            });
            next = [dataUrl];
          } else return;
          if (!cancelled) setImages(next);
        } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Could not render preview."); }
        finally { if (!cancelled) setPending(false); }
      })();
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pdfDoc, imgDoc, pdfFields, overlays]);
  return { images, pending, error };
}
