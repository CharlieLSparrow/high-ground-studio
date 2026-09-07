import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./quipsly-verify-release-build.sh", import.meta.url));

// Execute the release command itself. Only the expensive toolchain boundary is
// replaced, so shell ordering, pipe failure propagation, cwd, and logs are real.
function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "quipsly-release-build-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const context = path.join(root, "committed context");
  const bin = path.join(root, "bin");
  mkdirSync(path.join(context, "scripts"), { recursive: true });
  mkdirSync(bin);
  writeFileSync(path.join(context, ".quipsly-release-context"), "");
  writeFileSync(path.join(context, "scripts/sync-prisma-pnpm-clients.mjs"), "");
  const digest = (value) => createHash("sha1").update(value).digest("hex");
  writeFileSync(path.join(context, "quipsly-release-source.json"), JSON.stringify({
    schemaVersion: 1, releaseId: "nest", releaseManifest: "release/manifests/nest.json",
    sourceSha: "a".repeat(40),
    inventorySha1: digest(`${digest("")}  ./scripts/sync-prisma-pnpm-clients.mjs\n`),
  }));
  const tool = path.join(bin, "corepack");
  writeFileSync(tool, `#!/bin/bash
set -euo pipefail
printf '%s|%s|%s|%s\\n' "$PWD" "$*" "\${QUIPSLY_LOCAL_DB_SMOKE:-unset}" "\${CI:-unset}" >> "$COMMAND_LOG"
stage=other
case "$*" in
  *'install --frozen-lockfile'*) stage=install ;;
  *'db:generate'*) stage=generate ;;
  *'test --maxWorkers=2'*) stage=test ;;
  *'next build --webpack'*) stage=build ;;
esac
if [[ "$stage" == test ]]; then
  echo 'Application test output'
  for arg in "$@"; do
    case "$arg" in
      --outputFile=*)
        if [[ "\${FAIL_STAGE:-}" != test ]]; then
          printf '{"success":true}\\n' > "\${arg#--outputFile=}"
        fi ;;
    esac
  done
fi
if [[ "$stage" == "\${FAIL_STAGE:-}" ]]; then
  echo "Injected $stage failure" >&2
  exit 17
fi
`);
  chmodSync(tool, 0o755);
  const log = path.join(root, "commands.log");
  const run = (failure = "", target = context) => spawnSync("bash", [script, target], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: root,
      COMMAND_LOG: log, FAIL_STAGE: failure, QUIPSLY_LOCAL_DB_SMOKE: "1" },
  });
  const commands = () => existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
  return { root, context, run, commands };
}

test("the committed release runs the full suite before building and retains results outside its context", (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const commands = f.commands();
  assert.equal(commands.length, 4);
  for (const command of commands) assert.ok(command.startsWith(`${f.context}|`));
  assert.match(commands[0], /install --frozen-lockfile/);
  assert.match(commands[1], /db:generate/);
  assert.match(commands[2], /--filter quipsly test --maxWorkers=2 --json .*\|0\|1$/);
  assert.match(commands[3], /next build --webpack/);
  const directory = readdirSync(f.root).find((name) => name.startsWith("quipsly-release-tests."));
  assert.ok(directory);
  assert.match(readFileSync(path.join(f.root, directory, "jest.log"), "utf8"), /Application test output/);
  assert.equal(JSON.parse(readFileSync(path.join(f.root, directory, "jest-results.json"), "utf8")).success, true);
  assert.equal(readdirSync(f.context).some((name) => name.startsWith("quipsly-release-tests")), false);
});

test("a test runner failure survives tee, retains its log, and prevents a production build", (t) => {
  const f = fixture(t);
  const result = f.run("test");
  assert.equal(result.status, 17, result.stdout + result.stderr);
  assert.equal(f.commands().length, 3);
  assert.doesNotMatch(f.commands().join("\n"), /next build/);
  const directory = readdirSync(f.root).find((name) => name.startsWith("quipsly-release-tests."));
  assert.match(readFileSync(path.join(f.root, directory, "jest.log"), "utf8"), /Injected test failure/);
  assert.equal(existsSync(path.join(f.root, directory, "jest-results.json")), false);
  assert.doesNotMatch(result.stdout, /PASS Exact committed/);
});

for (const [stage, count] of [["install", 1], ["generate", 2], ["build", 4]]) {
  test(`a ${stage} failure stops the release instead of reporting success`, (t) => {
    const f = fixture(t);
    const result = f.run(stage);
    assert.equal(result.status, 17, result.stdout + result.stderr);
    assert.equal(f.commands().length, count);
    assert.doesNotMatch(result.stdout, /PASS Exact committed/);
  });
}

test("an unmarked or receipt-less directory never reaches the toolchain", (t) => {
  const f = fixture(t);
  assert.equal(f.run("", f.root).status, 2);
  rmSync(path.join(f.context, "quipsly-release-source.json"));
  assert.equal(f.run().status, 2);
  assert.deepEqual(f.commands(), []);
});

for (const change of ["changed", "added", "removed", "symlink", "missing inventory", "wrong release", "invalid source SHA", "malformed receipt"]) {
  test(`${change} release inputs never reach installation, tests, or build`, (t) => {
    const f = fixture(t);
    const source = path.join(f.context, "scripts/sync-prisma-pnpm-clients.mjs");
    const receiptPath = path.join(f.context, "quipsly-release-source.json");
    if (change === "changed") writeFileSync(source, "throw new Error('unexpected source');");
    if (change === "added") writeFileSync(path.join(f.context, ".env.local"), "UNEXPECTED=local-value");
    if (change === "removed") rmSync(source);
    if (change === "symlink") {
      rmSync(source);
      const external = path.join(f.root, "external.mjs");
      writeFileSync(external, "");
      symlinkSync(external, source);
    }
    if (change === "malformed receipt") writeFileSync(receiptPath, "not JSON");
    if (["missing inventory", "wrong release", "invalid source SHA"].includes(change)) {
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      if (change === "missing inventory") delete receipt.inventorySha1;
      if (change === "wrong release") receipt.releaseId = "hgo-web";
      if (change === "invalid source SHA") receipt.sourceSha = "HEAD";
      writeFileSync(receiptPath, JSON.stringify(receipt));
    }
    const result = f.run();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.deepEqual(f.commands(), []);
    assert.doesNotMatch(result.stdout, /PASS Exact committed/);
    assert.doesNotMatch(result.stderr, /UNEXPECTED=local-value|unexpected source/,
      "Integrity errors report the problem without dumping file contents.");
  });
}
