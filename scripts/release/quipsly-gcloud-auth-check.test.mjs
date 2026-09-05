import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./quipsly-gcloud-auth-check.sh", import.meta.url),
  "utf8",
);

test("Firebase Admin authorization resolves from the deployed app workspace", () => {
  assert.match(source, /cd "\$\{REPO_ROOT\}\/apps\/quipsly"/);
  assert.doesNotMatch(source, /cd "\$\{REPO_ROOT\}"\s*\n\s*FIREBASE_PROJECT_ID/);
});

test("credential probes never print minted tokens", () => {
  assert.match(source, /auth print-access-token >\/dev\/null 2>&1/);
  assert.match(source, /auth application-default print-access-token >\/dev\/null 2>&1/);
});

test("non-interactive macOS agents can discover the official archive install", () => {
  assert.match(source, /command -v gcloud/);
  assert.match(source, /\$\{HOME\}\/google-cloud-sdk\/bin\/gcloud/);
  assert.match(source, /GCLOUD_BIN/);
});
