import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const stateHelperPath = fileURLToPath(
  new URL("./quipsly-local-state.sh", import.meta.url),
);
const upPath = fileURLToPath(new URL("./quipsly-local-up.sh", import.meta.url));
const downPath = fileURLToPath(
  new URL("./quipsly-local-down.sh", import.meta.url),
);
const doctorPath = fileURLToPath(
  new URL("./quipsly-local-doctor.sh", import.meta.url),
);
const generatedMobileDogfoodPath = fileURLToPath(
  new URL("./quipsly-generated-mobile-dogfood.sh", import.meta.url),
);

const stateHelper = readFileSync(stateHelperPath, "utf8");
const up = readFileSync(upPath, "utf8");
const down = readFileSync(downPath, "utf8");
const doctor = readFileSync(doctorPath, "utf8");
const generatedMobileDogfood = readFileSync(generatedMobileDogfoodPath, "utf8");
const captureAuthManager = readFileSync(
  fileURLToPath(
    new URL(
      "../../apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift",
      import.meta.url,
    ),
  ),
  "utf8",
);
const captureApp = readFileSync(
  fileURLToPath(
    new URL(
      "../../apps/mobile-capture/HighGroundCapture/HighGroundCapture/HighGroundCaptureApp.swift",
      import.meta.url,
    ),
  ),
  "utf8",
);
const captureRuntimeRunner = readFileSync(
  fileURLToPath(
    new URL(
      "../../apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
      import.meta.url,
    ),
  ),
  "utf8",
);
const quipslyPackageJson = readFileSync(
  fileURLToPath(new URL("../../apps/quipsly/package.json", import.meta.url)),
  "utf8",
);
const localMediaWorkerStores = [
  "local-audio-alignment-worker.ts",
  "local-audio-delivery-worker.ts",
  "local-audio-mastery-worker.ts",
  "local-audio-signal-profile-worker.ts",
  "local-audio-treatment-worker.ts",
  "local-dialogue-repair-worker.ts",
].map((filename) => ({
  filename,
  source: readFileSync(
    fileURLToPath(
      new URL(
        `../../apps/quipsly-media-processor/src/${filename}`,
        import.meta.url,
      ),
    ),
    "utf8",
  ),
}));

test("machine-wide services use machine-wide ownership state", () => {
  assert.match(stateHelper, /getconf DARWIN_USER_CACHE_DIR/);
  assert.match(stateHelper, /QUIPSLY_LOCAL_STATE_DIR/);
  assert.doesNotMatch(stateHelper, /repo_root.*\.tmp\/quipsly-local/);

  for (const script of [up, down, doctor]) {
    assert.match(script, /source "\$\{script_dir\}\/quipsly-local-state\.sh"/);
    assert.match(script, /state_dir="?\$\(quipsly_local_state_dir\)"?/);
  }
  assert.match(up, /QUIPSLY_LOCAL_COMPOSE_PROJECT:-high-ground-studio/);
  assert.match(
    up,
    /compose --project-name "\$\{compose_project\}" up -d postgres/,
  );
  assert.match(quipslyPackageJson, /"dev": "next dev --webpack"/);
  assert.match(
    quipslyPackageJson,
    /"build": "[^"]*next build --webpack"/,
    "Quipsly production builds must pin the same supported Next 16 bundler as local development and the release image.",
  );
  assert.match(up, /"--env-file=\$\{QUIPSLY_LOCAL_ENV_FILE\}"/);
  assert.doesNotMatch(up, /source "\$\{local_env_file\}"/);
  assert.match(up, /"Nest projects shell"/);
  assert.equal(
    up.match(/QUIPSLY_LOCAL_MEDIA_UPLOADS=true/g)?.length,
    2,
    "both local Nest launch paths must opt in to the development-only media vault",
  );
  assert.match(up, /--run-media-worker/);
  assert.match(up, /--run-transcript-worker/);
  assert.match(up, /local-episode-worker\.ts/);
  assert.match(up, /quipsly-local-transcript-worker\.mjs/);
  assert.match(up, /QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT/);
  assert.match(
    up,
    /local_capture_vault_root="\$\{QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-\$\{local_media_root\}\/capture-vault\}"/,
  );
  assert.match(
    up,
    /local_capture_upload_origin="\$\{QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN:-\$\{nest_url\}\}"/,
  );
  assert.equal(
    up.match(/QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=/g)?.length,
    5,
    "launcher handoff, Nest, and transcript worker paths must preserve the private Capture vault root",
  );
  assert.equal(
    up.match(/QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN=/g)?.length,
    3,
    "launcher handoff plus both local Nest launch paths must preserve the loopback upload origin",
  );
  assert.equal(
    up.match(/QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=/g)?.length,
    3,
    "launcher handoff plus both local Nest launch paths must expose the verified local-worker state",
  );
  assert.match(up, /--experimental-transform-types/);
});

