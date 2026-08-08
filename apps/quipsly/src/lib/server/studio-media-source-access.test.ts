/** @jest-environment node */

import { mobileCaptureMediaProcessingGate } from "@/lib/server/mobile-capture-processing-gates";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import { authorizeStudioMediaSource } from "./studio-media-source-access";

jest.mock("server-only", () => ({}));
jest.mock("@/lib/server/mobile-capture-processing-gates", () => ({ mobileCaptureMediaProcessingGate: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({ resolveStudioProjectAccess: jest.fn() }));

const actor = { id: "editor_001", email: "editor@example.test", isStaff: false };
const derivedSource = {
  id: "source_mastered_001",
  provider: "local-audio-mastery-worker",
  providerSourceId: "/tmp/quipsly-media-ingest/master.wav",
  url: "/api/ingest/media/source_mastered_001",
  title: "Mastered preview",
};
const rawSource = {
  id: "source_raw_001",
  provider: "local",
  providerSourceId: "/tmp/quipsly-media-ingest/raw.wav",
  url: "/api/ingest/media/source_raw_001",
  title: "Raw source",
};
const proofSource = {
  id: "source_episode_proof_001",
  provider: "local-episode-render-proof-worker",
  providerSourceId: "/tmp/quipsly-media-ingest/proof.mp4",
  url: "/api/ingest/media/source_episode_proof_001",
  title: "Episode edit proof",
};
const programSource = {
  id: "source_episode_program_001",
  provider: "local-episode-program-render-worker",
  providerSourceId: "/tmp/quipsly-media-ingest/program.mp4",
  url: "/api/ingest/media/source_episode_program_001",
  title: "Episode program review",
};
const ownerAsset = {
  id: "asset_raw_001",
  isGlobal: false,
  isProxy: false,
  rawAssetId: null,
  url: rawSource.url,
  projects: [],
  assetAttachments: [{ metadataJson: {}, project: { slug: "high-ground-odyssey" } }],
};

function prismaForVariant(options: {
  heldRaw?: boolean;
  proofMetadata?: Record<string, unknown>;
  programMetadata?: Record<string, unknown>;
} = {}) {
  const proofOwnerAsset = {
    ...ownerAsset,
    id: "asset_episode_proof_001",
    url: proofSource.url,
    assetAttachments: [{
      metadataJson: options.proofMetadata ?? {},
      project: { slug: "high-ground-odyssey" },
    }],
  };
  const programOwnerAsset = {
    ...ownerAsset,
    id: "asset_episode_program_001",
    url: programSource.url,
    assetAttachments: [{
      metadataJson: options.programMetadata ?? {},
      project: { slug: "high-ground-odyssey" },
    }],
  };
  return {
    studioVideoSource: {
      findUnique: jest.fn(async ({ where }: any) => where.id === derivedSource.id
        ? derivedSource
        : where.id === rawSource.id
          ? rawSource
          : where.id === proofSource.id
            ? proofSource
            : where.id === programSource.id
              ? programSource
            : null),
    },
    studioMediaAsset: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
    },
    studioAssetVariant: {
      findMany: jest.fn(async ({ where }: any) => where.url === derivedSource.url
        ? [{ asset: ownerAsset }]
        : where.url === proofSource.url
          ? [{ asset: proofOwnerAsset }]
          : where.url === programSource.url
            ? [{ asset: programOwnerAsset }]
          : []),
    },
    mobileCaptureFinalizationReceipt: {
      findMany: jest.fn(async ({ where }: any) => options.heldRaw && where.sourceId === rawSource.id
        ? [{
            recordingAssetId: "recording_raw_001",
            processingDisposition: "HELD",
            holdReasonCode: "CAPTURE_OWNER_REVIEW_REQUIRED",
            holdReason: "Owner review is still required.",
          }]
        : []),
    },
    recordingAsset: {
      findMany: jest.fn(async () => []),
      findUnique: jest.fn(async () => null),
    },
  };
}

describe("studio media variant authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true } as never);
  });

  it("inherits project scope from the owning asset instead of exposing an unscoped derivative", async () => {
    const prisma = prismaForVariant();
    const result = await authorizeStudioMediaSource({ prisma, actor, sourceId: derivedSource.id });
    expect(result).toMatchObject({ allowed: true, source: { id: derivedSource.id } });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith(expect.objectContaining({
      projectSlug: "high-ground-odyssey",
      email: actor.email,
      action: "read",
    }));
    expect(mobileCaptureMediaProcessingGate).not.toHaveBeenCalled();
  });

  it("fails closed for an outsider even when the derivative bytes exist", async () => {
    const prisma = prismaForVariant();
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: false } as never);
    const result = await authorizeStudioMediaSource({ prisma, actor, sourceId: derivedSource.id });
    expect(result).toMatchObject({ allowed: false, status: 404 });
  });

  it("inherits a Capture hold from the owning raw source", async () => {
    const prisma = prismaForVariant({ heldRaw: true });
    const result = await authorizeStudioMediaSource({ prisma, actor, sourceId: derivedSource.id });
    expect(result).toMatchObject({
      allowed: false,
      status: 409,
      errorCode: "CAPTURE_OWNER_REVIEW_REQUIRED",
      error: "Owner review is still required.",
    });
    expect(mobileCaptureMediaProcessingGate).not.toHaveBeenCalled();
  });

  it("holds a local Episode proof that has no executor custody receipt", async () => {
    const result = await authorizeStudioMediaSource({
      prisma: prismaForVariant(),
      actor,
      sourceId: proofSource.id,
    });
    expect(result).toMatchObject({
      allowed: false,
      status: 409,
      errorCode: "LOCAL_ARTIFACT_CUSTODY_REQUIRED",
    });
  });

  it("returns the exact executor authority for a registered local Episode proof", async () => {
    const result = await authorizeStudioMediaSource({
      prisma: prismaForVariant({
        proofMetadata: {
          schema: "quipsly-episode-render-proof-registration-v2",
          artifactPortability: "executor-local",
          custodianNodeId: "execution_worker_render_test",
          storageScopeId: "storage_scope_render_test",
        },
      }),
      actor,
      sourceId: proofSource.id,
    });
    expect(result).toMatchObject({
      allowed: true,
      source: {
        id: proofSource.id,
        localArtifactAuthority: {
          portability: "executor-local",
          custodianNodeId: "execution_worker_render_test",
          storageScopeId: "storage_scope_render_test",
        },
      },
    });
  });

  it("returns exact custody for a registered full-program review", async () => {
    const result = await authorizeStudioMediaSource({
      prisma: prismaForVariant({
        programMetadata: {
          schema: "quipsly-episode-program-render-registration-v1",
          artifactPortability: "executor-local",
          custodianNodeId: "execution_worker_program_test",
          storageScopeId: "storage_scope_program_test",
        },
      }),
      actor,
      sourceId: programSource.id,
    });
    expect(result).toMatchObject({
      allowed: true,
      source: {
        id: programSource.id,
        localArtifactAuthority: {
          portability: "executor-local",
          custodianNodeId: "execution_worker_program_test",
          storageScopeId: "storage_scope_program_test",
        },
      },
    });
  });

  it("holds a full-program review with conflicting executor receipts", async () => {
    const prisma = prismaForVariant({
      programMetadata: {
        schema: "quipsly-episode-program-render-registration-v1",
        artifactPortability: "executor-local",
        custodianNodeId: "execution_worker_program_test",
        storageScopeId: "storage_scope_program_test",
      },
    });
    prisma.studioAssetVariant.findMany.mockResolvedValue([{
      asset: {
        ...ownerAsset,
        id: "asset_episode_program_conflict",
        url: programSource.url,
        assetAttachments: [{
          metadataJson: {
            schema: "quipsly-episode-program-render-registration-v1",
            artifactPortability: "executor-local",
            custodianNodeId: "execution_worker_other_test",
            storageScopeId: "storage_scope_other_test",
          },
          project: { slug: "high-ground-odyssey" },
        }, {
          metadataJson: {
            schema: "quipsly-episode-program-render-registration-v1",
            artifactPortability: "executor-local",
            custodianNodeId: "execution_worker_program_test",
            storageScopeId: "storage_scope_program_test",
          },
          project: { slug: "high-ground-odyssey" },
        }],
      },
    }]);

    await expect(authorizeStudioMediaSource({ prisma, actor, sourceId: programSource.id }))
      .resolves.toMatchObject({
        allowed: false,
        status: 409,
        errorCode: "LOCAL_ARTIFACT_CUSTODY_REQUIRED",
      });
  });
});
