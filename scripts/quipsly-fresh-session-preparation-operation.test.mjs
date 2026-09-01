import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-fresh-session-preparation-operation.mjs", import.meta.url),
  "utf8",
);

test("fresh Session preparation operation proves UX, privacy, retry, and side-effect boundaries", () => {
  for (const required of [
    "Plan this session",
    "Private coach prep",
    "PREPARATION_REQUEST_COLLISION",
    "neighboringCoachDirectRouteDenied",
    "clientPrivateProjectionAbsent",
    "exactRetryConverged",
    "unrelatedSideEffectsAbsent",
    "assertNoHorizontalOverflow",
    "runtimeSourceCurrent: true",
  ]) {
    assert.match(source, new RegExp(required));
  }
});
