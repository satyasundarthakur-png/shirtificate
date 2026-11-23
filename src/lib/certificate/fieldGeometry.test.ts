import { test } from "node:test";
import assert from "node:assert/strict";
import { clampRect, newPdfField, pdfFieldRect, positionPdfField } from "./fieldGeometry";
const page = { index: 0, image: "", width: 600, height: 800, displayWidth: 1000, displayHeight: 4000 / 3 };
test("manual fields convert screen positions to export positions and back", () => {
  const field = newPdfField(page, { x: 0.2, y: 0.3, width: 0.5, height: 0.05 }, "manual");
  assert.equal(field.x, 120);
  assert.equal(field.y, 527.2);
  assert.equal(field.width, 300);
  assert.equal(field.height, 40);
  const rect = pdfFieldRect(field, page);
  assert.equal(rect.x, 0.2);
  assert.equal(rect.y, 0.3);
  assert.equal(rect.width, 0.5);
  assert.ok(Math.abs(rect.height - 0.05) < 1e-12);
  const moved = positionPdfField(field, page, { x: 0.1, y: 0.2, width: 0.6, height: 0.1 });
  assert.equal(moved.x, 60);
  assert.equal(moved.width, 360);
  assert.equal(moved.fontSize, field.fontSize);
});
test("field correction stays within the certificate page", () => {
  assert.deepEqual(clampRect({ x: 0.9, y: 0.9, width: 0.5, height: 0.5 }), { x: 0.9, y: 0.9, width: 1 - 0.9, height: 1 - 0.9 });
});
