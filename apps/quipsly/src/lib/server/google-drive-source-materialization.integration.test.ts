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
import {
  planGoogleDriveSourceUnitConform,
  requestGoogleDriveSourceUnitConform,
} from "./google-drive-source-conform";
import { createMediaSourceSet } from "./source-story";

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
      if (projectId) {
        await prisma.studioMediaSourceSetMember.deleteMany({
          where: { sourceSet: { projectId } },
        });
        await prisma.studioMediaSourceSet.deleteMany({ where: { projectId } });
      }
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

  async function attach(
    memberRole: "browse-proxy" | "primary-original",
    options: { sourceUnitId?: string; key?: string } = {},
  ) {
    const key = options.key ?? nonce;
    return attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        connectionId,
        sourceUnitId: options.sourceUnitId,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: {
          provider: "google-drive",
          connectionKey: `google-drive:${connectionId}`,
          externalFileId: `${memberRole}-${key}`,
          sharedDriveId: `shared-drive-${nonce}`,
          resourceKey: `resource-${memberRole}-${nonce}`,
          fileName:
            memberRole === "browse-proxy"
              ? `LRV_20260507_180459_01_${key}.lrv`
              : `VID_20260507_180459_00_${key}.insv`,
          mimeType: "video/mp4",
          sizeBytes: memberRole === "browse-proxy" ? "2048" : "8192",
          headRevisionKey: `head-${memberRole}-${key}`,
          checksumMd5:
            memberRole === "browse-proxy" ? "a".repeat(32) : "b".repeat(32),
          durationSeconds: memberRole === "browse-proxy" ? 60 : null,
          mediaProjection: "dual-fisheye",
          projectionMetadata: { memberRole, segment: key },
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
        AND: [
          {
            inputJson: {
              path: ["source", "sourceRevisionId"],
              equals: browse.id,
            },
          },
        ],
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

  it("binds provider revisions for browse work before exact originals upgrade render readiness", async () => {
    const packageKey = `package-${nonce}`;
    const captureKey = `VID_20260507_180459_${nonce}`;
    const sourceUnit = await prisma.studioSourceUnit.create({
      data: {
        projectId,
        slug: packageKey,
        kind: "insta360-drive-segment",
        title: "May 7 · segment proof",
        sourceUrl: `https://drive.google.com/drive/folders/${packageKey}`,
        capturedAt: new Date(),
        metadataJson: {
          schema: "quipsly-google-drive-insta360-segment-v1",
          captureKey,
          packageStatus: "ready-to-attach",
          reasons: [],
          originalRemainsInDrive: true,
        },
        createdByEmail: actorEmail,
      },
    });
    const browse = await attach("browse-proxy", {
      sourceUnitId: sourceUnit.id,
      key: packageKey,
    });
    const original = await attach("primary-original", {
      sourceUnitId: sourceUnit.id,
      key: packageKey,
    });
    const attachedSet = await createMediaSourceSet({
      prisma,
      actorUserId,
      value: {
        projectId,
        clientRequestId: randomUUID(),
        kind: "insta360-360",
        captureKey,
        displayName: sourceUnit.title,
        sourceClockRevisionId: browse.sourceRevisionId,
        members: [
          {
            sourceRevisionId: browse.sourceRevisionId,
            role: "browse-proxy",
            requiredForRender: false,
          },
          {
            sourceRevisionId: original.sourceRevisionId,
            role: "primary-original",
            requiredForRender: true,
          },
        ],
        metadata: {
          providerRevisionsPinned: true,
          exactMembersVerifiedLocally: false,
          originalRemainsInDrive: true,
        },
      },
    });
    const initial = await planGoogleDriveSourceUnitConform({
      prisma,
      projectId,
      sourceUnitId: sourceUnit.id,
      actorUserId,
    });
    expect(initial).toMatchObject({
      status: "needs-preparation",
      storage: { remainingBytes: "10240" },
      sourceSet: { id: attachedSet.sourceSet.id, completeness: "complete" },
    });
    const queued = await requestGoogleDriveSourceUnitConform({
      prisma,
      projectId,
      sourceUnitId: sourceUnit.id,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
      expectedRemainingBytes: initial.storage.remainingBytes,
    });
    expect(queued).toMatchObject({
      status: "preparing",
      sourceSet: { id: attachedSet.sourceSet.id },
    });

    for (const [index, attached] of [browse, original].entries()) {
      const revision = await prisma.studioMediaSourceRevision.findUniqueOrThrow(
        {
          where: { id: attached.sourceRevisionId },
        },
      );
      const job = await prisma.studioWorkflowJob.findFirstOrThrow({
        where: {
          projectId,
          type: "google-drive-source-materialization",
          AND: [
            {
              inputJson: {
                path: ["source", "sourceRevisionId"],
                equals: revision.id,
              },
            },
          ],
        },
      });
      const exactSha256 = String(index + 1).repeat(64);
      await prisma.$transaction([
        prisma.studioWorkflowJob.update({
          where: { id: job.id },
          data: { status: "output-ready" },
        }),
        prisma.studioMediaSourceRevision.update({
          where: { id: revision.id },
          data: {
            contentSha256: exactSha256,
            sourceState: "checksum-bound",
            durationSeconds:
              attached.sourceRevisionId === browse.sourceRevisionId ? 60 : null,
          },
        }),
        prisma.studioMediaSourceReplica.create({
          data: {
            id: `replica_${randomUUID().replaceAll("-", "")}`,
            projectId,
            sourceRevisionId: revision.id,
            workflowJobId: job.id,
            storageProvider: "local-cache",
            locator: `/private/tmp/quipsly-drive-materialization/${revision.id}`,
            generation: `sha256:${exactSha256}`,
            contentSha256: exactSha256,
            checksumMd5: index === 0 ? "a".repeat(32) : "b".repeat(32),
            sizeBytes: revision.sizeBytes!,
            mimeType: "video/mp4",
            status: "ready",
            verificationJson: { schema: "test-exact-replica-v1" },
            provenanceJson: { schema: "test-exact-replica-v1" },
            createdByUserId: actorUserId,
          },
        }),
      ]);
    }
    const prepared = await planGoogleDriveSourceUnitConform({
      prisma,
      projectId,
      sourceUnitId: sourceUnit.id,
      actorUserId,
    });
    expect(prepared).toMatchObject({
      status: "render-ready",
      storage: { remainingBytes: "0" },
      sourceSet: { id: attachedSet.sourceSet.id },
    });
    const renderReady = await requestGoogleDriveSourceUnitConform({
      prisma,
      projectId,
      sourceUnitId: sourceUnit.id,
      actorUserId,
      actorEmail,
      clientRequestId: randomUUID(),
      expectedRemainingBytes: "0",
    });
    expect(renderReady).toMatchObject({
      status: "render-ready",
      sourceSet: { completeness: "complete" },
    });
    await expect(
      prisma.studioMediaSourceSet.count({ where: { projectId, captureKey } }),
    ).resolves.toBe(1);
  });
});
