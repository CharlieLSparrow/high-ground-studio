import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const fixturePath = new URL(
  "./release/quipsly-media-processor-cloud-fixture.mjs",
  import.meta.url,
);
const source = readFileSync(fixturePath, "utf8");

test("cloud fixture is syntactically valid and fails before cloud access without explicit targets", () => {
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
      },
      encoding: "utf8",
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PROJECT_ID is missing or unsafe/);
  assert.doesNotMatch(result.stderr, /gcloud|Cloud Run|GoogleAuth/);
});

test("cloud fixture proves create-once worker behavior and makes cleanup explicit", () => {
  for (const required of [
    'preconditionOpts: { ifGenerationMatch: 0 }',
    '"execute"',
    '"--wait"',
    "parseCaptureProxyResult",
    "sha256(remoteSourceBytes) === sourceSha256",
    "secondOutput.generation === firstOutputGeneration",
    "secondResult.generation === firstResultGeneration",
    "secondManifest.generation === firstCompletedManifestGeneration",
    "if (cleanupRequested)",
    "ifGenerationMatch: evidence.generation",
    "assertFastStart(outputBytes)",
    "assertTechnicalEvidence(technical, result.output.metadata)",
  ]) {
    assert.ok(source.includes(required), `Missing fixture boundary: ${required}`);
  }
  assert.match(source, /process\.env\.CLEANUP === "1"/);
  assert.doesNotMatch(source, /rm\([^)]*media-vault/);
});
