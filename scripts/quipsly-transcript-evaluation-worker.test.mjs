import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");

function lease() {
  return {
    schema: "quipsly-transcript-evaluation-runner-lease-v1",
    run: { id: "controlled-run", runKey: "controlled-run-key", attemptCount: 1 },
    token: randomUUID(),
    runnerInput: {
      kind: "quipsly-private-transcript-evaluation-runner-input-v1",
      version: 1,
      windows: [{ windowId: "controlled-window" }],
    },
  };
}

async function withControlServer(handler) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push(body);
    const result = await handler(body, requests);
    response.writeHead(result.status ?? 200, { "content-type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

test("worker claims, operates, and completes a leased matched run", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quipsly-evaluation-worker-test-"));
  const runner = join(directory, "runner.mjs");
  const policy = join(directory, "policy.json");
  const evidence = join(directory, "evidence");
  const claimedLease = lease();
  const control = await withControlServer(async (body) => {
    if (body.operation === "claim-run") return { body: { ok: true, lease: claimedLease } };
    if (body.operation === "complete-run") return { body: { ok: true, run: { status: "COMPLETED" } } };
    if (body.operation === "heartbeat-run") return { body: { ok: true } };
    return { status: 400, body: { ok: false, error: "unexpected" } };
  });
  try {
    await writeFile(runner, `process.stdout.write(JSON.stringify({ kind: "quipsly-transcript-provider-run-summary-v1", experiment: "terminology", windowCount: 2 }));\n`, { flag: "wx", mode: 0o700 });
    await chmod(runner, 0o700);
    await writeFile(policy, "{}\n", { flag: "wx", mode: 0o600 });
    const result = await execFileAsync(process.execPath, [
      resolve(repositoryRoot, "scripts/quipsly-transcript-evaluation-worker.mjs"),
      "--base-url", control.baseUrl,
      "--policy", policy,
      "--evidence-dir", evidence,
      "--whisper-executable", runner,
      "--worker-id", "controlled-worker",
      "--once",
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, QUIPSLY_BEARER_TOKEN: "controlled-token", QUIPSLY_EVALUATION_RUNNER_PATH: runner },
      maxBuffer: 1024 * 1024,
    });
    assert.match(result.stdout, /START transcript evaluation controlled-run/);
    assert.match(result.stdout, /PASS transcript evaluation controlled-run 2 candidate arms/);
    assert.deepEqual(control.requests.map((request) => request.operation), ["claim-run", "complete-run"]);
    assert.equal(control.requests[1].leaseToken, claimedLease.token);
  } finally {
    await control.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("worker records a sanitized retryable failure instead of losing the lease", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quipsly-evaluation-worker-failure-test-"));
  const runner = join(directory, "runner.mjs");
  const policy = join(directory, "policy.json");
  const evidence = join(directory, "evidence");
  const claimedLease = lease();
  const control = await withControlServer(async (body) => {
    if (body.operation === "claim-run") return { body: { ok: true, lease: claimedLease } };
    if (body.operation === "fail-run") return { body: { ok: true, retryQueued: true, run: { status: "QUEUED" } } };
    return { status: 400, body: { ok: false, error: "unexpected" } };
  });
  try {
    await writeFile(runner, `process.stderr.write("temporary decoder failure controlled-token"); process.exit(7);\n`, { flag: "wx", mode: 0o700 });
    await chmod(runner, 0o700);
    await writeFile(policy, "{}\n", { flag: "wx", mode: 0o600 });
    const result = await execFileAsync(process.execPath, [
      resolve(repositoryRoot, "scripts/quipsly-transcript-evaluation-worker.mjs"),
      "--base-url", control.baseUrl,
      "--policy", policy,
      "--evidence-dir", evidence,
      "--whisper-executable", runner,
      "--worker-id", "controlled-worker",
      "--once",
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, QUIPSLY_BEARER_TOKEN: "controlled-token", QUIPSLY_EVALUATION_RUNNER_PATH: runner },
      maxBuffer: 1024 * 1024,
    });
    assert.match(result.stderr, /RETRY transcript evaluation controlled-run/);
    assert.equal(control.requests[1].operation, "fail-run");
    assert.equal(control.requests[1].retryable, true);
    assert.doesNotMatch(control.requests[1].errorMessage, /controlled-token/);
    assert.match(control.requests[1].errorMessage, /\[redacted\]/);
  } finally {
    await control.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("worker refuses to send its bearer token over remote plain HTTP", async () => {
  await assert.rejects(execFileAsync(process.execPath, [
    resolve(repositoryRoot, "scripts/quipsly-transcript-evaluation-worker.mjs"),
    "--base-url", "http://example.test",
    "--policy", "/private/policy.json",
    "--evidence-dir", "/private/evidence",
    "--once",
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, QUIPSLY_BEARER_TOKEN: "must-not-leave-process" },
    maxBuffer: 1024 * 1024,
  }), (error) => {
    assert.match(error.stderr, /must use HTTPS except for an explicit loopback/);
    assert.doesNotMatch(error.stderr, /must-not-leave-process/);
    return true;
  });
});
