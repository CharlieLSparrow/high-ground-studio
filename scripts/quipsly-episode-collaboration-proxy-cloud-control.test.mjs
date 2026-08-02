import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const contracts = read("packages/quipsly-media-processing/src/index.ts");
const localWorker = read("apps/quipsly-media-processor/src/local-episode-worker.ts");
const cloudWorker = read("apps/quipsly-media-processor/src/episode-cloud-worker.ts");
const processor = read("apps/quipsly-media-processor/src/index.ts");
const control = read("apps/quipsly/src/lib/server/episode-collaboration-proxy-cloud.ts");
const reconciliation = read("apps/quipsly/src/lib/server/episode-collaboration-proxy.ts");
const registration = read("apps/quipsly/src/lib/server/episode-collaboration-proxy-registration.ts");
const access = read("scripts/release/quipsly-media-processor-access.sh");

test("episode cloud control stays inside the existing least-privilege processor folders", () => {
  assert.match(
    contracts,
    /EPISODE_COLLABORATION_PROXY_CLOUD_CONTROL_PREFIX =\s*\n\s*"media-vault\/control\/capture-proxy\/episode-collaboration"/,
  );
  assert.ok(access.includes('control_folder="media-vault/control/capture-proxy/"'));
  assert.ok(access.includes('raw_folder="media-vault/raw/"'));
  assert.ok(access.includes('proxy_folder="media-vault/proxy/"'));
  assert.ok(access.includes('roles/storage.objectViewer'));
  assert.ok(access.includes('roles/storage.objectUser'));
});

test("database and GCS workers cannot steal each other's provider jobs", () => {
  assert.ok(localWorker.includes('"inputJson"->\'source\'->>\'provider\' = \'local\''));
  assert.ok(contracts.includes('job.source.provider !== "gcs"'));
  assert.ok(contracts.includes('job.target.provider !== "gcs"'));
  assert.ok(cloudWorker.includes("parseGenerationBoundGcsLocator"));
});

test("episode cloud outbox is create-once, generation-bound, and crash-replayable", () => {
  for (const contract of [
    "ifGenerationMatch: 0",
    "parseEpisodeCollaborationProxyCloudManifest",
    "parseEpisodeCollaborationProxyCloudQueueReceipt",
    "assertImmutableManifestBinding",
    "manifestGeneration",
    "sourceGeneration",
    "sourceSha256",
    "originalRemainsSourceTruth: true",
    "mediaProcessorExecutionRequestIsRecent",
    "requestMediaProcessorExecution",
  ]) {
    assert.ok(control.includes(contract), contract);
  }
});

test("one immutable processor image executes both capture and episode queues", () => {
  assert.ok(processor.includes("runCaptureProxyWorker"));
  assert.ok(processor.includes("runEpisodeCloudProxyWorker"));
  assert.ok(processor.indexOf("runCaptureProxyWorker") < processor.lastIndexOf("runEpisodeCloudProxyWorker"));
  assert.ok(cloudWorker.includes("claimEpisodeCollaborationProxyCloudManifest"));
  assert.ok(cloudWorker.includes("releaseEpisodeCollaborationProxyCloudLease"));
  assert.ok(cloudWorker.includes("completeEpisodeCollaborationProxyCloudManifest"));
  assert.ok(cloudWorker.includes("failEpisodeCollaborationProxyCloudManifest"));
});

test("Nest independently proves cloud source and output before canonical registration", () => {
  for (const contract of [
    "ensureEpisodeCollaborationProxyCloudQueued",
    "parseEpisodeCollaborationProxyCloudManifest",
    "parseEpisodeCollaborationProxyResult",
    "assertCurrentSource",
    "assertCurrentOutput",
    'file.createReadStream({ validation: "crc32c" })',
    "quipslySourceSha256",
    "quipslyOutputSha256",
    "quipslyOriginalRemainsSourceTruth",
    "registerEpisodeCollaborationProxy",
  ]) {
    assert.ok(reconciliation.includes(contract), contract);
  }
  assert.ok(
    reconciliation.indexOf("await assertCurrentSource(input.job)")
      < reconciliation.lastIndexOf("await registerEpisodeCollaborationProxy({"),
  );
  assert.ok(registration.includes("originalRemainsSourceTruth: true"));
});