test("optional Drive dogfood secrets are fetched inside durable children without entering launcher state", () => {
  assert.match(up, /load_google_drive_local_secrets\(\)/);
  assert.match(
    up,
    /QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT:-/,
  );
  assert.match(
    up,
    /secrets versions access latest[\s\S]*--secret="\$\{secret_name\}"[\s\S]*--project="\$\{project_id\}"/,
  );
  assert.match(
    up,
    /load_google_drive_local_secret GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY quipsly-google-drive-oauth-token-encryption-key/,
  );
  assert.match(
    up,
    /load_google_drive_local_secret GOOGLE_DRIVE_PICKER_API_KEY quipsly-google-drive-picker-api-key/,
  );
  assert.match(
    up,
    /if \[\[ "\$\{1:-\}" == "--run-nest" \]\]; then\n  load_google_drive_local_secrets/,
  );
  assert.match(
    up,
    /if \[\[ "\$\{1:-\}" == "--run-media-worker" \]\]; then\n  load_google_drive_local_secrets/,
  );
  const launchdSubmission = up.match(
    /launchctl submit[\s\S]*?scripts\/dev\/quipsly-local-up\.sh" "\$\{mode\}"/,
  )?.[0];
  assert.ok(launchdSubmission, "the durable launchd submission must exist");
  assert.doesNotMatch(
    launchdSubmission,
    /GOOGLE_DRIVE_OAUTH_(?:CLIENT|STATE|TOKEN)/,
    "launchd may receive the secret project, never resolved Drive secret values",
  );
});

test("Docker control-plane calls are bounded and fail closed", () => {
  assert.match(stateHelper, /quipsly_local_run_bounded/);
  assert.match(stateHelper, /quipsly_local_run_docker/);
  assert.match(stateHelper, /QUIPSLY_LOCAL_DOCKER_START_TIMEOUT_SECONDS/);
  assert.match(stateHelper, /return 124/);
  assert.match(up, /quipsly_local_docker_ready/);
  assert.match(up, /docker_start_timeout_seconds/);
  assert.match(doctor, /Docker engine unavailable/);
  assert.doesNotMatch(up, /(^|\n)docker info/);
  assert.doesNotMatch(doctor, /(^|\n)docker exec/);
});

