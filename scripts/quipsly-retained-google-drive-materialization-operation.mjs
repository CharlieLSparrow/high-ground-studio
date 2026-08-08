#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { attachVerifiedExternalMediaSource } from "../apps/quipsly/src/lib/server/external-media-source.ts";
import { saveGoogleDriveConnection } from "../apps/quipsly/src/lib/server/google-drive-connection.ts";
import { requestGoogleDriveSourceMaterialization } from "../apps/quipsly/src/lib/server/google-drive-source-materialization.ts";
import {
  newLocalExternalSourceProxyRuntime,
  runOneLocalExternalSourceProxyJob,
} from "../apps/quipsly-media-processor/src/local-external-source-proxy-worker.ts";
import {
  newLocalGoogleDriveMaterializationRuntime,
  runOneLocalGoogleDriveMaterializationJob,
} from "../apps/quipsly-media-processor/src/local-google-drive-source-materialization-worker.ts";
import { resolveLocalExecutionIdentity } from "../apps/quipsly-media-processor/src/local-execution-presence.ts";
import {
  newLocalSourceVisualOverviewRuntime,
  runOneLocalSourceVisualOverviewJob,
} from "../apps/quipsly-media-processor/src/local-source-visual-overview-worker.ts";
import {
  newLocalSourceAudioNavigationRuntime,
  runOneLocalSourceAudioNavigationJob,
} from "../apps/quipsly-media-processor/src/local-source-audio-navigation-worker.ts";

const execFileAsync = promisify(execFile);
const databaseUrl =
  process.env.QUIPSLY_LOCAL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio";
const parsedDatabase = new URL(databaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsedDatabase.hostname)) {
  throw new Error(
    `Refusing retained Drive materialization against non-loopback database ${parsedDatabase.hostname}.`,
  );
}
const runKey = new Date()
  .toISOString()
  .replace(/[-:.TZ]/g, "")
  .slice(0, 14);
const actorEmail = "drive-materialization-dogfood@quipsly.test";
const workspaceSlug = "quipsly-retained-drive-360-lab";
const projectSlug = "quipsly-retained-drive-360-source-room";
const mediaRoot =
  process.env.QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT ||
  path.join(tmpdir(), "quipsly-retained-drive-media");
const providerFixture = path.join(
  tmpdir(),
  `quipsly-retained-drive-provider-${runKey}.lrv`,
);

