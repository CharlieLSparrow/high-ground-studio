/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  EpisodeRoomCommandError,
  applyEpisodeRoomStoreCommand,
  loadEpisodeRoomVault,
} from "./episode-room-store";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke =
  process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error(
      "QUIPSLY_LOCAL_DATABASE_URL is required for the Episode Room Media Vault smoke.",
    );
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Episode Room Media Vault local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const projectSlug = `episode-vault-${nonce}`;
  const foreignProjectSlug = `episode-vault-foreign-${nonce}`;
  const episodeSlug = "durable-watch-qa";
  const editorEmail = `episode-vault-editor-${nonce}@example.test`;
  let workspaceId = "";
  let projectId = "";
  let savedClipId = "";
  const assetIds: string[] = [];

  beforeAll(async () => {
    const editor = await prisma.user.create({
      data: {
        primaryEmail: editorEmail,
        name: "Episode Vault QA editor",
      },
    });
    const workspace = await prisma.studioWorkspace.create({
      data: {
        slug: `episode-vault-workspace-${nonce}`,
        name: "Episode Vault QA",
      },
    });
    workspaceId = workspace.id;
    const [project, foreignProject] = await Promise.all([
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: projectSlug,
          name: "Episode Vault QA Nest",
        },
      }),
      prisma.studioProject.create({
        data: {
          workspaceId,
          slug: foreignProjectSlug,
          name: "Foreign QA Nest",
        },
      }),
    ]);
    projectId = project.id;
    await prisma.studioProjectAccessGrant.create({
      data: {
        projectId,
        email: editorEmail,
        role: "EDITOR",
        status: "ACTIVE",
        createdByUserId: editor.id,
        createdByEmail: editorEmail,
      },
    });
    const document = await prisma.studioDocument.create({
      data: {
        projectId,
        stableId: `episode-vault-document-${nonce}`,
        title: "Durable Watch QA",
      },
    });
    await prisma.studioEpisodeProduction.create({
      data: {
        projectId,
        documentId: document.id,
        slug: episodeSlug,
        title: "Durable Watch QA",
        boundaryLabel: "Durable Watch QA",
        productionJson: {},
      },
    });
    const mediaBin = await prisma.mediaBin.create({
      data: {
        projectId,
        name: "Episode Vault QA bin",
      },
    });
    const [direct, binned, attached, foreign, global] = await Promise.all([
      prisma.studioMediaAsset.create({
        data: {
          filename: "direct-source.mp4",
          url: `/qa/${nonce}/direct-source.mp4`,
          mimeType: "video/mp4",
          duration: 42,
          projects: { connect: { id: projectId } },
          clips: {
            create: {
              title: "Durable curiosity range",
              inTimecode: 4,
              outTimecode: 12,
            },
          },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "binned-source.wav",
          url: `/qa/${nonce}/binned-source.wav`,
          mimeType: "audio/wav",
          mediaBinId: mediaBin.id,
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "attached-source.mp4",
          url: `/qa/${nonce}/attached-source.mp4`,
          mimeType: "video/mp4",
          assetAttachments: {
            create: {
              projectId,
              role: "reference-clip",
              source: "episode-room-media-vault-smoke",
              createdByEmail: editorEmail,
            },
          },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "foreign-source.mp4",
          url: `/qa/${nonce}/foreign-source.mp4`,
          mimeType: "video/mp4",
          projects: { connect: { id: foreignProject.id } },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "unscoped-global.mp4",
          url: `/qa/${nonce}/unscoped-global.mp4`,
          mimeType: "video/mp4",
          isGlobal: true,
        },
      }),
    ]);
    assetIds.push(direct.id, binned.id, attached.id, foreign.id, global.id);
    savedClipId = (await prisma.mediaClip.findFirstOrThrow({
      where: { mediaAssetId: direct.id },
      select: { id: true },
    })).id;
  });

  afterAll(async () => {
    try {
      await prisma.studioMediaAsset.deleteMany({
        where: { id: { in: assetIds } },
      });
      if (workspaceId) {
        await prisma.studioWorkspace.delete({
          where: { id: workspaceId },
        });
      }
      await prisma.user.deleteMany({
        where: { primaryEmail: editorEmail },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("projects direct, binned, and attached sources but not foreign or unscoped global media", async () => {
    const candidates = await loadEpisodeRoomVault(projectSlug, episodeSlug);
    expect(candidates?.map((candidate) => candidate.title).sort()).toEqual([
      "attached-source.mp4",
      "binned-source.wav",
      "direct-source.mp4",
    ]);
    expect(candidates?.find((candidate) => (
      candidate.title === "direct-source.mp4"
    ))).toMatchObject({
      savedClipCount: 1,
      savedClipTitles: ["Durable curiosity range"],
      savedClips: [{
        mediaClipId: savedClipId,
        watchId: `media-vault-clip:${savedClipId}`,
        rangeStartSeconds: 4,
        rangeEndSeconds: 12,
        durationSeconds: 8,
        attached: false,
      }],
      imported: false,
      attached: false,
    });
  });

  it("atomically references one existing source, adds it to Watch, and deduplicates retries", async () => {
    const directAssetId = assetIds[0];
    const actor = {
      userId: "episode-vault-qa-editor",
      email: editorEmail,
      label: "Episode Vault QA editor",
    };
    const input = {
      type: "IMPORT_VAULT_ASSET" as const,
      assetId: directAssetId,
      clientRequestId: `episode-vault-import-${nonce}`,
      expectedRevision: 0,
    };
    const first = await applyEpisodeRoomStoreCommand({
      projectSlug,
      episodeSlug,
      input,
      actor,
    });
    const retry = await applyEpisodeRoomStoreCommand({
      projectSlug,
      episodeSlug,
      input,
      actor,
    });
    const production = await prisma.studioEpisodeProduction.findUniqueOrThrow({
      where: {
        projectId_slug: {
          projectId,
          slug: episodeSlug,
        },
      },
      select: { productionJson: true },
    });
    const productionJson = production.productionJson as Record<string, any>;

    expect(first.room).toMatchObject({
      revision: 1,
      selectedClipId: directAssetId,
      clips: [{
        assetId: directAssetId,
        title: "direct-source.mp4",
      }],
    });
    expect(retry.room.revision).toBe(1);
    expect(productionJson.importedMedia).toHaveLength(1);
    expect(productionJson.importedMedia[0]).toMatchObject({
      id: directAssetId,
      source: "media-vault-existing",
      metadata: {
        mediaVault: {
          originalPreserved: true,
        },
      },
    });
  });

  it("adds an exact saved range without duplicating its preserved source", async () => {
    const directAssetId = assetIds[0];
    const input = {
      type: "IMPORT_VAULT_ASSET" as const,
      assetId: directAssetId,
      mediaClipId: savedClipId,
      clientRequestId: `episode-vault-range-${nonce}`,
      expectedRevision: 1,
    };
    const first = await applyEpisodeRoomStoreCommand({
      projectSlug,
      episodeSlug,
      input,
      actor: {
        email: editorEmail,
        label: "Episode Vault QA editor",
      },
    });
    const retry = await applyEpisodeRoomStoreCommand({
      projectSlug,
      episodeSlug,
      input,
      actor: {
        email: editorEmail,
        label: "Episode Vault QA editor",
      },
    });
    const production = await prisma.studioEpisodeProduction.findUniqueOrThrow({
      where: {
        projectId_slug: {
          projectId,
          slug: episodeSlug,
        },
      },
      select: { productionJson: true },
    });
    const productionJson = production.productionJson as Record<string, any>;

    expect(first.room.revision).toBe(2);
    expect(first.room.clips).toContainEqual(expect.objectContaining({
      watchId: `media-vault-clip:${savedClipId}`,
      assetId: directAssetId,
      title: "Durable curiosity range",
      rangeStartSeconds: 4,
      rangeEndSeconds: 12,
    }));
    expect(retry.room.revision).toBe(2);
    expect(productionJson.importedMedia).toHaveLength(1);
    expect(productionJson.episodeRoom.clips).toHaveLength(2);
  });

  it("does not disclose or attach an asset from another Nest", async () => {
    await expect(applyEpisodeRoomStoreCommand({
      projectSlug,
      episodeSlug,
      input: {
        type: "IMPORT_VAULT_ASSET",
        assetId: assetIds[3],
        clientRequestId: `episode-vault-foreign-${nonce}`,
        expectedRevision: 2,
      },
      actor: {
        email: editorEmail,
        label: "Episode Vault QA editor",
      },
    })).rejects.toEqual(
      new EpisodeRoomCommandError(
        "This Media Vault item is unavailable in this Nest.",
      ),
    );
  });
});
