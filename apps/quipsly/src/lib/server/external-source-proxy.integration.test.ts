/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { attachVerifiedExternalMediaSource } from "./external-media-source";
import {
  ExternalSourceProxyRequestError,
  requestExternalSourceProxy,
} from "./external-source-proxy";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_EXTERNAL_PROXY_DB_SMOKE === "1"
    ? describe
    : describe.skip;
if (process.env.QUIPSLY_EXTERNAL_PROXY_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL)
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for external proxy proof.",
    );
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("external source proxy durable request", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `external-proxy-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    const actor = await prisma.user.create({
      data: { primaryEmail: actorEmail, name: "External proxy operator" },
    });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `external-proxy-${nonce}`, name: "External proxy smoke" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `external-proxy-project-${nonce}`,
        name: "Source-to-story proxy",
      },
    });
    projectId = project.id;
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

  function verifiedFile(provider: "local-file-vault" | "google-drive") {
    return {
      provider,
      connectionKey: `${provider}:${nonce}`,
      externalFileId: `${provider}-source-${nonce}`,
      localPath:
        provider === "local-file-vault"
          ? `/private/tmp/quipsly-media-ingest/${nonce}/source.mp4`
          : null,
      fileName: "Homer Insta360 source.mp4",
      mimeType: "video/mp4",
      sizeBytes: "19100059",
      headRevisionKey: `sha256:${"a".repeat(64)}`,
      checksumSha256: "a".repeat(64),
      accessState: "available" as const,
      capabilityState: "downloadable" as const,
      canDownload: true,
      canReadRevisions: true,
      canCopy: false,
    };
  }

  it("queues exactly one deterministic local job and preserves explicit retry history", async () => {
    const attached = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: verifiedFile("local-file-vault"),
      },
    });
    const sourceRevisionId = attached.sourceRevisionId;
    const input = {
      prisma,
      projectId,
      referenceId: attached.reference.id,
      sourceRevisionId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
    };
    const queued = await requestExternalSourceProxy(input);
    expect(queued).toMatchObject({
      replayed: false,
      state: "queued",
      derivative: null,
    });
    const replayed = await requestExternalSourceProxy({
      ...input,
      clientRequestId: randomUUID(),
    });
    expect(replayed).toMatchObject({
      replayed: true,
      state: "queued",
      job: { id: queued.job?.id },
    });
    await expect(
      prisma.studioWorkflowJob.count({
        where: { projectId, type: "external-source-proxy" },
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
    await expect(
      requestExternalSourceProxy({ ...input, clientRequestId: randomUUID() }),
    ).resolves.toMatchObject({ replayed: true, state: "failed" });
    const retried = await requestExternalSourceProxy({
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
    });

    const derivativeId = `missing_proxy_${randomUUID().replaceAll("-", "")}`;
    await prisma.$transaction([
      prisma.studioWorkflowJob.update({
        where: { id: queued.job!.id },
        data: {
          status: "output-ready",
          resultJson: { state: "output-ready", receipt: "prior proxy" },
        },
      }),
      prisma.studioMediaDerivative.create({
        data: {
          id: derivativeId,
          projectId,
          sourceRevisionId,
          workflowJobId: queued.job!.id,
          kind: "collaboration-proxy",
          profile: "collaboration-efficient-960w-h264-aac-v1",
          storageProvider: "local",
          locator: `/private/tmp/quipsly-reclaimed/${nonce}.mp4`,
          generation: `sha256:${"d".repeat(64)}`,
          contentSha256: "d".repeat(64),
          sizeBytes: BigInt(4096),
          mimeType: "video/mp4",
          status: "missing",
          unavailableAt: new Date(),
          createdByUserId: actorUserId,
        },
      }),
    ]);
    const recovered = await requestExternalSourceProxy({
      ...input,
      clientRequestId: randomUUID(),
    });
    expect(recovered).toMatchObject({
      replayed: false,
      state: "queued",
      job: { id: queued.job?.id, status: "queued" },
    });
    expect(recovered.job?.resultJson).toMatchObject({
      recoveryReason: "local-derivative-unavailable",
      recoveryHistory: [
        {
          priorStatus: "output-ready",
          priorResult: { receipt: "prior proxy" },
        },
      ],
    });
    await prisma.studioMediaDerivative.delete({ where: { id: derivativeId } });
  });

  it("holds provider-owned sources until their authenticated executor is activated", async () => {
    const attached = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: verifiedFile("google-drive"),
      },
    });
    await expect(
      requestExternalSourceProxy({
        prisma,
        projectId,
        referenceId: attached.reference.id,
        sourceRevisionId: attached.sourceRevisionId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "provider-executor-unavailable",
      status: 409,
    } satisfies Partial<ExternalSourceProxyRequestError>);
    await expect(
      prisma.studioWorkflowJob.count({
        where: { projectId, type: "external-source-proxy" },
      }),
    ).resolves.toBe(1);
  });
});