function deterministicUuid(value) {
  const hex = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

await mkdir(mediaRoot, { recursive: true });
await execFileAsync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=1920x960:rate=24:duration=3",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=523.25:sample_rate=48000:duration=3",
  "-c:v",
  "libx264",
  "-preset",
  "veryfast",
  "-crf",
  "10",
  "-pix_fmt",
  "yuv420p",
  "-c:a",
  "aac",
  "-b:a",
  "192k",
  "-movflags",
  "+faststart",
  "-f",
  "mp4",
  providerFixture,
]);
const providerBytes = await readFile(providerFixture);
const providerMd5 = digest("md5", providerBytes);
const providerSha256Before = digest("sha256", providerBytes);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const executionIdentity = await resolveLocalExecutionIdentity(mediaRoot);
  const executorStorage = {
    status: "measured",
    safeAvailableBytes: String(1024 ** 4),
    availableBytes: String(1024 ** 4),
    reserveBytes: "0",
    measuredAt: new Date().toISOString(),
    workspaceMode: "temporary",
    localPathWithheld: true,
  };
  await prisma.agentNode.upsert({
    where: { hostName: executionIdentity.hostName },
    update: {
      status: "online",
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          ...executorStorage,
          scopeId: executionIdentity.storageScopeId,
        },
      },
      lastHeartbeatAt: new Date(),
    },
    create: {
      id: executionIdentity.nodeId,
      hostName: executionIdentity.hostName,
      ipAddress: "loopback",
      status: "online",
      capabilities: {
        executorKind: "local-mac",
        storage: {
          schema: "quipsly-local-media-storage-v1",
          ...executorStorage,
          scopeId: executionIdentity.storageScopeId,
        },
      },
      lastHeartbeatAt: new Date(),
    },
  });
  const actor = await prisma.user.upsert({
    where: { primaryEmail: actorEmail },
    update: { name: "Drive materialization dogfood" },
    create: { primaryEmail: actorEmail, name: "Drive materialization dogfood" },
  });
  const workspace = await prisma.studioWorkspace.upsert({
    where: { slug: workspaceSlug },
    update: { name: "Retained Drive 360 Lab" },
    create: { slug: workspaceSlug, name: "Retained Drive 360 Lab" },
  });
  const project = await prisma.studioProject.upsert({
    where: {
      workspaceId_slug: { workspaceId: workspace.id, slug: projectSlug },
    },
    update: { name: "Retained Drive 360 Source Room" },
    create: {
      workspaceId: workspace.id,
      slug: projectSlug,
      name: "Retained Drive 360 Source Room",
    },
  });
  const connection = await saveGoogleDriveConnection({
    prisma,
    userId: actor.id,
    providerAccountKey: "google-drive:retained-360-dogfood",
    accountEmail: actorEmail,
    displayName: "Retained fake Drive boundary",
    grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
    encryptedRefreshToken: "retained-fake-drive-credential-never-sent",
    clientRequestId: deterministicUuid("retained-drive-connection-v1"),
  });
  const attached = await attachVerifiedExternalMediaSource({
    prisma,
    value: {
      projectId: project.id,
      actorUserId: actor.id,
      actorEmail,
      connectionId: connection.connection.id,
      clientRequestId: deterministicUuid(`retained-drive-attach:${runKey}`),
      operation: "attach",
      verifiedFile: {
        provider: "google-drive",
        connectionKey: `google-drive:${connection.connection.id}`,
        externalFileId: `retained-lrv-${runKey}`,
        sharedDriveId: "retained-shared-drive-boundary",
        resourceKey: `retained-resource-${runKey}`,
        fileName: `LRV_RETAINED_360_${runKey}.lrv`,
        mimeType: "video/mp4",
        sizeBytes: String(providerBytes.length),
        headRevisionKey: `retained-head-${runKey}`,
        checksumMd5: providerMd5,
        mediaProjection: "dual-fisheye",
        projectionMetadata: {
          memberRole: "browse-proxy",
          segment: runKey,
          proof: "fake-provider-exact-byte-materialization",
          stitched: false,
          cameraViewLayout: "dual-fisheye",
        },
        accessState: "available",
        capabilityState: "downloadable",
        canDownload: true,
        canReadRevisions: true,
        canCopy: false,
      },
    },
  });
  const request = await requestGoogleDriveSourceMaterialization({
    prisma,
    projectId: project.id,
    referenceId: attached.reference.id,
    sourceRevisionId: attached.sourceRevisionId,
    actorUserId: actor.id,
    actorEmail,
    clientRequestId: deterministicUuid(`retained-drive-materialize:${runKey}`),
    executorTarget: {
      ...executionIdentity,
      storage: executorStorage,
    },
  });
  if (!request.job)
    throw new Error("Retained Drive request did not queue a job.");
  await prisma.studioWorkflowJob.update({
    where: { id: request.job.id },
    data: { priority: 1 },
  });

  const provider = {
    inspect: async ({ job }) => ({
      externalFileId: job.source.externalFileId,
      headRevisionKey: job.source.headRevisionKey,
      md5: providerMd5,
      sizeBytes: providerBytes.length,
      canDownload: true,
    }),
    download: async ({ destinationPath, resumeFromBytes, onProgress }) => {
      await writeFile(
        destinationPath,
        providerBytes.subarray(resumeFromBytes),
        {
          flag: resumeFromBytes ? "a" : "w",
          mode: 0o600,
        },
      );
      await onProgress(providerBytes.length);
      return {
        resumedFromBytes: resumeFromBytes,
        downloadedBytes: providerBytes.length - resumeFromBytes,
        providerRequestCount: 1,
      };
    },
  };
  const materializer = newLocalGoogleDriveMaterializationRuntime({
    pool,
    executionId: `retained-drive-materializer-${runKey}`,
    custodianNodeId: executionIdentity.nodeId,
    storageScopeId: executionIdentity.storageScopeId,
    localMediaRoot: mediaRoot,
    leaseMs: 60_000,
    buildId: `retained-drive-${runKey}`,
    provider,
    environment: { QUIPSLY_DRIVE_CACHE_MIN_FREE_BYTES: "0" },
  });
  const materialized = await runOneLocalGoogleDriveMaterializationJob(
    materializer.store,
    materializer.provider,
    materializer.options,
  );
  if (
    materialized.disposition !== "completed" ||
    materialized.jobId !== request.job.id
  ) {
    throw new Error(
      `Drive materialization did not complete the retained job: ${JSON.stringify(materialized)}`,
    );
  }
  const [replica, sourceAfter] = await Promise.all([
    prisma.studioMediaSourceReplica.findFirst({
      where: { workflowJobId: request.job.id },
    }),
    prisma.studioMediaSourceRevision.findUnique({
      where: { id: attached.sourceRevisionId },
    }),
  ]);
  if (
    !replica ||
    replica.contentSha256 !== providerSha256Before ||
    replica.custodianNodeId !== executionIdentity.nodeId ||
    replica.storageScopeId !== executionIdentity.storageScopeId ||
    sourceAfter?.contentSha256 !== providerSha256Before
  ) {
    throw new Error(
      "Exact replica and source revision were not checksum-bound together.",
    );
  }
  if (
    digest("sha256", await readFile(replica.locator)) !== providerSha256Before
  ) {
    throw new Error(
      "Retained local replica does not match the provider fixture bytes.",
    );
  }

  const proxyJob = await prisma.studioWorkflowJob.findFirst({
    where: {
      projectId: project.id,
      type: "external-source-proxy",
      inputJson: {
        path: ["source", "sourceRevisionId"],
        equals: attached.sourceRevisionId,
      },
    },
  });
  if (!proxyJob)
    throw new Error("Verified replica did not queue a collaboration proxy.");
  await prisma.studioWorkflowJob.update({
    where: { id: proxyJob.id },
    data: { priority: 1 },
  });
  const proxyRuntime = newLocalExternalSourceProxyRuntime({
    pool,
    executionId: `retained-drive-proxy-${runKey}`,
    custodianNodeId: executionIdentity.nodeId,
    storageScopeId: executionIdentity.storageScopeId,
    localMediaRoot: mediaRoot,
    leaseMs: 60_000,
    buildId: `retained-drive-${runKey}`,
  });
  const proxied = await runOneLocalExternalSourceProxyJob(
    proxyRuntime.store,
    proxyRuntime.transcoder,
    proxyRuntime.options,
  );
  if (proxied.disposition !== "completed" || proxied.jobId !== proxyJob.id) {
    throw new Error(
      `Collaboration proxy did not complete the retained job: ${JSON.stringify(proxied)}`,
    );
  }
  const derivative = await prisma.studioMediaDerivative.findFirst({
    where: { workflowJobId: proxyJob.id },
  });
  if (!derivative || !(await stat(derivative.locator)).isFile()) {
    throw new Error("Retained collaboration proxy is missing.");
  }
  if (
    derivative.custodianNodeId !== executionIdentity.nodeId ||
    derivative.storageScopeId !== executionIdentity.storageScopeId
  ) {
    throw new Error("Collaboration proxy lost its local executor custody.");
  }
  if (Number(derivative.sizeBytes) >= providerBytes.length) {
    throw new Error("Retained collaboration proxy is not storage-efficient.");
  }
  const [visualJob, audioJob] = await Promise.all([
    prisma.studioWorkflowJob.findFirst({
      where: {
        projectId: project.id,
        type: "source-visual-overview",
        inputJson: { path: ["input", "derivativeId"], equals: derivative.id },
      },
    }),
    prisma.studioWorkflowJob.findFirst({
      where: {
        projectId: project.id,
        type: "source-audio-navigation",
        inputJson: { path: ["input", "derivativeId"], equals: derivative.id },
      },
    }),
  ]);
  if (!visualJob || !audioJob) {
    throw new Error(
      "Proxy completion did not queue both browse-analysis jobs.",
    );
  }
  await prisma.studioWorkflowJob.updateMany({
    where: { id: { in: [visualJob.id, audioJob.id] } },
    data: { priority: 1 },
  });
  const visualRuntime = newLocalSourceVisualOverviewRuntime({
    pool,
    executionId: `retained-drive-visual-${runKey}`,
    custodianNodeId: executionIdentity.nodeId,
    storageScopeId: executionIdentity.storageScopeId,
    localMediaRoot: mediaRoot,
    leaseMs: 60_000,
    buildId: `retained-drive-${runKey}`,
  });
  const visualized = await runOneLocalSourceVisualOverviewJob(
    visualRuntime.store,
    visualRuntime.renderer,
    visualRuntime.options,
  );
  const audioRuntime = newLocalSourceAudioNavigationRuntime({
    pool,
    executionId: `retained-drive-audio-${runKey}`,
    custodianNodeId: executionIdentity.nodeId,
    storageScopeId: executionIdentity.storageScopeId,
    localMediaRoot: mediaRoot,
    leaseMs: 60_000,
    buildId: `retained-drive-${runKey}`,
  });
  const analyzed = await runOneLocalSourceAudioNavigationJob(
    audioRuntime.store,
    audioRuntime.analyzer,
    audioRuntime.options,
  );
  if (
    visualized.disposition !== "completed" ||
    visualized.jobId !== visualJob.id ||
    analyzed.disposition !== "completed" ||
    analyzed.jobId !== audioJob.id
  ) {
    throw new Error(
      `Browse analysis did not complete: ${JSON.stringify({ visualized, analyzed })}`,
    );
  }
  const [visualDerivative, retainedAudioJob] = await Promise.all([
    prisma.studioMediaDerivative.findFirst({
      where: { workflowJobId: visualJob.id },
    }),
    prisma.studioWorkflowJob.findUnique({ where: { id: audioJob.id } }),
  ]);
  if (
    !visualDerivative ||
    visualDerivative.custodianNodeId !== executionIdentity.nodeId ||
    visualDerivative.storageScopeId !== executionIdentity.storageScopeId ||
    retainedAudioJob?.status !== "output-ready"
  ) {
    throw new Error("Browse analysis lost its executor-scoped evidence.");
  }
  if (
    digest("sha256", await readFile(providerFixture)) !== providerSha256Before
  ) {
    throw new Error(
      "The provider fixture changed during exact-copy and proxy work.",
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        runKey,
        project: { id: project.id, slug: project.slug },
        sourceRevisionId: attached.sourceRevisionId,
        materializationJobId: request.job.id,
        replica: {
          id: replica.id,
          sizeBytes: Number(replica.sizeBytes),
          sha256: replica.contentSha256,
        },
        proxyJobId: proxyJob.id,
        derivative: {
          id: derivative.id,
          sizeBytes: Number(derivative.sizeBytes),
          sha256: derivative.contentSha256,
        },
        browseAnalysis: {
          visualJobId: visualJob.id,
          visualDerivativeId: visualDerivative.id,
          audioJobId: audioJob.id,
        },
        boundaries: {
          providerFixtureUnchanged: true,
          exactReplicaVerified: true,
          collaborationProxyVerified: true,
          executorCustodyVerified: true,
          visualCustodyVerified: true,
          audioNavigationVerified: true,
          realDriveOriginalsDownloaded: false,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.allSettled([prisma.$disconnect(), pool.end()]);
}
