import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./quipsly-retained-audible-event-review-operation.mjs", import.meta.url), "utf8");

test("retained audible-event operation is guarded and source-bound", () => {
  assert.match(source, /QUIPSLY_RETAINED_AUDIBLE_EVENT_REVIEW_OPERATION === "1"/);
  assert.match(source, /new PrismaPg\(\{ connectionString: databaseUrl/);
  assert.match(source, /updateMany\(\{/);
  assert.match(source, /updatedAt: production\.updatedAt/);
  assert.match(source, /sourceSHA256 !== sha256/);
  assert.match(source, /sourceByteCount !== byteCount/);
  assert.match(source, /noReviewWasFabricated: true/);
  assert.match(source, /noRepairOrEditAuthorized: true/);
  assert.doesNotMatch(source, /studioAudibleEventReviewReceipt\.create/);
});
