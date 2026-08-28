// Free-floating text boxes the user can place anywhere on a page.
// Works for PDFs (including scanned ones with no text layer) and images.

export type Overlay = {
  id: string;
  pageIndex: number;
  text: string;
  /** position/size as a fraction (0-1) of the page */
  x: number;
  y: number;
  width: number;
  /** font size as a fraction of page height */
  size: number;
  color: string;
  bold: boolean;
  align: "left" | "center" | "right";
};

let counter = 0;

export function createOverlay(pageIndex: number, text = "New text"): Overlay {
  counter += 1;
  return {
    id: `ov-${Date.now()}-${counter}`,
    pageIndex,
    text,
    x: 0.25,
    y: 0.45,
    width: 0.5,
    size: 0.05,
    color: "#111111",
    bold: false,
    align: "center",
  };
}

export function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = parseInt(m[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
