import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "verify-cloud-bucket.sh");

let fixtureRoot;
let fakeBin;
let commandLog;
let corsLog;
let createdMarker;

before(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quipsly-bucket-test-"));
  fakeBin = path.join(fixtureRoot, "bin");
  commandLog = path.join(fixtureRoot, "gcloud.log");
  corsLog = path.join(fixtureRoot, "cors.json");
  createdMarker = path.join(fixtureRoot, "created");
  fs.mkdirSync(fakeBin);
  const fakeGcloud = path.join(fakeBin, "gcloud");
  fs.writeFileSync(fakeGcloud, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$FAKE_GCLOUD_LOG"
if [[ "\${1:-} \${2:-}" == "auth print-access-token" ]]; then
  printf 'test-token\\n'
  exit 0
fi
if [[ "\${1:-} \${2:-} \${3:-}" == "storage buckets describe" ]]; then
  if [[ "\${FAKE_BUCKET_EXISTS:-1}" == "1" || -f "$FAKE_CREATED_MARKER" ]]; then
    printf '{"name":"high-ground-odyssey-media"}\\n'
    exit 0
  fi
  printf 'not found\\n' >&2
  exit 1
fi
if [[ "\${1:-} \${2:-} \${3:-}" == "storage buckets update" ]]; then
  for argument in "$@"; do
    case "$argument" in
      --cors-file=*)
        cp "\${argument#--cors-file=}" "$FAKE_CORS_LOG"
        ;;
    esac
  done
  exit 0
fi
if [[ "\${1:-} \${2:-} \${3:-}" == "storage buckets create" ]]; then
  touch "$FAKE_CREATED_MARKER"
  exit 0
fi
printf 'Unexpected fake gcloud command: %s\\n' "$*" >&2
exit 2
`);
  fs.chmodSync(fakeGcloud, 0o755);
});

after(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

function run(args = [], overrides = {}) {
  fs.writeFileSync(commandLog, "");
  if (fs.existsSync(corsLog)) fs.unlinkSync(corsLog);
  if (fs.existsSync(createdMarker)) fs.unlinkSync(createdMarker);
  return spawnSync("bash", [script, ...args], {
    cwd: fixtureRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      PROJECT_ID: "high-ground-odyssey",
      QUIPSLY_MEDIA_BUCKET: "high-ground-odyssey-media",
      LIVEKIT_EGRESS_GCS_BUCKET: "high-ground-odyssey-media",
      FAKE_BUCKET_EXISTS: "1",
      FAKE_GCLOUD_LOG: commandLog,
      FAKE_CORS_LOG: corsLog,
      FAKE_CREATED_MARKER: createdMarker,
      ...overrides,
    },
  });
}

function commands() {
  return fs.readFileSync(commandLog, "utf8");
}

test("default mode reads bucket truth without creating or updating", () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Mutation mode: create=0 apply-cors=0/);
  assert.match(commands(), /auth print-access-token/);
  assert.match(commands(), /storage buckets describe/);
  assert.doesNotMatch(commands(), /storage buckets create/);
  assert.doesNotMatch(commands(), /storage buckets update/);
});

test("missing bucket fails closed in default mode", () => {
  const result = run([], { FAKE_BUCKET_EXISTS: "0" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to mutate bucket in dry-run mode/);
  assert.doesNotMatch(commands(), /storage buckets create/);
  assert.doesNotMatch(commands(), /storage buckets update/);
});

test("bucket creation requires the explicit create flag", () => {
  const result = run(["--create"], { FAKE_BUCKET_EXISTS: "0" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(commands(), /storage buckets create/);
  assert.equal(
    (commands().match(/storage buckets describe/g) ?? []).length,
    2,
    "bucket creation must be followed by a readback",
  );
  assert.doesNotMatch(commands(), /storage buckets update/);
});

test("wildcard CORS is rejected before any bucket update", () => {
  const result = run(["--apply-cors"], { QUIPSLY_CORS_ORIGINS: "*" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Wildcard CORS origins are not allowed/);
  assert.doesNotMatch(commands(), /storage buckets update/);
});

test("explicit CORS keeps resumable upload receipts and excludes delete", () => {
  const origins = "https://nest.quipsly.com,http://127.0.0.1:3012";
  const result = run(["--apply-cors"], { QUIPSLY_CORS_ORIGINS: origins });
  assert.equal(result.status, 0, result.stderr);
  assert.match(commands(), /storage buckets update/);
  assert.equal(
    (commands().match(/storage buckets describe/g) ?? []).length,
    2,
    "CORS mutation must be followed by bucket readback",
  );

  const cors = JSON.parse(fs.readFileSync(corsLog, "utf8"));
  assert.deepEqual(cors[0].origin, origins.split(","));
  assert(cors[0].responseHeader.includes("x-goog-if-generation-match"));
  assert(cors[0].responseHeader.includes("Content-Range"));
  assert(cors[0].responseHeader.includes("Range"));
  assert(!cors[0].method.includes("DELETE"));
});
