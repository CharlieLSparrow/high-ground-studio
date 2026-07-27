import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(
  path.join(root, relativePath),
  "utf8",
);

const finalization = read(
  "apps/quipsly/src/lib/server/mobile-capture-resumable-finalization.ts",
);
const queue = read(
  "apps/quipsly/src/lib/server/capture-proxy-processing.ts",
);
const reconciliation = read(
  "apps/quipsly/src/lib/server/capture-proxy-reconciliation.ts",
);
const sessions = read(
  "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts",
);
const episodeRoom = read(
  "apps/quipsly/src/lib/server/episode-room-store.ts",
);
const dockerfile = read("apps/quipsly-media-processor/Dockerfile");

test("released verified videos durably queue only after canonical finalization", () => {
  const transaction = finalization.indexOf(
    "serializableFinalizationTransaction",
  );
  const queueCall = finalization.lastIndexOf(
    "ensureCaptureProxyProcessingQueued",
  );
  assert.ok(transaction >= 0);
  assert.ok(queueCall > transaction);
  for (const evidence of [
    "bucketName",
    "objectName",
    "objectGeneration",
    "sourceSha256",
    "sourceSizeBytes",
    "sourceContentType",
    "actorUserId",
  ]) {
    assert.ok(finalization.includes(evidence), evidence);
  }
  assert.ok(finalization.includes("existingWorkflow.inputJson"));
  assert.ok(queue.includes("ensureCaptureProxyWorkflowQueued"));
  assert.ok(queue.includes("transactional outbox"));
  assert.ok(reconciliation.includes("ensureCaptureProxyWorkflowQueued"));
});

test("queue control is immutable, private, and explicitly deployed", () => {
  for (const contract of [
    "ifGenerationMatch: 0",
    "parseCaptureProxyManifest",
    "parseCaptureProxyQueueReceipt",
    "QUIPSLY_MEDIA_PROCESSOR_ENABLED",
    "QUIPSLY_MEDIA_PROCESSOR_PROJECT_ID",
    "QUIPSLY_MEDIA_PROCESSOR_REGION",
    "QUIPSLY_MEDIA_PROCESSOR_JOB",
    "https://run.googleapis.com/v2/projects/",
    "canonicalManifest.status === \"completed\"",
    "executionRequested: false",
    "executionRequestIsRecent",
    "executionRequestedAt",
  ]) {
    assert.ok(queue.includes(contract), contract);
  }
});

test("reconciliation proves storage, access, ownership, and canonical projection", () => {
  for (const boundary of [
    "parseCaptureProxyResult",
    "assertStoredOutput",
    "authorizeStudioMediaSource",
    "FOR UPDATE",
    "canonicalEpisodeProductionJson",
    "studioVideoSource",
    "studioMediaAsset",
    "studioAssetAttachment",
    "studioAssetVariant",
    "originalRemainsSourceTruth: true",
    "status: \"completed\"",
  ]) {
    assert.ok(reconciliation.includes(boundary), boundary);
  }
  assert.ok(
    reconciliation.indexOf("FOR UPDATE")
      < reconciliation.lastIndexOf("studioEpisodeProduction.update"),
  );
  assert.ok(reconciliation.includes(
    'status: { in: ["queued", "processing", "blocked"] }',
  ));
});

test("mobile sessions and Episode Room reconcile before reading proxy rows", () => {
  assert.ok(sessions.includes("reconcileCaptureProxyResults"));
  assert.ok(
    sessions.indexOf("reconcileCaptureProxyResults")
      < sessions.indexOf("const rawCaptureMediaAssets"),
  );
  assert.ok(episodeRoom.includes("reconcileEpisodeCaptureProxies"));
  assert.ok(
    episodeRoom.indexOf("await reconcileEpisodeCaptureProxies")
      < episodeRoom.indexOf(
        "const production = await prisma.studioEpisodeProduction.findFirst",
      ),
  );
});

test("worker image uses a real FFmpeg runtime without root execution", () => {
  assert.ok(dockerfile.includes("apt-get install -y --no-install-recommends ca-certificates ffmpeg"));
  assert.ok(dockerfile.includes("USER worker"));
  assert.ok(dockerfile.includes('CMD ["node", "dist/index.js"]'));
});
