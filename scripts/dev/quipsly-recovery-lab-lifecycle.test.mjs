import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

function read(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const up = read("./quipsly-recovery-lab-up.sh");
const doctor = read("./quipsly-recovery-lab-doctor.sh");
const down = read("./quipsly-recovery-lab-down.sh");
const state = read("./quipsly-recovery-lab-state.sh");
const firebaseConfig = read("../../ops/firebase-auth-emulator.recovery-lab.json");

test("the recovery lab is isolated from the canonical local lane", () => {
  for (const source of [up, doctor]) {
    assert.match(source, /3022/);
    assert.match(source, /9199/);
    assert.match(source, /55432/);
    assert.doesNotMatch(source, /localhost:5432\/high_ground_studio/);
  }
  assert.match(state, /55432/);
  assert.doesNotMatch(state, /localhost:5432\/high_ground_studio/);
  assert.match(up, /QUIPSLY_BUILD_DIST_DIR=\.next-recovery-lab/);
  assert.match(firebaseConfig, /"port": 9199/);
  assert.match(firebaseConfig, /"host": "127\.0\.0\.1"/);
});

test("fresh environments are migration-built and loopback-only", () => {
  assert.match(up, /pnpm exec prisma migrate deploy/);
  assert.match(up, /pnpm exec prisma migrate status/);
  assert.doesNotMatch(up, /prisma db push/);
  assert.match(up, /-p 127\.0\.0\.1:55432:5432/);
  assert.match(up, /pgvector\/pgvector:pg15/);
  assert.match(up, /--rm/);
});

test("shutdown is confined to exact owned jobs and the disposable database", () => {
  for (const source of [up, down]) {
    assert.match(source, /com\.quipsly\.recovery-lab\.nest/);
    assert.match(source, /com\.quipsly\.recovery-lab\.firebase/);
    assert.match(source, /com\.quipsly\.recovery-lab/);
  }
  assert.match(down, /actual_database_label/);
  assert.match(down, /docker stop "\$\{database_container\}"/);
  assert.doesNotMatch(down, /docker compose down/);
  assert.doesNotMatch(down, /high-ground-db/);
});

test("acceptance defaults to a clean exact committed revision", () => {
  assert.match(up, /QUIPSLY_RECOVERY_LAB_ALLOW_DIRTY/);
  assert.match(up, /git rev-parse HEAD >"\$\{state_dir\}\/source-revision"/);
  assert.match(doctor, /Exact source revision/);
  assert.match(doctor, /clean committed source/);
});
