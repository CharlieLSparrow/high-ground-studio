import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");

test("dry-run creates a deterministic exact-range provider derivative", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quipsly-provider-runner-test-"));
  const sourcePath = join(directory, "source.wav");
  const policyPath = join(directory, "policy.json");
  const inputPath = join(directory, "runner-input.json");
  const bearerToken = `test-${randomUUID()}`;
  let server;
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=70",
      "-ac", "2", "-c:a", "pcm_s16le", sourcePath,
    ]);
    const sourceBytes = await readFile(sourcePath);
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    server = createServer((request, response) => {
      if (request.url !== "/protected-source" || request.headers.authorization !== `Bearer ${bearerToken}`) {
        response.writeHead(403).end();
        return;
      }
      response.writeHead(200, { "content-type": "audio/wav", "content-length": sourceBytes.byteLength });
      response.end(sourceBytes);
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await writeFile(policyPath, `${JSON.stringify({
      capturedAt: "2026-08-03T18:00:00.000Z",
      sourceUrl: "https://example.test/policy",
      trainingUsage: "test-only",
      retentionMode: "test-only",
    })}\n`, { flag: "wx", mode: 0o600 });
    await writeFile(inputPath, `${JSON.stringify({
      kind: "quipsly-private-transcript-evaluation-runner-input-v1",
      version: 1,
      roomId: "runner-test-room",
      corpusRevisionSha256: "a".repeat(64),
      windows: [{
        windowId: "runner-test-window",
        windowKeySha256: "b".repeat(64),
        source: {
          sha256: sourceSha256,
          protectedPlaybackUrl: "/protected-source",
          startSeconds: 5,
          endSeconds: 65,
          durationSeconds: 60,
        },
        reference: { contentSha256: "c".repeat(64) },
        terminologyExperiment: {
          schema: "quipsly-transcript-terminology-experiment-v1",
          termsSha256: "d".repeat(64),
          promptTermCount: 2,
          terms: [
            { canonicalText: "Quipsly" },
            { canonicalText: "High Ground Odyssey" },
          ],
        },
      }],
    })}\n`, { flag: "wx", mode: 0o600 });

    const run = async (runKey) => {
      const result = await execFileAsync(process.execPath, [
        "--experimental-strip-types",
        "--import", resolve(repositoryRoot, "scripts/register-ts-extension-loader.mjs"),
        resolve(repositoryRoot, "scripts/quipsly-transcript-provider-runner.mjs"),
        "--provider", "openai",
        "--input", inputPath,
        "--base-url", baseUrl,
        "--run-key", runKey,
        "--policy", policyPath,
        "--dry-run",
      ], {
        cwd: repositoryRoot,
        env: { ...process.env, QUIPSLY_BEARER_TOKEN: bearerToken },
        maxBuffer: 4 * 1024 * 1024,
      });
      return JSON.parse(result.stdout);
    };

    const first = await run("deterministic-run-a");
    const second = await run("deterministic-run-b");
    assert.equal(first.results[0].outcome, "validated-only");
    assert.equal(first.results[0].derivativeDurationSeconds, 60);
    assert.match(first.results[0].derivativeSha256, /^[a-f0-9]{64}$/);
    assert.equal(first.results[0].derivativeSha256, second.results[0].derivativeSha256);
    assert.equal(first.results[0].derivativeBytes, second.results[0].derivativeBytes);

    const paired = await execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "--import", resolve(repositoryRoot, "scripts/register-ts-extension-loader.mjs"),
      resolve(repositoryRoot, "scripts/quipsly-transcript-provider-runner.mjs"),
      "--provider", "local-whisper",
      "--terminology-experiment",
      "--input", inputPath,
      "--base-url", baseUrl,
      "--run-key", "paired-run",
      "--policy", policyPath,
      "--dry-run",
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, QUIPSLY_BEARER_TOKEN: bearerToken },
      maxBuffer: 4 * 1024 * 1024,
    });
    const pairedSummary = JSON.parse(paired.stdout);
    assert.equal(pairedSummary.experiment, "terminology");
    assert.deepEqual(pairedSummary.results[0].arms, ["baseline", "project-terminology"]);
    assert.equal(pairedSummary.results[0].derivativeSha256, first.results[0].derivativeSha256);

    await assert.rejects(execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "--import", resolve(repositoryRoot, "scripts/register-ts-extension-loader.mjs"),
      resolve(repositoryRoot, "scripts/quipsly-transcript-provider-runner.mjs"),
      "--provider", "openai",
      "--terminology-experiment",
      "--input", inputPath,
      "--base-url", baseUrl,
      "--run-key", "unsupported-run",
      "--policy", policyPath,
      "--dry-run",
    ], { cwd: repositoryRoot, env: { ...process.env, QUIPSLY_BEARER_TOKEN: bearerToken } }), /does not support prompt terminology/);
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});

