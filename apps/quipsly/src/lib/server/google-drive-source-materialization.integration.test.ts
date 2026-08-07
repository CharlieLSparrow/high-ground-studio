/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { attachVerifiedExternalMediaSource } from "./external-media-source";
import { requestExternalSourceProxy } from "./external-source-proxy";
import { saveGoogleDriveConnection } from "./google-drive-connection";
import {
  GoogleDriveSourceMaterializationRequestError,
  requestGoogleDriveSourceMaterialization,
} from "./google-drive-source-materialization";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_GOOGLE_DRIVE_MATERIALIZATION_DB_SMOKE === "1"
    ? describe
    : describe.skip;
if (process.env.QUIPSLY_GOOGLE_DRIVE_MATERIALIZATION_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for Drive materialization proof.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("Google Drive source materialization request", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `drive-materializer-${nonce}@example.test`;
  let actorUserId = "";
  let otherUserId = "";
  let workspaceId = "";
  let projectId = "";
  let connectionId = "";

  beforeAll(async () => {
    const [actor, other] = await Promise.all([
      prisma.user.create({
        data: { primaryEmail: actorEmail, name: "Drive materializer" },
      }),
      prisma.user.create({
        data: {
          primaryEmail: `drive-materializer-other-${nonce}@example.test`,
          name: "Other Drive user",
        },
      }),
    ]);
    actorUserId = actor.id;
    otherUserId = other.id;
    const connection = await saveGoogleDriveConnection({
      prisma,
      userId: actorUserId,
      providerAccountKey: `google-drive:materializer-${nonce}`,
      accountEmail: actorEmail,
      displayName: "Homer 360 Drive",
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: "encrypted-materializer-test-token",
      clientRequestId: randomUUID(),
    });
    connectionId = connection.connection.id;
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `drive-materializer-${nonce}`,
        name: "Drive materializer proof",
      },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `drive-materializer-project-${nonce}`,
        name: "Homer 360 source room",
      },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    try {
      if (workspaceId) {
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      if (connectionId) {
        await prisma.studioMediaProviderConnection.deleteMany({
          where: { id: connectionId },
        });
      }
      await prisma.user.deleteMany({
        where: { id: { in: [actorUserId, otherUserId].filter(Boolean) } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  async function attach(memberRole: "browse-proxy" | "primary-original") {
    return attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        connectionId,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: {
          provider: "google-drive",
          connectionKey: `google-drive:${connectionId}`,
          externalFileId: `${memberRole}-${nonce}`,
          sharedDriveId: `shared-drive-${nonce}`,
          resourceKey: `resource-${memberRole}-${nonce}`,
          fileName:
            memberRole === "browse-proxy"
              ? `LRV_20260507_180459_01_${nonce}.lrv`
              : `VID_20260507_180459_00_${nonce}.insv`,
          mimeType: "video/mp4",
          sizeBytes: memberRole === "browse-proxy" ? "2048" : "8192",
          headRevisionKey: `head-${memberRole}-${nonce}`,
          checksumMd5:
            memberRole === "browse-proxy" ? "a".repeat(32) : "b".repeat(32),
          mediaProjection:
            memberRole === "browse-proxy" ? "equirectangular" : "dual-fisheye",
          projectionMetadata: { memberRole, segment: nonce },
          accessState: "available",
          capabilityState: "downloadable",
          canDownload: true,
          canReadRevisions: true,
          canCopy: false,
        },
      },
    });
  }

  it("queues one deterministic LRV transfer, replays it, and preserves retry history", async () => {
    const attached = await attach("browse-proxy");
    const input = {
      prisma,
      projectId,
      referenceId: attached.reference.id,
      sourceRevisionId: attached.sourceRevisionId,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
    };
    const queued = await requestGoogleDriveSourceMaterialization(input);
    expect(queued).toMatchObject({
      replayed: false,
      state: "queued",
      replica: null,
    });
    expect(queued.job?.inputJson).toMatchObject({
      source: {
        memberRole: "browse-proxy",
        expectedMd5: "a".repeat(32),
      },
      target: {
        provider: "local-cache",
        profile: "exact-provider-replica-v1",
      },
    });
    expect(JSON.stringify(queued.job?.inputJson)).not.toContain(
      "encrypted-materializer-test-token",
    );

    await expect(
      requestGoogleDriveSourceMaterialization({
        ...input,
        clientRequestId: randomUUID(),
      }),
    ).resolves.toMatchObject({
      replayed: true,
      state: "queued",
      job: { id: queued.job?.id },
    });
    await expect(
      prisma.studioWorkflowJob.count({
        where: { projectId, type: "google-drive-source-materialization" },
      }),
    ).resolves.toBe(1);

    await prisma.studioWorkflowJob.update({
      where: { id: queued.job!.id },
      data: {
        status: "failed",
        error: "fixture failure",
        resultJson: {
          state: "failed",
          failure: { code: "fixture-failure", message: "network reset" },
        },
      },
    });
    const retried = await requestGoogleDriveSourceMaterialization({
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
      failureHistory: [{ code: "fixture-failure", message: "network reset" }],
      originalRemainsInDrive: true,
    });

    await expect(
      requestGoogleDriveSourceMaterialization({
        ...input,
        actorUserId: otherUserId,
        actorEmail: `drive-materializer-other-${nonce}@example.test`,
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "drive-connection-mismatch",
      status: 403,
    } satisfies Partial<GoogleDriveSourceMaterializationRequestError>);
  });

  it("requires explicit conform for INSV originals and activates the proxy path only after exact LRV retention", async () => {
    const original = await attach("primary-original");
    await expect(
      requestGoogleDriveSourceMaterialization({
        prisma,
        projectId,
        referenceId: original.reference.id,
        sourceRevisionId: original.sourceRevisionId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "browse-proxy-required",
      status: 409,
    } satisfies Partial<GoogleDriveSourceMaterializationRequestError>);

    await expect(
      requestGoogleDriveSourceMaterialization({
        prisma,
        projectId,
        referenceId: original.reference.id,
        sourceRevisionId: original.sourceRevisionId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        purpose: "conform",
      }),
    ).resolves.toMatchObject({
      replayed: false,
      state: "queued",
      replica: null,
      job: {
        inputJson: {
          source: { memberRole: "primary-original" },
          target: {
            profile: "exact-provider-original-replica-v1",
          },
        },
      },
    });

    const browse = await prisma.studioMediaSourceRevision.findFirstOrThrow({
      where: {
        projectId,
        projectionJson: { path: ["memberRole"], equals: "browse-proxy" },
      },
      include: { externalReference: true },
    });
    const materializationJob = await prisma.studioWorkflowJob.findFirstOrThrow({
      where: {
        projectId,
        type: "google-drive-source-materialization",
      },
    });
    const exactSha256 = "c".repeat(64);
    const generation = `sha256:${exactSha256}`;
    await prisma.$transaction([
      prisma.studioWorkflowJob.update({
        where: { id: materializationJob.id },
        data: { status: "output-ready" },
      }),
      prisma.studioMediaSourceRevision.update({
        where: { id: browse.id },
        data: {
          contentSha256: exactSha256,
          sourceState: "checksum-bound",
        },
      }),
      prisma.studioMediaSourceReplica.create({
        data: {
          id: `replica_${randomUUID().replaceAll("-", "")}`,
          projectId,
          sourceRevisionId: browse.id,
          workflowJobId: materializationJob.id,
          storageProvider: "local-cache",
          locator: `/private/tmp/quipsly-drive-materialization/${nonce}.lrv`,
          generation,
          contentSha256: exactSha256,
          checksumMd5: "a".repeat(32),
          sizeBytes: BigInt(2048),
          mimeType: "video/mp4",
          status: "ready",
          verificationJson: { schema: "test-exact-replica-v1" },
          provenanceJson: { schema: "test-exact-replica-v1" },
          createdByUserId: actorUserId,
        },
      }),
    ]);

    await expect(
      requestExternalSourceProxy({
        prisma,
        projectId,
        referenceId: browse.externalReference!.id,
        sourceRevisionId: browse.id,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
      }),
    ).resolves.toMatchObject({
      replayed: false,
      state: "queued",
      derivative: null,
    });
  });
});
