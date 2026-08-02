import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireLocalDatabaseUrl } from "./quipsly-retained-offline-focus-operation.mjs";

test("retained offline focus operation accepts only explicit loopback PostgreSQL", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.match(
      requireLocalDatabaseUrl(`postgresql://postgres:secret@${host}:5432/high_ground_studio`),
      /high_ground_studio/,
    );
  }
  for (const value of [
    "",
    "https://127.0.0.1/high_ground_studio",
    "postgresql://cloud.example.com/high_ground_studio",
    "postgresql://127.0.0.1",
  ]) {
    assert.throws(() => requireLocalDatabaseUrl(value));
  }
});

test("retained offline focus operation proves one exact receipt and no target or provider mutation", async () => {
  const source = await readFile(
    new URL("./quipsly-retained-offline-focus-operation.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /deleteMany|\.delete\(|removeArtifact|cleanupArtifact/);
  assert.match(source, /CLIENT_REQUEST_ID/);
  assert.match(source, /matchingReceipts\.length === 1/);
  assert.match(source, /lastMobileFocusOperation/);
  assert.match(source, /task\?\.status === "OPEN" && goal\?\.status === "ACTIVE"/);
  assert.match(source, /completingFocusBlockMutatesTarget === false/);
  assert.match(source, /externalCalendarMutated === false/);
  assert.match(source, /renderedScheduleReadback: true/);
  assert.match(source, /mobileProjectionReadback: true/);
  assert.match(source, /artifactPreserved: true/);
  assert.match(source, /externalSideEffects: false/);
});
