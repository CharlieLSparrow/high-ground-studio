/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import {
  authorizeStudioMediaAsset,
  requireStudioMediaClipWriteAccess,
} from "./studio-media-asset-access";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runLocalDatabaseSmoke = process.env.QUIPSLY_LOCAL_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_LOCAL_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) {
    throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for the media-access smoke.");
  }
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runLocalDatabaseSmoke("Studio media asset access local database smoke", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  const editorEmail = `media-editor-${nonce}@example.test`;
  const viewerEmail = `media-viewer-${nonce}@example.test`;
  const outsiderEmail = `media-outsider-${nonce}@example.test`;
  let workspaceId = "";
  let projectId = "";
  let privateAssetId = "";
  let binnedAssetId = "";
  let attachedAssetId = "";
  let globalAssetId = "";
  let clipId = "";

  beforeAll(async () => {
    const [editor, viewer, outsider] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: editorEmail, name: "Media editor" } }),
      prisma.user.create({ data: { primaryEmail: viewerEmail, name: "Media viewer" } }),
      prisma.user.create({ data: { primaryEmail: outsiderEmail, name: "Media outsider" } }),
    ]);
    const workspace = await prisma.studioWorkspace.create({
      data: { slug: `media-access-${nonce}`, name: "Media access smoke" },
    });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({
      data: {
        workspaceId,
        slug: `media-project-${nonce}`,
        name: "Private media Nest",
      },
    });
    projectId = project.id;
    await prisma.studioProjectAccessGrant.createMany({
      data: [
        {
          projectId,
          email: editorEmail,
          role: "EDITOR",
          status: "ACTIVE",
          createdByUserId: editor.id,
          createdByEmail: editorEmail,
        },
        {
          projectId,
          email: viewerEmail,
          role: "VIEWER",
          status: "ACTIVE",
          createdByUserId: editor.id,
          createdByEmail: editorEmail,
        },
      ],
    });
    const mediaBin = await prisma.mediaBin.create({
      data: { projectId, name: "Access smoke bin" },
    });
    const [privateAsset, binnedAsset, attachmentAsset, globalAsset] = await Promise.all([
      prisma.studioMediaAsset.create({
        data: {
          filename: "private.mov",
          url: `/media-access/${nonce}/private`,
          projects: { connect: { id: projectId } },
          clips: {
            create: {
              title: "Private clip",
              inTimecode: 1,
              outTimecode: 3,
            },
          },
        },
        include: { clips: true },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "binned.mov",
          url: `/media-access/${nonce}/binned`,
          mediaBinId: mediaBin.id,
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "attached.mov",
          url: `/media-access/${nonce}/attached`,
          assetAttachments: {
            create: {
              projectId,
              role: "source",
              source: "media-access-smoke",
              createdByEmail: editorEmail,
            },
          },
        },
      }),
      prisma.studioMediaAsset.create({
        data: {
          filename: "global.mov",
          url: `/media-access/${nonce}/global`,
          isGlobal: true,
        },
      }),
    ]);
    privateAssetId = privateAsset.id;
    clipId = privateAsset.clips[0].id;
    binnedAssetId = binnedAsset.id;
    attachedAssetId = attachmentAsset.id;
    globalAssetId = globalAsset.id;
  });

  afterAll(async () => {
    try {
      if (workspaceId) {
        await prisma.studioMediaAsset.deleteMany({
          where: {
            id: {
              in: [privateAssetId, binnedAssetId, attachedAssetId, globalAssetId].filter(Boolean),
            },
          },
        });
        await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      }
      await prisma.user.deleteMany({
        where: {
          primaryEmail: { in: [editorEmail, viewerEmail, outsiderEmail] },
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("allows an editor to read and write every project-owned asset scope", async () => {
    for (const assetId of [privateAssetId, binnedAssetId, attachedAssetId]) {
      const access = await authorizeStudioMediaAsset({
        prisma,
        actorEmail: editorEmail,
        assetId,
        action: "write",
      });
      expect(access).toMatchObject({
        allowed: true,
        canWrite: true,
        writableProjectIds: [projectId],
      });
    }
  });

  it("allows viewer reads but denies viewer and outsider mutation without disclosure", async () => {
    const viewerRead = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: viewerEmail,
      assetId: privateAssetId,
      action: "read",
    });
    const viewerWrite = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: viewerEmail,
      assetId: privateAssetId,
      action: "write",
    });
    const outsiderRead = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: outsiderEmail,
      assetId: privateAssetId,
      action: "read",
    });
    const missingRead = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: outsiderEmail,
      assetId: "missing-media-asset",
      action: "read",
    });

    expect(viewerRead).toMatchObject({ allowed: true, canWrite: false });
    expect(viewerWrite).toMatchObject({ allowed: false, status: 404 });
    expect(outsiderRead).toEqual(missingRead);
    await expect(requireStudioMediaClipWriteAccess({
      prisma,
      actorEmail: viewerEmail,
      clipId,
    })).rejects.toMatchObject({
      status: 404,
      message: "This media record is unavailable.",
    });
  });

  it("keeps shared global assets readable but read-only without a writable Nest scope", async () => {
    const read = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: outsiderEmail,
      assetId: globalAssetId,
      action: "read",
    });
    const write = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: editorEmail,
      assetId: globalAssetId,
      action: "write",
    });
    expect(read).toMatchObject({
      allowed: true,
      source: "global",
      canWrite: false,
    });
    expect(write).toMatchObject({ allowed: false, status: 404 });
  });
});
