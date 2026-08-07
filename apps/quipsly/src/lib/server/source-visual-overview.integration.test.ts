/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { SOURCE_VISUAL_OVERVIEW_PROFILE } from "@high-ground/quipsly-media-processing";
import { requestSourceVisualOverview } from "./source-visual-overview";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_SOURCE_VISUAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_SOURCE_VISUAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL)
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for source visual proof.",
    );
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("source visual overview durable request", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `source-visual-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let sourceRevisionId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({
      data: { primaryEmail: actorEmail, name: "Source visual operator" },
    });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `source-visual-${nonce}`, name: "Source visual smoke" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `source-visual-project-${nonce}`,
        name: "Homer source room",
      },
    });
    projectId = project.id;
    const reference = await prisma.studioExternalMediaReference.create({
      data: {
        projectId,
        provider: "local-file-vault",
        connectionKey: `local:${nonce}`,
        externalFileId: `source-${nonce}`,
        fileName: "Homer Insta360 source.mp4",
        mimeType: "video/mp4",
        sizeBytes: 2_000_000n,
        headRevisionKey: `sha256:${"a".repeat(64)}`,
        checksumSha256: "a".repeat(64),
        accessState: "available",
        capabilityState: "downloadable",
        providerLocatorJson: {
          localPath: `/private/tmp/quipsly-media-ingest/${nonce}/source.mp4`,
        },
        importedByUserId: actorUserId,
        importedByEmail: actorEmail,
        clientRequestId: randomUUID(),
      },
    });
    const source = await prisma.studioMediaSourceRevision.create({
      data: {
        projectId,
        externalReferenceId: reference.id,
        revisionKey: `sha256:${"a".repeat(64)}`,
        identitySha256: "b".repeat(64),
        contentSha256: "a".repeat(64),
        sizeBytes: 2_000_000n,
        durationSeconds: 80,
        widthPixels: 960,
        heightPixels: 480,
        framesPerSecond: 24,
        sourceState: "checksum-bound",
        verifiedAt: new Date(),
        createdByUserId: actorUserId,
      },
    });
    sourceRevisionId = source.id;
    const proxyJob = await prisma.studioWorkflowJob.create({
      data: {
        id: `visualproxyjob_${nonce}`,
        projectId,
        type: "external-source-proxy",
        source: "source-story.external-proxy",
        status: "output-ready",
        requestedByEmail: actorEmail,
      },
    });
    await prisma.studioMediaDerivative.create({
      data: {
        id: `visualproxy_${nonce}`,
        projectId,
        sourceRevisionId,
        workflowJobId: proxyJob.id,
        kind: "collaboration-proxy",
        profile: "collaboration-efficient-960w-h264-aac-v1",
        storageProvider: "local",
        locator: `/private/tmp/quipsly-media-ingest/${nonce}/proxy.mp4`,
        generation: `sha256:${"c".repeat(64)}`,
        contentSha256: "c".repeat(64),
        sizeBytes: 500_000n,
        mimeType: "video/mp4",
        durationSeconds: 80,
        widthPixels: 960,
        heightPixels: 480,
        framesPerSecond: 24,
        createdByUserId: actorUserId,
      },
    });
  });

  afterAll(async () => {
    try {
      if (workspaceId)
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId)
        await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("queues one generation-bound job, replays it, and preserves retry history", async () => {
    const input = {
      prisma,
      projectId,
      sourceRevisionId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
    };
    const queued = await requestSourceVisualOverview(input);
    expect(queued).toMatchObject({
      replayed: false,
      state: "queued",
      derivative: null,
    });
    expect(queued.job?.inputJson).toMatchObject({
      source: { sourceRevisionId, expectedContentSha256: "a".repeat(64) },
      input: {
        derivativeId: `visualproxy_${nonce}`,
        generation: `sha256:${"c".repeat(64)}`,
      },
      target: { profile: SOURCE_VISUAL_OVERVIEW_PROFILE, sampleCount: 8 },
    });
    await expect(
      requestSourceVisualOverview({ ...input, clientRequestId: randomUUID() }),
    ).resolves.toMatchObject({
      replayed: true,
      state: "queued",
      job: { id: queued.job?.id },
    });
    await expect(
      prisma.studioWorkflowJob.count({
        where: { projectId, type: "source-visual-overview" },
      }),
    ).resolves.toBe(1);
    await prisma.studioWorkflowJob.update({
      where: { id: queued.job!.id },
      data: {
        status: "failed",
        error: "fixture failure",
        resultJson: { state: "failed", failure: { code: "fixture-failure" } },
      },
    });
    const retried = await requestSourceVisualOverview({
      ...input,
      clientRequestId: randomUUID(),
      retryFailed: true,
    });
    expect(retried).toMatchObject({
      replayed: false,
      state: "queued",
      job: { id: queued.job?.id, status: "queued", error: null },
    });
    expect(retried.job?.resultJson).toMatchObject({
      failureHistory: [{ code: "fixture-failure" }],
      originalRemainsSourceTruth: true,
      inputDerivativeRemainsUnchanged: true,
    });
  });
});
