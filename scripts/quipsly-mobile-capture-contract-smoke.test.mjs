import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./quipsly-mobile-capture-contract-smoke.mjs", import.meta.url));

function run(args, scriptPath = script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, "--json", ...args], {
      env: { ...process.env, QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY: "0",
        QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN: "", QUIPSLY_NATIVE_ACCESS_TOKEN: "" },
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15_000,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      try { resolve({ code, report: JSON.parse(stdout) }); }
      catch { reject(new Error(`Smoke report was not JSON: ${stderr}`)); }
    });
  });
}

function verifyCounts(report) {
  for (const phase of ["source", "runtime"]) {
    for (const status of ["pass", "fail"]) {
      assert.equal(report.phaseCounts[phase][status],
        report.checks.filter((check) => check.phase === phase && check.status === status).length);
    }
  }
}

test("source-only checks do not claim any runtime proof", async () => {
  const { report } = await run(["--source-only", "--base-url=http://127.0.0.1:1"]);
  assert.equal(report.sourceOnly, true);
  assert.ok(report.checks.length > 0);
  assert.ok(report.checks.every((check) => check.phase === "source"));
  assert.deepEqual(report.phaseCounts.runtime, { pass: 0, fail: 0 });
  verifyCounts(report);
});

test("unavailable HTTP contracts are runtime failures, not source-code failures", async (t) => {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Synthetic unavailable service" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const { code, report } = await run([`--base-url=http://127.0.0.1:${server.address().port}`]);
  assert.equal(code, 1);
  assert.ok(requests > 0);
  assert.ok(report.phaseCounts.runtime.fail > 0);
  assert.ok(report.phaseCounts.source.pass > 0);
  assert.ok(report.checks.every((check) => ["source", "runtime"].includes(check.phase)));
  verifyCounts(report);
});

test("runtime-only probes operate without a source checkout and retain HTTP failures", async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "quipsly-runtime-contract-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const isolatedScript = path.join(directory, "smoke.mjs");
  copyFileSync(script, isolatedScript);
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    response.writeHead(503, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Synthetic unavailable service" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const { code, report } = await run([
    "--runtime-only", `--base-url=http://127.0.0.1:${server.address().port}`,
  ], isolatedScript);
  assert.equal(code, 1);
  assert.ok(requests > 0);
  assert.equal(report.runtimeOnly, true);
  assert.deepEqual(report.phaseCounts.source, { pass: 0, fail: 0 });
  assert.ok(report.phaseCounts.runtime.fail > 0);
  assert.ok(report.checks.every((check) => check.phase === "runtime"));
  verifyCounts(report);
});

test("contradictory source and runtime modes are rejected", async () => {
  await assert.rejects(run(["--source-only", "--runtime-only"]), /Choose source-only or runtime-only, not both/);
});
