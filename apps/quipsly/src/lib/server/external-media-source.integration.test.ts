/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  attachVerifiedExternalMediaSource,
  ExternalMediaConflictError,
} from "./external-media-source";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke =
  process.env.QUIPSLY_EXTERNAL_MEDIA_DB_SMOKE === "1"
    ? describe
    : describe.skip;
if (process.env.QUIPSLY_EXTERNAL_MEDIA_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL)
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for external media proof.",
    );
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("external media attach and capability history", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const actorEmail = `external-media-${nonce}@example.test`;
  let actorUserId = "";
  let workspaceId = "";
  let projectId = "";
  let otherProjectId = "";
  let referenceId = "";

  function file(overrides: Record<string, unknown> = {}) {
    return {
      provider: "google-drive",
      connectionKey: `drive:${nonce}`,
      externalFileId: `homer-insta360-${nonce}`,
      sharedDriveId: `shared-${nonce}`,
      resourceKey: `resource-${nonce}`,
      fileName: "Homer Insta360 source.insv",
      mimeType: "video/mp4",
      sizeBytes: "4200000000",
      headRevisionKey: "drive-revision-1",
      checksumMd5: "a".repeat(32),
      providerCreatedAt: "2026-08-01T10:00:00.000Z",
      providerModifiedAt: "2026-08-07T10:00:00.000Z",
      accessState: "available" as const,
      capabilityState: "downloadable" as const,
      canDownload: true,
      canReadRevisions: true,
      canCopy: false,
      ...overrides,
    };
  }

  beforeAll(async () => {
    const actor = await prisma.user.create({
      data: { primaryEmail: actorEmail, name: "External media operator" },
    });
    actorUserId = actor.id;
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `external-media-${nonce}`, name: "External media smoke" },
    });
    workspaceId = workspace.id;
    const [project, other] = await Promise.all([
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: `external-main-${nonce}`,
          name: "High Ground Odyssey",
        },
      }),
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: `external-other-${nonce}`,
          name: "Other Nest",
        },
      }),
    ]);
    projectId = project.id;
    otherProjectId = other.id;
  });

  afterAll(async () => {
    try {
      if (projectId)
        await prisma.studioMediaSourceSet.deleteMany({ where: { projectId } });
      if (workspaceId)
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      if (actorUserId)
        await prisma.user.deleteMany({ where: { id: actorUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("attaches one provider-verified file idempotently with no credential in durable snapshots", async () => {
    const clientRequestId = randomUUID();
    const value = {
      projectId,
      actorUserId,
      actorEmail,
      clientRequestId,
      operation: "attach" as const,
      verifiedFile: file(),
    };
    const attached = await attachVerifiedExternalMediaSource({ prisma, value });
    referenceId = attached.reference.id;
    expect(attached).toMatchObject({
      replayed: false,
      reference: {
        revision: 1,
        accessState: "available",
        capabilityState: "downloadable",
      },
    });
    await expect(
      attachVerifiedExternalMediaSource({ prisma, value }),
    ).resolves.toMatchObject({
      replayed: true,
      reference: { id: referenceId, revision: 1 },
    });
    await expect(
      attachVerifiedExternalMediaSource({
        prisma,
        value: {
          ...value,
          verifiedFile: file({ externalFileId: `different-${nonce}` }),
        },
      }),
    ).rejects.toMatchObject({
      code: "request-reuse-conflict",
      currentRevision: 1,
    } satisfies Partial<ExternalMediaConflictError>);

    const [reference, revision, operation] = await Promise.all([
      prisma.studioExternalMediaReference.findUniqueOrThrow({
        where: { id: referenceId },
      }),
      prisma.studioMediaSourceRevision.findFirstOrThrow({
        where: { externalReferenceId: referenceId },
      }),
      prisma.studioExternalMediaReferenceOperation.findFirstOrThrow({
        where: { referenceId },
      }),
    ]);
    expect(reference.providerLocatorJson).toMatchObject({
      externalFileId: file().externalFileId,
      resourceKey: file().resourceKey,
    });
    expect(revision).toMatchObject({
      revisionKey: "drive-revision-1",
      sourceState: "provider-revision-bound",
      contentSha256: null,
      sizeBytes: BigInt(4_200_000_000),
    });
    const serializedReceipt = JSON.stringify(operation.snapshotJson);
    expect(serializedReceipt).not.toMatch(
      /resource-key|access.?token|refresh.?token|authorization|credential/i,
    );
    expect(operation).toMatchObject({
      revision: 1,
      previousRevision: 0,
      operation: "attach",
    });
  });

  it("records a repeated provider observation without manufacturing a new state revision", async () => {
    const observed = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "refresh",
        expectedReferenceRevision: 1,
        verifiedFile: file(),
      },
    });
    expect(observed).toMatchObject({
      replayed: false,
      reference: { id: referenceId, revision: 1 },
    });
    await expect(
      prisma.studioExternalMediaReferenceOperation.findMany({
        where: { referenceId },
        orderBy: { createdAt: "asc" },
        select: { revision: true, previousRevision: true, operation: true },
      }),
    ).resolves.toEqual([
      { revision: 1, previousRevision: 0, operation: "attach" },
      { revision: 1, previousRevision: 1, operation: "observe" },
    ]);
  });

  it("creates a new immutable revision on provider change and refuses stale refresh", async () => {
    const refreshed = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "refresh",
        expectedReferenceRevision: 1,
        verifiedFile: file({
          headRevisionKey: "drive-revision-2",
          checksumMd5: "b".repeat(32),
          sizeBytes: "4200000100",
          providerModifiedAt: "2026-08-07T12:00:00.000Z",
        }),
      },
    });
    expect(refreshed).toMatchObject({
      replayed: false,
      reference: {
        id: referenceId,
        revision: 2,
        headRevisionKey: "drive-revision-2",
      },
    });
    await expect(
      attachVerifiedExternalMediaSource({
        prisma,
        value: {
          projectId,
          actorUserId,
          actorEmail,
          clientRequestId: randomUUID(),
          operation: "refresh",
          expectedReferenceRevision: 1,
          verifiedFile: file({ headRevisionKey: "drive-revision-3" }),
        },
      }),
    ).rejects.toMatchObject({ code: "stale-reference", currentRevision: 2 });
    await expect(
      prisma.studioMediaSourceRevision.findMany({
        where: { externalReferenceId: referenceId },
        orderBy: { createdAt: "asc" },
        select: { revisionKey: true },
      }),
    ).resolves.toEqual([
      { revisionKey: "drive-revision-1" },
      { revisionKey: "drive-revision-2" },
    ]);
  });

  it("records revoked capability without rewriting content identity", async () => {
    const result = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "refresh",
        expectedReferenceRevision: 2,
        verifiedFile: file({
          headRevisionKey: "drive-revision-2",
          checksumMd5: "b".repeat(32),
          sizeBytes: "4200000100",
          providerModifiedAt: "2026-08-07T12:00:00.000Z",
          accessState: "revoked",
          capabilityState: "needs-reauth",
          canDownload: false,
          canReadRevisions: false,
          downloadRestrictionReason: "provider authorization revoked",
        }),
      },
    });
    expect(result.reference).toMatchObject({
      revision: 3,
      accessState: "revoked",
      capabilityState: "needs-reauth",
    });
    await expect(
      prisma.studioMediaSourceRevision.count({
        where: { externalReferenceId: referenceId },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.studioExternalMediaReferenceOperation.findMany({
        where: { referenceId },
        orderBy: { revision: "asc" },
        select: { revision: true, previousRevision: true, operation: true },
      }),
    ).resolves.toEqual([
      { revision: 1, previousRevision: 0, operation: "attach" },
      { revision: 1, previousRevision: 1, operation: "observe" },
      { revision: 2, previousRevision: 1, operation: "refresh" },
      { revision: 3, previousRevision: 2, operation: "refresh" },
    ]);
  });

  it("fails closed when a provider reuses one revision key for different byte evidence", async () => {
    await expect(
      attachVerifiedExternalMediaSource({
        prisma,
        value: {
          projectId,
          actorUserId,
          actorEmail,
          clientRequestId: randomUUID(),
          operation: "refresh",
          expectedReferenceRevision: 3,
          verifiedFile: file({
            headRevisionKey: "drive-revision-2",
            checksumMd5: "c".repeat(32),
            sizeBytes: "999",
            providerModifiedAt: "2026-08-07T13:00:00.000Z",
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "provider-revision-conflict" });
    await expect(
      prisma.studioExternalMediaReference.findUnique({
        where: { id: referenceId },
        select: { revision: true, accessState: true },
      }),
    ).resolves.toEqual({ revision: 3, accessState: "revoked" });
    await expect(
      prisma.studioExternalMediaReferenceOperation.count({
        where: { referenceId },
      }),
    ).resolves.toBe(4);
  });

  it("retains a metadata-enriched observation of the same provider byte revision", async () => {
    const metadataFile = file({
      externalFileId: `metadata-enrichment-${nonce}`,
      fileName: "LRV_20260402_080506_01_004.lrv",
      sizeBytes: "102420828",
      headRevisionKey: "drive-metadata-revision-1",
      checksumMd5: "d".repeat(32),
      durationSeconds: null,
      widthPixels: null,
      heightPixels: null,
      mediaProjection: "dual-fisheye",
      projectionMetadata: {
        schema: "quipsly-insta360-drive-member-v1",
        stitched: false,
      },
    });
    const attached = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: metadataFile,
      },
    });
    await prisma.studioMediaSourceSet.create({
      data: {
        projectId,
        kind: "insta360-360",
        captureKey: `metadata-enrichment-${nonce}`,
        displayName: "Metadata enrichment source-set proof",
        identitySha256: "9".repeat(64),
        sourceClockRevisionId: attached.sourceRevisionId,
        clientRequestId: randomUUID(),
        createdByUserId: actorUserId,
        members: {
          create: {
            sourceRevisionId: attached.sourceRevisionId,
            role: "browse-proxy",
            ordinal: 0,
            requiredForRender: false,
            memberIdentitySha256: "8".repeat(64),
          },
        },
      },
    });
    const enriched = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "refresh",
        expectedReferenceRevision: attached.reference.revision,
        verifiedFile: {
          ...metadataFile,
          durationSeconds: 81.76,
          widthPixels: 1664,
          heightPixels: 832,
        },
      },
    });
    expect(enriched.reference.revision).toBe(attached.reference.revision);
    expect(enriched.sourceRevisionId).not.toBe(attached.sourceRevisionId);
    expect(enriched.canonicalSourceRevisionId).toBe(attached.sourceRevisionId);
    await expect(
      prisma.studioMediaSourceRevision.findMany({
        where: { externalReferenceId: attached.reference.id },
        orderBy: { createdAt: "asc" },
        select: { revisionKey: true, verificationJson: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        revisionKey: "drive-metadata-revision-1",
      }),
      expect.objectContaining({
        revisionKey: expect.stringMatching(
          /^drive-metadata-revision-1:metadata:[0-9a-f]{24}$/,
        ),
        verificationJson: expect.objectContaining({
          providerMetadataVariant: true,
          providerRevisionKey: "drive-metadata-revision-1",
        }),
      }),
    ]);
  });

  it("keeps an identical external file identity isolated between Nests", async () => {
    const attached = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId: otherProjectId,
        actorUserId,
        actorEmail,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: file(),
      },
    });
    expect(attached.reference.id).not.toBe(referenceId);
    await expect(
      prisma.studioExternalMediaReference.count({
        where: {
          provider: "google-drive",
          externalFileId: file().externalFileId,
        },
      }),
    ).resolves.toBe(2);
  });

  it("binds a provider file to its project-owned package unit and rejects cross-package reassignment", async () => {
    const [sourceUnit, otherSourceUnit] = await Promise.all([
      prisma.studioSourceUnit.create({
        data: {
          projectId,
          slug: `drive-package-${nonce}`,
          kind: "insta360-drive-segment",
          title: "Drive package",
        },
      }),
      prisma.studioSourceUnit.create({
        data: {
          projectId,
          slug: `drive-package-other-${nonce}`,
          kind: "insta360-drive-segment",
          title: "Other Drive package",
        },
      }),
    ]);
    const packageFile = file({
      externalFileId: `package-member-${nonce}`,
      fileName: "LRV_20260402_080506_01_001.lrv",
    });
    const attached = await attachVerifiedExternalMediaSource({
      prisma,
      value: {
        projectId,
        actorUserId,
        actorEmail,
        sourceUnitId: sourceUnit.id,
        clientRequestId: randomUUID(),
        operation: "attach",
        verifiedFile: packageFile,
      },
    });
    expect(attached.reference.sourceUnitId).toBe(sourceUnit.id);
    await expect(
      prisma.studioMediaSourceRevision.findFirstOrThrow({
        where: { externalReferenceId: attached.reference.id },
        select: { sourceUnitId: true },
      }),
    ).resolves.toEqual({ sourceUnitId: sourceUnit.id });
    await expect(
      attachVerifiedExternalMediaSource({
        prisma,
        value: {
          projectId,
          actorUserId,
          actorEmail,
          sourceUnitId: otherSourceUnit.id,
          clientRequestId: randomUUID(),
          operation: "attach",
          verifiedFile: packageFile,
        },
      }),
    ).rejects.toMatchObject({ code: "source-unit-conflict" });
  });
});
