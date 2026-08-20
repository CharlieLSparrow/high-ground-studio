import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productSurfaces = [
  "apps/quipsly/src/app/(app)/coaching/page.tsx",
  "apps/quipsly/src/app/(app)/sessions/[roomId]/page.tsx",
  "apps/quipsly/src/app/api/coaching/runway/route.ts",
  "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts",
  "apps/quipsly/src/components/capture-app-handoff.tsx",
];

const reservedFixturePatterns = [
  /@dev\.test/i,
  /retained-coaching/i,
  /qa-retained/i,
  /codex-coaching/i,
  /episode\s*9/i,
  /shomers@/i,
  /charlielsparrow@/i,
];

test("ordinary coaching surfaces stay independent of retained people and fixtures", async () => {
  for (const file of productSurfaces) {
    const source = await readFile(file, "utf8");
    for (const pattern of reservedFixturePatterns) {
      assert.doesNotMatch(
        source,
        pattern,
        `${file} must discover the signed-in user's data instead of depending on ${pattern}.`,
      );
    }
  }
});
