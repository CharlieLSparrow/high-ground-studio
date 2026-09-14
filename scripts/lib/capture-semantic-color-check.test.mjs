import test from "node:test";
import assert from "node:assert/strict";
import { rawCaptureSemanticColor } from "./capture-semantic-color-check.mjs";

test("finds explicit and inferred system colors", () => {
  for (const source of ["Color.green", "SwiftUI.Color.orange", "Color . green", ".tint(.green)", ".foregroundStyle(.orange)"]) {
    assert.notEqual(rawCaptureSemanticColor(source), null, source);
  }
});

test("saved RGB components are not system-color references", () => {
  for (const source of [
    "Color(.sRGB, red: $0.red, green: $0.green, blue: $0.blue, opacity: 1)",
    "pixel.green", "self.green", "CapturePalette.accent", "Color.greenish", "color.orangeChannel",
  ]) assert.equal(rawCaptureSemanticColor(source), null, source);
});
