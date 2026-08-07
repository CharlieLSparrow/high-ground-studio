import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SOURCE_VISUAL_OVERVIEW_COLUMNS,
  SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
  SOURCE_VISUAL_OVERVIEW_PROFILE,
  SOURCE_VISUAL_OVERVIEW_ROWS,
  SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
  newSourceVisualOverviewJob,
} from "@high-ground/quipsly-media-processing";

import {
  runOneLocalSourceVisualOverviewJob,
  type LocalSourceVisualOverviewClaim,
  type LocalSourceVisualOverviewStore,
  type ResolvedVisualOverviewInput,
  type SourceVisualOverviewRenderer,
} from "./local-source-visual-overview-worker.js";

function sha256(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

test("local source visual worker retains a bound contact sheet and never rewrites its proxy input", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-source-visual-test-"),
  );
  try {
    const inputPath = path.join(root, "proxy.mp4");
    const inputBytes = Buffer.from("retained collaboration proxy bytes");
    await writeFile(inputPath, inputBytes, { mode: 0o600 });
    const outputBytes = Buffer.from("verified jpeg bytes");
    const job = newSourceVisualOverviewJob({
      jobId: "svojob_12345678",
      derivativeId: "svoderivative_12345678",
      projectId: "project_12345678",
      projectSlug: "homer-source-room",
      actorUserId: "user_12345678",
      actorEmail: "homer@example.com",
      queuedAt: "2026-08-07T12:00:00.000Z",
      source: {
        sourceRevisionId: "revision_12345678",
        identitySha256: "a".repeat(64),
        expectedContentSha256: "b".repeat(64),
      },
      input: {
        derivativeId: "proxy_12345678",
        provider: "local",
        locator: inputPath,
        generation: `sha256:${sha256(inputBytes)}`,
        contentSha256: sha256(inputBytes),
        sizeBytes: inputBytes.byteLength,
        contentType: "video/mp4",
        durationSeconds: 8,
      },
      target: {
        provider: "local",
        locator:
          "source-story/homer-source-room/revision_12345678/contact-sheet.jpg",
        contentType: "image/jpeg",
        derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
        profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
        columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
        rows: SOURCE_VISUAL_OVERVIEW_ROWS,
        sampleCount: SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
      },
    });
    const claim: LocalSourceVisualOverviewClaim = {
      id: job.jobId,
      inputJson: job,
      attempt: 1,
      executionId: "worker-1",
    };
    const receipts: Array<
      Parameters<LocalSourceVisualOverviewStore["complete"]>[0]["receipt"]
    > = [];
    const resolved: ResolvedVisualOverviewInput = {
      projectId: job.projectId,
      sourceRevisionId: job.source.sourceRevisionId,
      sourceIdentitySha256: job.source.identitySha256,
      sourceContentSha256: job.source.expectedContentSha256,
      derivativeId: job.input.derivativeId,
      locator: inputPath,
      generation: job.input.generation,
      contentSha256: job.input.contentSha256,
      sizeBytes: job.input.sizeBytes,
      mimeType: job.input.contentType,
      durationSeconds: job.input.durationSeconds,
      status: "ready",
      storageProvider: "local",
    };
    const store: LocalSourceVisualOverviewStore = {
      claim: async () => claim,
      resolve: async () => resolved,
      complete: async (input) => {
        receipts.push(input.receipt);
        return true;
      },
      retry: async () => true,
      fail: async () => true,
    };
    const renderer: SourceVisualOverviewRenderer = {
      render: async (_input, output) => {
        await writeFile(output, outputBytes, { mode: 0o600 });
        return {
          sha256: sha256(outputBytes),
          sizeBytes: outputBytes.byteLength,
          widthPixels: 1_140,
          heightPixels: 332,
        };
      },
      inspect: async () => ({
        sha256: sha256(outputBytes),
        sizeBytes: outputBytes.byteLength,
        widthPixels: 1_140,
        heightPixels: 332,
      }),
    };
    const before = await stat(inputPath);
    const result = await runOneLocalSourceVisualOverviewJob(store, renderer, {
      executionId: claim.executionId,
      buildId: "build-1",
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-07T12:00:10.000Z"),
    });
    assert.equal(result.disposition, "completed");
    assert.equal(result.jobId, job.jobId);
    const receipt = receipts[0];
    assert.ok(receipt);
    assert.deepEqual(
      receipt.output.sampleTimesSeconds,
      [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5],
    );
    assert.equal(receipt.inputDerivativeRemainsUnchanged, true);
    assert.equal(receipt.originalRemainsSourceTruth, true);
    assert.equal((await stat(inputPath)).size, before.size);
    assert.equal(
      (await stat((result as { outputPath: string }).outputPath)).size,
      outputBytes.byteLength,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local source visual worker fails closed when retained input bytes drift", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "quipsly-source-visual-drift-"),
  );
  try {
    const inputPath = path.join(root, "proxy.mp4");
    await writeFile(inputPath, Buffer.from("changed bytes"));
    const job = newSourceVisualOverviewJob({
      jobId: "svojob_87654321",
      derivativeId: "svoderivative_87654321",
      projectId: "project_87654321",
      projectSlug: "homer-source-room",
      actorUserId: "user_87654321",
      actorEmail: "homer@example.com",
      queuedAt: "2026-08-07T12:00:00.000Z",
      source: {
        sourceRevisionId: "revision_87654321",
        identitySha256: "a".repeat(64),
        expectedContentSha256: "b".repeat(64),
      },
      input: {
        derivativeId: "proxy_87654321",
        provider: "local",
        locator: inputPath,
        generation: `sha256:${"c".repeat(64)}`,
        contentSha256: "c".repeat(64),
        sizeBytes: 100,
        contentType: "video/mp4",
        durationSeconds: 8,
      },
      target: {
        provider: "local",
        locator:
          "source-story/homer-source-room/revision_87654321/contact-sheet.jpg",
        contentType: "image/jpeg",
        derivativeKind: SOURCE_VISUAL_OVERVIEW_DERIVATIVE_KIND,
        profile: SOURCE_VISUAL_OVERVIEW_PROFILE,
        columns: SOURCE_VISUAL_OVERVIEW_COLUMNS,
        rows: SOURCE_VISUAL_OVERVIEW_ROWS,
        sampleCount: SOURCE_VISUAL_OVERVIEW_SAMPLE_COUNT,
      },
    });
    let failure = "";
    const store: LocalSourceVisualOverviewStore = {
      claim: async () => ({
        id: job.jobId,
        inputJson: job,
        attempt: 1,
        executionId: "worker-2",
      }),
      resolve: async () => ({
        projectId: job.projectId,
        sourceRevisionId: job.source.sourceRevisionId,
        sourceIdentitySha256: job.source.identitySha256,
        sourceContentSha256: job.source.expectedContentSha256,
        derivativeId: job.input.derivativeId,
        locator: inputPath,
        generation: job.input.generation,
        contentSha256: job.input.contentSha256,
        sizeBytes: job.input.sizeBytes,
        mimeType: job.input.contentType,
        durationSeconds: job.input.durationSeconds,
        status: "ready",
        storageProvider: "local",
      }),
      complete: async () => true,
      retry: async () => true,
      fail: async (input) => {
        failure = input.code;
        return true;
      },
    };
    const renderer: SourceVisualOverviewRenderer = {
      render: async () => {
        throw new Error("renderer must not run");
      },
      inspect: async () => {
        throw new Error("renderer must not run");
      },
    };
    const result = await runOneLocalSourceVisualOverviewJob(store, renderer, {
      executionId: "worker-2",
      buildId: "build-1",
      leaseMs: 60_000,
      localMediaRoot: root,
      now: () => new Date("2026-08-07T12:00:10.000Z"),
    });
    assert.deepEqual(result, {
      disposition: "failed",
      jobId: job.jobId,
      code: "source-visual-input-bytes-mismatch",
    });
    assert.equal(failure, "source-visual-input-bytes-mismatch");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