test("local Whisper terminology experiment reuses one derivative and appends two durable arms", async () => {
  const directory = await mkdtemp(join(tmpdir(), "quipsly-provider-pair-test-"));
  const sourcePath = join(directory, "source.wav");
  const policyPath = join(directory, "policy.json");
  const inputPath = join(directory, "runner-input.json");
  const evidenceDirectory = join(directory, "evidence");
  const whisperPath = join(directory, "fake-whisper.mjs");
  const bearerToken = `test-${randomUUID()}`;
  const appends = [];
  let server;
  try {
    await execFileAsync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=16000:duration=61",
      "-ac", "1", "-c:a", "pcm_s16le", sourcePath,
    ]);
    const sourceBytes = await readFile(sourcePath);
    const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
    await writeFile(whisperPath, `#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
const args = process.argv.slice(2);
const outputDirectory = args[args.indexOf("--output_dir") + 1];
const prompted = args.includes("--initial_prompt");
await writeFile(join(outputDirectory, "window.json"), JSON.stringify({
  language: "en",
  text: prompted ? "Quipsly" : "Quips Lee",
  segments: [{ start: 0, end: 1, text: prompted ? "Quipsly" : "Quips Lee", words: prompted
    ? [{ word: " Quipsly", start: 0, end: 1, probability: 0.9 }]
    : [{ word: " Quips", start: 0, end: 0.5, probability: 0.8 }, { word: " Lee", start: 0.5, end: 1, probability: 0.8 }] }],
}));
`, { flag: "wx", mode: 0o700 });
    await chmod(whisperPath, 0o700);
    server = createServer(async (request, response) => {
      if (request.headers.authorization !== `Bearer ${bearerToken}`) {
        response.writeHead(403).end();
        return;
      }
      if (request.method === "GET" && request.url === "/protected-source") {
        response.writeHead(200, { "content-type": "audio/wav", "content-length": sourceBytes.byteLength });
        response.end(sourceBytes);
        return;
      }
      if (request.method === "POST" && request.url === "/api/transcript-evaluation") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        appends.push(body);
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true, candidate: { id: `candidate-${appends.length}` }, idempotentReplay: false }));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    await writeFile(policyPath, `${JSON.stringify({
      capturedAt: "2026-08-06T18:00:00.000Z",
      sourceUrl: "https://github.com/openai/whisper",
      trainingUsage: "not-applicable",
      retentionMode: "on-device",
    })}\n`, { flag: "wx", mode: 0o600 });
    await writeFile(inputPath, `${JSON.stringify({
      kind: "quipsly-private-transcript-evaluation-runner-input-v1",
      version: 1,
      roomId: "paired-test-room",
      corpusRevisionSha256: "a".repeat(64),
      windows: [{
        windowId: "paired-test-window",
        windowKeySha256: "b".repeat(64),
        source: { sha256: sourceSha256, protectedPlaybackUrl: "/protected-source", startSeconds: 0, endSeconds: 60, durationSeconds: 60 },
        reference: { contentSha256: "c".repeat(64) },
        terminologyExperiment: {
          schema: "quipsly-transcript-terminology-experiment-v1",
          termsSha256: "d".repeat(64),
          promptTermCount: 1,
          terms: [{ canonicalText: "Quipsly" }],
        },
        runControl: {
          schema: "quipsly-transcript-evaluation-runner-lease-v1",
          runId: "controlled-run-id",
          comparisonKey: "controlled-comparison",
          baselineRunKey: "controlled-baseline",
          terminologyRunKey: "controlled-project-terminology",
        },
      }],
    })}\n`, { flag: "wx", mode: 0o600 });

    const run = await execFileAsync(process.execPath, [
      "--experimental-strip-types",
      "--import", resolve(repositoryRoot, "scripts/register-ts-extension-loader.mjs"),
      resolve(repositoryRoot, "scripts/quipsly-transcript-provider-runner.mjs"),
      "--provider", "local-whisper",
      "--terminology-experiment",
      "--whisper-executable", whisperPath,
      "--input", inputPath,
      "--base-url", baseUrl,
      "--run-key", "matched-local-run",
      "--policy", policyPath,
      "--evidence-dir", evidenceDirectory,
    ], { cwd: repositoryRoot, env: { ...process.env, QUIPSLY_BEARER_TOKEN: bearerToken }, maxBuffer: 4 * 1024 * 1024 });
    const summary = JSON.parse(run.stdout);
    assert.equal(summary.results.length, 2);
    assert.deepEqual(appends.map((body) => body.requestConfig.terminologyExperiment.arm), ["baseline", "project-terminology"]);
    assert.deepEqual(appends.map((body) => body.runKey), ["controlled-baseline", "controlled-project-terminology"]);
    assert.deepEqual(appends.map((body) => body.requestConfig.terminologyExperiment.comparisonKey), ["controlled-comparison", "controlled-comparison"]);
    assert.equal(appends[0].requestConfig.inputMedia.sha256, appends[1].requestConfig.inputMedia.sha256);
    assert.equal(appends[0].requestConfig.provider.terminology.termCount, 0);
    assert.equal(appends[1].requestConfig.provider.terminology.termCount, 1);
    assert.match(appends[1].requestConfig.provider.terminology.promptSha256, /^[a-f0-9]{64}$/);
    assert.equal(appends[0].candidate.adapterVersion, "quipsly-local-whisper-evaluation-adapter-v1");
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});
