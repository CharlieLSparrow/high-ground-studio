import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixturePath = new URL(
  "./release/quipsly-transcript-worker-cloud-fixture.mjs",
  import.meta.url,
);
const source = readFileSync(fixturePath, "utf8");

test("transcript cloud fixture is valid and fails before cloud access without explicit targets", () => {
  execFileSync(process.execPath, ["--check", fixturePath.pathname], {
    stdio: "pipe",
  });
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      new URL("./register-ts-extension-loader.mjs", import.meta.url).pathname,
      fixturePath.pathname,
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        PROJECT_ID: "",
        QUIPSLY_MEDIA_BUCKET: "",
        EXPECTED_BUILD_ID: "",
        FIXTURE_AUDIO_PATH: "",
        FIXTURE_CONSENT_ACKNOWLEDGED: "",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROJECT_ID is missing or unsafe/);
  assert.doesNotMatch(result.stderr, /gcloud|Cloud Run|GoogleAuth/);
});

test("transcript cloud fixture requires explicit consent before reading speech", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--import",
      new URL("./register-ts-extension-loader.mjs", import.meta.url).pathname,
      fixturePath.pathname,
    ],
    {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        PROJECT_ID: "fixture-project",
        QUIPSLY_MEDIA_BUCKET: "fixture-bucket",
        EXPECTED_BUILD_ID: "a".repeat(40),
        FIXTURE_AUDIO_PATH: "/definitely/not/read.wav",
        FIXTURE_CONSENT_ACKNOWLEDGED: "",
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FIXTURE_CONSENT_ACKNOWLEDGED=1 is required/);
  assert.doesNotMatch(result.stderr, /ENOENT|gcloud|GoogleAuth/);
});

test("transcript fixture proves private create-once provider and retry boundaries", () => {
  for (const required of [
    'preconditionOpts: { ifGenerationMatch: 0 }',
    '"execute"',
    '"--wait"',
    "parseCaptureTranscriptResult",
    "result.worker.buildId === expectedBuildId",
    "result.worker.imageDigest === jobContract.imageDigest",
    "result.rawProviderResponse.sha256 === rawStored.sha256",
    "replayRaw.generation === firstGenerations.raw",
    "replayResult.generation === firstGenerations.result",
    "replayManifest.generation === firstGenerations.manifest",
    "FIXTURE_CONSENT_ACKNOWLEDGED",
    "textDisclosed: false",
    "completeFixtureManifest",
    'manifest.status === "processing"',
    "retireCompletedReplay",
    "cleanupRequested && cleanupSafe",
    "a worker may still own its lease",
    "ifGenerationMatch: evidence.generation",
  ]) {
    assert.ok(source.includes(required), `Missing fixture boundary: ${required}`);
  }
  assert.match(source, /process\.env\.CLEANUP === "1"/);
  assert.match(source, /-map_metadata/);
  assert.doesNotMatch(source, /result\.segments\.map\([^)]*text/);
  assert.doesNotMatch(source, /rm\([^)]*media-vault/);
});