test("bounded commands terminate an unresponsive child", () => {
  const startedAt = Date.now();
  const result = spawnSync(
    "bash",
    [
      "-c",
      'source "$1"; quipsly_local_run_bounded 1 sleep 20',
      "quipsly-local-timeout-test",
      stateHelperPath,
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  const elapsedMs = Date.now() - startedAt;

  assert.equal(result.status, 124, result.stderr);
  assert.ok(elapsedMs >= 900, `returned too early after ${elapsedMs}ms`);
  assert.ok(elapsedMs < 4_000, `returned too late after ${elapsedMs}ms`);
});

test("the state-directory override remains deterministic for isolated tests", () => {
  const expected = "/tmp/quipsly-lifecycle-contract";
  const result = spawnSync(
    "bash",
    [
      "-c",
      'source "$1"; QUIPSLY_LOCAL_STATE_DIR="$2"; quipsly_local_state_dir',
      "quipsly-local-state-test",
      stateHelperPath,
      expected,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), expected);
});

test("healthy ports cannot hide another worktree", () => {
  assert.match(up, /quipsly_local_process_cwd "\$\{nest_listener\}"/);
  assert.match(up, /nest_cwd}" != "\$\{expected_nest_cwd}/);
  assert.match(up, /--replace/);
  assert.match(up, /repo-root/);
  assert.match(up, /source-revision/);

  assert.match(doctor, /Runtime source worktree/);
  assert.match(doctor, /Lifecycle state owner/);
  assert.match(doctor, /quipsly_local_process_cwd "\$\{nest_listener\}"/);
});

test("healthy Nest reloads when its exact application or schema source changes", () => {
  assert.match(stateHelper, /quipsly_local_git_source_revision/);
  assert.match(stateHelper, /quipsly_local_runtime_revision/);
  assert.match(stateHelper, /quipsly_local_nest_source_revision/);
  assert.match(stateHelper, /apps\/quipsly/);
  assert.match(stateHelper, /prisma\/schema\.prisma/);
  assert.match(stateHelper, /packages\/quipsly-media-processing/);
  assert.match(stateHelper, /hash-object "\$\{local_env_file\}"/);
  assert.match(up, /recorded_nest_runtime_revision/);
  assert.match(
    up,
    /recorded_nest_runtime_revision}" == "\$\{local_nest_runtime_revision/,
  );
  assert.match(up, /RELOAD %-23s runtime/);
  assert.match(up, /wait_for_port_release 3012/);
  assert.match(up, /local_nest_source_revision.*source-revision/s);
  assert.match(up, /local_nest_runtime_revision.*nest\.runtime-revision/s);
  assert.match(doctor, /Runtime source revision/);
  assert.match(doctor, /quipsly_local_nest_source_revision/);
});

test("runtime fingerprints change with non-secret service configuration", () => {
  const fingerprint = (driveProject) =>
    spawnSync(
      "bash",
      [
        "-c",
        'source "$1"; quipsly_local_runtime_revision "$2" "source=abc" "drive-secret-project=$3"',
        "quipsly-runtime-revision-test",
        stateHelperPath,
        process.cwd(),
        driveProject,
      ],
      { encoding: "utf8" },
    );

  const disabled = fingerprint("");
  const enabled = fingerprint("high-ground-odyssey");
  const repeated = fingerprint("high-ground-odyssey");
  assert.equal(disabled.status, 0, disabled.stderr);
  assert.equal(enabled.status, 0, enabled.stderr);
  assert.equal(repeated.status, 0, repeated.stderr);
  assert.notEqual(disabled.stdout, enabled.stdout);
  assert.equal(enabled.stdout, repeated.stdout);
  assert.doesNotMatch(enabled.stdout, /high-ground-odyssey/);
});

test("source fingerprints ignore unrelated commits but detect executable input drift", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "quipsly-source-revision-"));
  const run = (command, args) =>
    spawnSync(command, args, {
      cwd: fixtureRoot,
      encoding: "utf8",
    });
  const fingerprint = () =>
    run("bash", [
      "-c",
      'source "$1"; quipsly_local_git_source_revision "$2" app',
      "quipsly-source-revision-test",
      stateHelperPath,
      fixtureRoot,
    ]);

  try {
    mkdirSync(join(fixtureRoot, "app"));
    mkdirSync(join(fixtureRoot, "docs"));
    writeFileSync(join(fixtureRoot, "app", "entry.ts"), "export const value = 1;\n");
    writeFileSync(join(fixtureRoot, "docs", "readme.md"), "first\n");

    assert.equal(run("git", ["init", "--quiet"]).status, 0);
    assert.equal(run("git", ["config", "user.name", "Quipsly Test"]).status, 0);
    assert.equal(
      run("git", ["config", "user.email", "test@quipsly.invalid"]).status,
      0,
    );
    assert.equal(run("git", ["add", "."]).status, 0);
    assert.equal(
      run("git", ["commit", "--quiet", "-m", "initial"]).status,
      0,
    );

    const initial = fingerprint();
    assert.equal(initial.status, 0, initial.stderr);

    writeFileSync(join(fixtureRoot, "docs", "readme.md"), "second\n");
    assert.equal(run("git", ["add", "docs/readme.md"]).status, 0);
    assert.equal(
      run("git", ["commit", "--quiet", "-m", "docs only"]).status,
      0,
    );
    const afterDocsCommit = fingerprint();
    assert.equal(afterDocsCommit.status, 0, afterDocsCommit.stderr);
    assert.equal(afterDocsCommit.stdout, initial.stdout);

    writeFileSync(join(fixtureRoot, "app", "entry.ts"), "export const value = 2;\n");
    const afterContentEdit = fingerprint();
    assert.equal(afterContentEdit.status, 0, afterContentEdit.stderr);
    assert.notEqual(afterContentEdit.stdout, initial.stdout);

    writeFileSync(join(fixtureRoot, "app", "entry.ts"), "export const value = 1;\n");
    chmodSync(join(fixtureRoot, "app", "entry.ts"), 0o755);
    const afterModeEdit = fingerprint();
    assert.equal(afterModeEdit.status, 0, afterModeEdit.stderr);
    assert.notEqual(afterModeEdit.stdout, initial.stdout);

    chmodSync(join(fixtureRoot, "app", "entry.ts"), 0o644);
    writeFileSync(join(fixtureRoot, "app", "draft.ts"), "export const draft = true;\n");
    const afterUntrackedInput = fingerprint();
    assert.equal(afterUntrackedInput.status, 0, afterUntrackedInput.stderr);
    assert.notEqual(afterUntrackedInput.stdout, initial.stdout);

    rmSync(join(fixtureRoot, "app", "draft.ts"));
    rmSync(join(fixtureRoot, "app", "entry.ts"));
    const afterTrackedDeletion = fingerprint();
    assert.equal(afterTrackedDeletion.status, 0, afterTrackedDeletion.stderr);
    assert.notEqual(afterTrackedDeletion.stdout, initial.stdout);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("local workers reload when executable source or runtime configuration changes", () => {
  assert.match(up, /local_worker_source_revision/);
  assert.match(
    up,
    /quipsly_local_git_source_revision "\$\{repo_root\}" "\$\{worker_source_paths\[@\]\}"/,
  );
  assert.match(up, /media-worker\.source-revision/);
  assert.match(up, /transcript-worker\.source-revision/);
  assert.match(up, /media-worker\.runtime-revision/);
  assert.match(up, /transcript-worker\.runtime-revision/);
  assert.match(
    up,
    /recorded_media_runtime_revision.*local_media_worker_runtime_revision/s,
  );
  assert.match(
    up,
    /recorded_transcript_runtime_revision.*local_transcript_worker_runtime_revision/s,
  );
  assert.match(up, /drive-secret-project=\$\{local_google_drive_secret_project\}/);
  assert.match(
    up,
    /QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT=\$\{local_spatial_vault_root\}/,
  );
  assert.doesNotMatch(up, /git rev-parse HEAD/);
  assert.match(
    up,
    /QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID=\$\{local_worker_source_revision\}/,
  );
  assert.match(down, /media-worker\.source-revision/);
  assert.match(down, /transcript-worker\.source-revision/);
  assert.match(down, /media-worker\.runtime-revision/);
  assert.match(down, /transcript-worker\.runtime-revision/);
});

test("macOS worker startup waits for launchd readiness instead of racing a fixed delay", () => {
  assert.match(up, /wait_for_macos_job_running\(\)/);
  assert.match(up, /wait_for_macos_job_absent\(\)/);
  assert.match(up, /for attempt in \$\(seq 1 40\)/);
  assert.match(up, /wait_for_macos_job_absent "\$\{label\}"/);
  assert.match(up, /refusing to race its replacement/);
  assert.match(
    up,
    /wait_for_macos_job_running "\$\{transcript_worker_label\}"/,
  );
  assert.match(up, /wait_for_macos_job_running "\$\{media_worker_label\}"/);
  assert.doesNotMatch(
    up,
    /start_macos_job "transcript-worker"[\s\S]{0,150}sleep 1/,
  );
  assert.doesNotMatch(up, /start_macos_job "media-worker"[\s\S]{0,150}sleep 1/);
});

test("the local lane generates the Prisma client before applying migrations", () => {
  const generateIndex = up.indexOf("pnpm db:generate");
  const migrateIndex = up.indexOf("pnpm exec prisma migrate deploy");

  assert.ok(
    generateIndex >= 0,
    "local startup must generate the Prisma client",
  );
  assert.ok(migrateIndex >= 0, "local startup must apply committed migrations");
  assert.ok(
    generateIndex < migrateIndex,
    "the current schema client must exist before migrations and Nest startup",
  );
  assert.ok(
    migrateIndex < up.indexOf('start_macos_job "nest"'),
    "migrations must finish before Nest starts",
  );
});

test("local media job release queries keep reused PostgreSQL parameters typed", () => {
  for (const { filename, source } of localMediaWorkerStores) {
    assert.match(
      source,
      /"status"\s*=\s*\$3::text/,
      `${filename} must type the status parameter reused by SET and CASE`,
    );
    assert.match(
      source,
      /"updatedAt"\s*=\s*\$4::timestamp\(3\)/,
      `${filename} must type the timestamp parameter reused by SET and CASE`,
    );
    assert.match(
      source,
      /CASE WHEN \$3::text\s*=\s*'failed' THEN \$4::timestamp\(3\) ELSE NULL::timestamp END/,
      `${filename} must not leave PostgreSQL to infer incompatible parameter types`,
    );
  }
});

test("replacement and shutdown remain confined to Quipsly app jobs", () => {
  for (const script of [up, down]) {
    assert.match(script, /com\.quipsly\.local\.nest/);
    assert.match(script, /com\.quipsly\.local\.firebase/);
    assert.match(script, /com\.quipsly\.local\.media-worker/);
    assert.match(script, /com\.quipsly\.local\.transcript-worker/);
  }
  assert.match(doctor, /Episode media worker/);
  assert.match(doctor, /Transcript worker/);
  assert.doesNotMatch(up, /docker compose down/);
  assert.doesNotMatch(down, /docker compose down/);
  assert.match(down, /PostgreSQL was intentionally left running/);
  assert.match(
    down,
    /docker compose --project-name high-ground-studio stop postgres/,
  );
});

test("generated mobile dogfood is disposable, secret-safe, and current-source", () => {
  assert.match(generatedMobileDogfood, /set -euo pipefail/);
  assert.match(generatedMobileDogfood, /umask 077/);
  assert.match(
    generatedMobileDogfood,
    /mktemp -d "\$\{TMPDIR:-\/private\/tmp\}\/quipsly-generated-mobile-dogfood\./,
  );
  assert.match(generatedMobileDogfood, /trap cleanup EXIT/);
  assert.match(generatedMobileDogfood, /kill "\$\{nest_pid\}"/);
  assert.match(generatedMobileDogfood, /kill "\$\{proxy_pid\}"/);
  assert.match(
    generatedMobileDogfood,
    /"\$\{TMPDIR:-\/private\/tmp\}"\/quipsly-generated-mobile-dogfood\.\*/,
  );
  assert.match(generatedMobileDogfood, /gcloud secrets versions access latest/);
  assert.match(
    generatedMobileDogfood,
    /node node_modules\/next\/dist\/bin\/next dev --webpack/,
  );
  assert.match(
    generatedMobileDogfood,
    /quipsly-mobile-capture-generated-auth-smoke\.mjs/,
  );
  assert.match(
    generatedMobileDogfood,
    /QUIPSLY_GENERATED_MOBILE_DATABASE_TARGET:-local/,
  );
  assert.match(
    generatedMobileDogfood,
    /QUIPSLY_GENERATED_MOBILE_DATABASE_TARGET=canonical/,
  );
  assert.match(
    generatedMobileDogfood,
    /generated mobile local database target must use a loopback host/i,
  );
  assert.match(
    generatedMobileDogfood,
    /Canonical dogfood cannot also receive a local database override/,
  );
  assert.match(
    generatedMobileDogfood,
    /nest_dist_name="\.next-mobile-dogfood"/,
  );
  assert.match(
    generatedMobileDogfood,
    /QUIPSLY_BUILD_DIST_DIR="\$\{nest_dist_name\}"/,
  );
  assert.match(generatedMobileDogfood, /apps\/quipsly\/\.next-mobile-dogfood/);
  assert.match(
    generatedMobileDogfood,
    /shlock -p "\$\$" -f "\$\{dogfood_lock_file\}"/,
  );
  assert.match(generatedMobileDogfood, /unlink "\$\{dogfood_lock_file\}"/);
  assert.match(generatedMobileDogfood, /--workflow="\$\{mode\}"/);
  assert.match(generatedMobileDogfood, /--runtime-ui-mode="\$\{mode\}"/);
  assert.match(
    generatedMobileDogfood,
    /Secrets are held only in process environment or a mode-0700/,
  );
  assert.doesNotMatch(generatedMobileDogfood, /set -x/);
  assert.doesNotMatch(generatedMobileDogfood, /echo .*database_url/);
  assert.doesNotMatch(generatedMobileDogfood, /echo .*firebase_api_key/);
});

test("generated Capture dogfood resets each operated run without losing same-run relaunch state", () => {
  assert.match(
    captureApp,
    /AuthManager\.configureRuntimeSmokeAccountResetIfRequested\(\)/,
  );
  assert.match(
    captureAuthManager,
    /#if DEBUG && targetEnvironment\(simulator\)/,
  );
  assert.match(
    captureAuthManager,
    /arguments\.contains\("--quipsly-capture-runtime-smoke"\)/,
  );
  assert.match(
    captureAuthManager,
    /credentialsPath == "\/tmp\/quipsly-capture-runtime-ui-smoke-credentials\.json"/,
  );
  assert.match(
    captureAuthManager,
    /let runBinding = "\\\(actor\)\|\\\(runID\)"/,
  );
  assert.match(
    captureAuthManager,
    /getKeychainItem\(account: markerAccount\) != runBinding/,
  );
  assert.match(
    captureAuthManager,
    /saveKeychainItemForUITest\(account: markerAccount, value: runBinding\)/,
  );
  assert.match(
    captureRuntimeRunner,
    /"runtimeSmokeRunID": uuid\.uuid4\(\)\.hex/,
  );
});
