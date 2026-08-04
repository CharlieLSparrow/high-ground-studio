import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  } finally {
    if (server) await new Promise((resolveClose) => server.close(resolveClose));
    await rm(directory, { recursive: true, force: true });
  }
});
