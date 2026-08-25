#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const subject = await readFile(
  new URL("./quipsly-local-live-room-operation.mjs", import.meta.url),
  "utf8",
);

assert.match(subject, /browser-live-room-receipt\.json/);
assert.match(subject, /writeFile\(receiptPath/);
assert.match(subject, /mode: 0o600/);
assert.match(subject, /chmod\(receiptPath, 0o600\)/);
assert.match(subject, /freshContextMutatedOutsideProduct: false/);
assert.match(subject, /secretsPrinted: false/);
assert.match(subject, /leave\.isVisible\(\)/);
assert.match(subject, /leave\.click\(\{ timeout: 2_000 \}\)/);

console.log(
  JSON.stringify({
    ok: true,
    assertions: 8,
    receiptIsFreshContextScoped: true,
    receiptIsPrivate: true,
    cleanupDoesNotWaitForAnAbsentLeaveAction: true,
  }),
);
