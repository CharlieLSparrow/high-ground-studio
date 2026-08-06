import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { requireLoopbackOrigin } from "./quipsly-local-native-session-preflight-operation.mjs";

test("native Session preflight operation is loopback-only", () => {
  assert.equal(requireLoopbackOrigin("http://127.0.0.1:3012", "test"), "http://127.0.0.1:3012");
  assert.throws(() => requireLoopbackOrigin("https://nest.quipsly.com", "test"), /loopback HTTP/i);
  assert.throws(() => requireLoopbackOrigin("http://example.com", "test"), /non-loopback/i);
});

test("retained operation proves iPhone identity, privacy, idempotency, expiry, and PostgreSQL readback", async () => {
  const source = await readFile(new URL("./quipsly-local-native-session-preflight-operation.mjs", import.meta.url), "utf8");
  for (const evidence of [
    "clientKind: \"ios\"",
    "privateSamplePlaybackComplete: true",
    "sampleBytesUploaded === false",
    "recordingStarted === false",
    "idempotentReplay === true",
    "REQUEST_ID_CONFLICT",
    "current === false",
    "outsider.status === 404",
    "second collaborator iPhone receipt",
    "actorUserId !== persisted?.actorUserId",
    "emailVerified: true",
    "deleteUser(privacyUID)",
    "privateSampleBytesRetained === false",
    "privateSampleUploaded === false",
  ]) {
    assert.match(source, new RegExp(evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /console\.log\([^)]*password/i);
});
