/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { attachVerifiedExternalMediaSource } from "./external-media-source";
import { requestExternalSourceProxy } from "./external-source-proxy";
import { listExternalMediaLibraries } from "./external-media-library";
import {
  GoogleDriveLibraryNavigationError,
  prepareGoogleDriveLibraryNavigation,
} from "./google-drive-library-navigation";
import { planGoogleDriveLibraryConform } from "./google-drive-library-conform";
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
  const executorNodeId = `test_executor_${nonce}`;
  const executorScopeId = `storage_scope_${nonce}_integration`;

  beforeAll(async () => {
    await prisma.agentNode.create({
      data: {
        id: executorNodeId,
        hostName: `quipsly-media-worker:Integration-${nonce}`,
        ipAddress: "loopback",
        status: "online",
        capabilities: {
          executorKind: "local-mac",
          storage: {
            schema: "quipsly-local-media-storage-v1",
            status: "measured",
            availableBytes: 1_000_000_000,
            reserveBytes: 100_000_000,
            safeAvailableBytes: 900_000_000,
            measuredAt: new Date().toISOString(),
            workspaceMode: "durable",
            scopeId: executorScopeId,
            pathWithheld: true,
          },
        },
        lastHeartbeatAt: new Date(),
      },
    });
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
      await prisma.agentNode.deleteMany({ where: { id: executorNodeId } });
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

    const missingReplicaId = `missing_replica_${randomUUID().replaceAll("-", "")}`;
    await prisma.$transaction([
      prisma.studioWorkflowJob.update({
        where: { id: queued.job!.id },
        data: {
          status: "output-ready",
          resultJson: { state: "output-ready", receipt: "prior receipt" },
        },
      }),
      prisma.studioMediaSourceReplica.create({
        data: {
          id: missingReplicaId,
          projectId,
          sourceRevisionId: attached.sourceRevisionId,
          workflowJobId: queued.job!.id,
          storageProvider: "local-cache",
          locator: `/private/tmp/quipsly-reclaimed/${nonce}.lrv`,
          generation: `sha256:${"c".repeat(64)}`,
          contentSha256: "c".repeat(64),
          checksumMd5: "a".repeat(32),
          sizeBytes: BigInt(2048),
          mimeType: "video/mp4",
          status: "missing",
          availabilityCheckedAt: new Date(),
          unavailableAt: new Date(),
          verificationJson: {
            localAvailability: {
              schema: "quipsly-local-media-availability-v1",
              state: "missing",
              pathWithheld: true,
            },
          },
          provenanceJson: { schema: "test-reclaimed-replica-v1" },
          createdByUserId: actorUserId,
        },
      }),
    ]);
    const recovered = await requestGoogleDriveSourceMaterialization({
      ...input,
      clientRequestId: randomUUID(),
    });
    expect(recovered).toMatchObject({
      replayed: false,
      state: "queued",
      job: { id: queued.job?.id, status: "queued" },
    });
    expect(recovered.job?.resultJson).toMatchObject({
      recoveryReason: "local-replica-unavailable",
      recoveryHistory: [
        {
          priorStatus: "output-ready",
          priorResult: { state: "output-ready", receipt: "prior receipt" },
        },
      ],
      originalRemainsInDrive: true,
    });
    await prisma.studioMediaSourceReplica.delete({
      where: { id: missingReplicaId },
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

  it("prepares a bounded followed-library batch through the owning Drive connection", async () => {
    const sourceUnit = await prisma.studioSourceUnit.create({
      data: {
        projectId,
        slug: `library-batch-${nonce}`,
        kind: "insta360-drive-segment",
        title: "May 7 camera segment",
        capturedAt: new Date("2026-05-07T18:04:59.000Z"),
        metadataJson: {
          captureKey: `VID_20260507_180459_${nonce}`,
          packageStatus: "ready-to-attach",
          reasons: [],
        },
      },
    });
    const attached = await attach("browse-proxy", {
      sourceUnitId: sourceUnit.id,
      key: `library-batch-${nonce}`,
    });
    const original = await attach("primary-original", {
      sourceUnitId: sourceUnit.id,
      key: `library-batch-${nonce}`,
    });
    const library = await prisma.studioExternalMediaLibrary.create({
      data: {
        projectId,
        connectionId,
        provider: "google-drive",
        externalRootId: `library-batch-${nonce}`,
        name: "Homer bounded 360 library",
        status: "ready",
        revision: 1,
        inventoryFingerprintSha256: "f".repeat(64),
        totalFileCount: 2,
        totalSizeBytes: BigInt(10240),
        readySegmentCount: 1,
        heldSegmentCount: 0,
        providerLocatorJson: {
          schema: "quipsly-google-drive-library-locator-v2",
          mode: "selection-manifest",
        },
        healthJson: {
          schema: "quipsly-external-media-library-health-v2",
        },
        lastCheckedAt: new Date(),
        lastSuccessfulRefreshAt: new Date(),
        clientRequestId: randomUUID(),
        createdByUserId: actorUserId,
        createdByEmail: actorEmail,
        items: {
          create: [
            {
              externalFileId: attached.reference.externalFileId,
              sourceUnitId: sourceUnit.id,
              externalReferenceId: attached.reference.id,
              fileName: attached.reference.fileName,
              observedRevisionKey: attached.reference.headRevisionKey,
              sizeBytes: BigInt(2048),
              state: "present",
              lastObservedAt: new Date(),
            },
            {
              externalFileId: original.reference.externalFileId,
              sourceUnitId: sourceUnit.id,
              externalReferenceId: original.reference.id,
              fileName: original.reference.fileName,
              observedRevisionKey: original.reference.headRevisionKey,
              sizeBytes: BigInt(8192),
              state: "present",
              lastObservedAt: new Date(),
            },
          ],
        },
      },
    });
    await expect(
      planGoogleDriveLibraryConform({
        prisma,
        projectId,
        libraryId: library.id,
        actorUserId,
      }),
    ).resolves.toMatchObject({
      schema: "quipsly-google-drive-library-conform-plan-v1",
      summary: {
        segmentCount: 1,
        renderReady: 0,
        needsPreparation: 1,
        totalOriginalBytes: "8192",
        remainingBytes: "10240",
        inventoryTruncated: false,
      },
      days: [
        {
          date: "2026-05-07",
          segmentCount: 1,
          renderReadyCount: 0,
          remainingBytes: "10240",
        },
      ],
      boundaries: {
        inspectionOnly: true,
        originalsRemainInDrive: true,
        preparationRequiresOneExplicitSegment: true,
      },
    });
    const clientRequestId = randomUUID();
    const prepared = await prepareGoogleDriveLibraryNavigation({
      prisma,
      projectId,
      libraryId: library.id,
      actorUserId,
      actorEmail,
      clientRequestId,
      limit: 1,
      retryFailed: true,
    });
    expect(prepared).toMatchObject({
      schema: "quipsly-google-drive-library-navigation-batch-v1",
      summary: {
        eligibleSourceCount: 1,
        selectedCount: 1,
        materializationCount: 1,
        browseTransferBytes: "2048",
      },
      boundaries: {
        originalsRemainInDrive: true,
        finalConformNotStarted: true,
        deterministicReplay: true,
      },
    });
    const projectedLibrary = (
      await listExternalMediaLibraries({
        prisma,
        projectId,
        actorUserId,
      })
    ).find((candidate) => candidate.id === library.id);
    expect(projectedLibrary).toMatchObject({
      navigationHealth: {
        eligibleSourceCount: 1,
        retainedBrowseCount: 0,
        proxyReadyCount: 0,
        visualReadyCount: 0,
        audioReadyCount: 0,
        browseReadyCount: 0,
        remainingCount: 1,
        nextBatchCount: 1,
        nextBatchTransferBytes: "2048",
        pendingTransferBytes: "2048",
        inventoryTruncated: false,
        captureDays: [
          {
            date: "2026-05-07",
            eligibleSourceCount: 1,
            browseReadyCount: 0,
            pendingTransferBytes: "2048",
          },
        ],
      },
    });
    await expect(
      prepareGoogleDriveLibraryNavigation({
        prisma,
        projectId,
        libraryId: library.id,
        actorUserId,
        actorEmail,
        clientRequestId,
        limit: 1,
      }),
    ).resolves.toMatchObject({
      summary: { selectedCount: 1, materializationCount: 1 },
    });
    await expect(
      prepareGoogleDriveLibraryNavigation({
        prisma,
        projectId,
        libraryId: library.id,
        actorUserId: otherUserId,
        actorEmail: `drive-materializer-other-${nonce}@example.test`,
        clientRequestId: randomUUID(),
        limit: 1,
      }),
    ).rejects.toMatchObject({
      code: "library-connection-owner-required",
      status: 403,
    } satisfies Partial<GoogleDriveLibraryNavigationError>);
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
    expect(initial.storage.executorTarget).not.toBeNull();
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
            custodianNodeId: initial.storage.executorTarget!.nodeId,
            storageScopeId: initial.storage.executorTarget!.storageScopeId,
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
