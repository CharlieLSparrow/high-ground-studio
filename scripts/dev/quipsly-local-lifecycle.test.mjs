import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
const generatedMobileDogfood = readFileSync(
  generatedMobileDogfoodPath,
  "utf8",
);
const quipslyPackageJson = readFileSync(
  fileURLToPath(new URL("../../apps/quipsly/package.json", import.meta.url)),
  "utf8",
);

test("machine-wide services use machine-wide ownership state", () => {
  assert.match(stateHelper, /getconf DARWIN_USER_CACHE_DIR/);
  assert.match(stateHelper, /QUIPSLY_LOCAL_STATE_DIR/);
  assert.doesNotMatch(stateHelper, /repo_root.*\.tmp\/quipsly-local/);

  for (const script of [up, down, doctor]) {
    assert.match(script, /source "\$\{script_dir\}\/quipsly-local-state\.sh"/);
    assert.match(script, /state_dir="?\$\(quipsly_local_state_dir\)"?/);
  }
  assert.match(
    up,
    /QUIPSLY_LOCAL_COMPOSE_PROJECT:-high-ground-studio/,
  );
  assert.match(
    up,
    /compose --project-name "\$\{compose_project\}" up -d postgres/,
  );
  assert.match(
    quipslyPackageJson,
    /"dev": "next dev --webpack"/,
  );
  assert.match(
    quipslyPackageJson,
    /"build": "next build --webpack"/,
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

test("the local lane generates the Prisma client before applying migrations", () => {
  const generateIndex = up.indexOf('pnpm db:generate');
  const migrateIndex = up.indexOf('pnpm exec prisma migrate deploy');

  assert.ok(generateIndex >= 0, "local startup must generate the Prisma client");
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

test("replacement and shutdown remain confined to Quipsly app jobs", () => {
  for (const script of [up, down]) {
    assert.match(script, /com\.quipsly\.local\.nest/);
    assert.match(script, /com\.quipsly\.local\.firebase/);
  }
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
  assert.match(
    generatedMobileDogfood,
    /apps\/quipsly\/\.next-mobile-dogfood/,
  );
  assert.match(
    generatedMobileDogfood,
    /shlock -p "\$\$" -f "\$\{dogfood_lock_file\}"/,
  );
  assert.match(
    generatedMobileDogfood,
    /unlink "\$\{dogfood_lock_file\}"/,
  );
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
