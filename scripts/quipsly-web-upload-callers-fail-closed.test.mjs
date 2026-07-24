#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const callers = {
  assets: read("apps/quipsly/src/app/(app)/assets/page.tsx"),
  call: read("apps/quipsly/src/app/(app)/call/page.tsx"),
  recorder: read("apps/quipsly/src/app/(app)/recorder/page.tsx"),
};

test("legacy server-buffered mobile ingress has no Quipsly web callers", () => {
  for (const [surface, source] of Object.entries(callers)) {
    assert.equal(source.includes("/api/ingest/mobile"), false, `${surface} must not send bytes through legacy ingress`);
    assert.equal(source.includes("/api/upload/presigned"), false, `${surface} must not claim success after an unregistered raw PUT`);
    assert.equal(source.includes("useCloudStorageUpload"), false, `${surface} must not bypass capture finalization or media registration`);
    assert.ok(source.includes("resumable-v2"), `${surface} must explain the migration boundary`);
  }
});

test("live call fails closed without silently recording", () => {
  assert.equal(callers.call.includes("new MediaRecorder"), false);
  assert.ok(callers.call.includes("creates no recording file or recording upload"));
  assert.ok(callers.call.includes("No recording is created."));
});

test("recorder keeps sources local and the Vault cannot select or send a file", () => {
  assert.ok(callers.recorder.includes('uploadState: "local-only"'));
  assert.ok(callers.recorder.includes("download or export local sources before leaving"));
  assert.equal(callers.assets.includes('type="file"'), false);
  assert.ok(callers.assets.includes("No file is selected or sent"));
});
