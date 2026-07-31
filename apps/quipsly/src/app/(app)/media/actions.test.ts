/** @jest-environment node */

const prisma = {
  studioTag: { findMany: jest.fn() },
  studioMediaTag: { findMany: jest.fn(), create: jest.fn(), upsert: jest.fn() },
  studioMediaAsset: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
  studioProject: { findUnique: jest.fn() },
  mediaClip: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  mediaBin: { findUnique: jest.fn(), create: jest.fn() },
};

const requireAssetAccess = jest.fn();
const requireClipWriteAccess = jest.fn();
const requireProjectAccess = jest.fn();
const actorEmail = jest.fn();
const ensureHomeNest = jest.fn();
const revalidatePath = jest.fn();

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: () => prisma,
}));
jest.mock("@/lib/server/home-nest", () => ({
  ensureCurrentActorHomeNest: (...args: unknown[]) => ensureHomeNest(...args),
  getCurrentHomeNestActorEmail: (...args: unknown[]) => actorEmail(...args),
}));
jest.mock("@/lib/server/studio-media-asset-access", () => ({
  requireStudioMediaAssetAccess: (...args: unknown[]) => requireAssetAccess(...args),
  requireStudioMediaClipWriteAccess: (...args: unknown[]) => requireClipWriteAccess(...args),
  requireStudioMediaProjectAccess: (...args: unknown[]) => requireProjectAccess(...args),
  StudioMediaAssetAccessError: class StudioMediaAssetAccessError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));
jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

import {
  attachAssetToProject,
  createMediaClip,
  deleteMediaClip,
  syncAssetMediaTags,
  updateMediaClip,
} from "./actions";

describe("Media Vault server-action authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    actorEmail.mockResolvedValue("actor@example.com");
    requireAssetAccess.mockResolvedValue({
      allowed: true,
      assetId: "asset-1",
      writableProjectIds: ["project-1"],
      readableProjectIds: ["project-1"],
      canWrite: true,
      scopes: [],
      isGlobal: false,
      source: "project",
    });
    requireProjectAccess.mockResolvedValue({
      project: { id: "project-1", slug: "high-ground", name: "High Ground" },
      access: { allowed: true, role: "EDITOR" },
    });
    prisma.studioMediaAsset.findUnique.mockResolvedValue({ duration: 120 });
    prisma.studioTag.findMany.mockResolvedValue([{ id: "tag-allowed" }]);
    prisma.mediaClip.create.mockResolvedValue({ id: "clip-1" });
    prisma.mediaClip.update.mockResolvedValue({ id: "clip-1" });
    prisma.mediaClip.delete.mockResolvedValue({ id: "clip-1" });
    prisma.studioMediaTag.findMany.mockResolvedValue([]);
    prisma.studioMediaAsset.update.mockResolvedValue({ id: "asset-1" });
  });

  it("rechecks asset write authority and restricts canonical tags to writable Nests", async () => {
    await createMediaClip("asset-1", "Opening", 4, 12, "Good beat", {
      studioTagIds: ["tag-allowed", "tag-other-nest"],
    });

    expect(requireAssetAccess).toHaveBeenCalledWith({
      prisma,
      actorEmail: "actor@example.com",
      assetId: "asset-1",
      action: "write",
    });
    expect(prisma.studioTag.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { projectId: { in: ["project-1"] } },
          { isActive: true },
          { OR: [{ id: { in: ["tag-allowed", "tag-other-nest"] } }] },
        ],
      },
      select: { id: true },
    });
    expect(prisma.mediaClip.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tags: { connect: [{ id: "tag-allowed" }] },
      }),
    }));
  });

  it("authorizes the parent asset before updating or deleting a clip", async () => {
    requireClipWriteAccess.mockResolvedValue({
      clip: {
        id: "clip-1",
        mediaAssetId: "asset-1",
        inTimecode: 4,
        outTimecode: 12,
      },
      access: {
        writableProjectIds: ["project-1"],
      },
    });

    await updateMediaClip("clip-1", { title: "Revised" });
    await deleteMediaClip("clip-1");

    expect(requireClipWriteAccess).toHaveBeenNthCalledWith(1, {
      prisma,
      actorEmail: "actor@example.com",
      clipId: "clip-1",
    });
    expect(requireClipWriteAccess).toHaveBeenNthCalledWith(2, {
      prisma,
      actorEmail: "actor@example.com",
      clipId: "clip-1",
    });
    expect(prisma.mediaClip.update).toHaveBeenCalled();
    expect(prisma.mediaClip.delete).toHaveBeenCalledWith({ where: { id: "clip-1" } });
  });

  it("requires both source-asset and destination-project write authority before attachment", async () => {
    await attachAssetToProject("asset-1", "project-1");
    expect(requireAssetAccess).toHaveBeenCalledWith({
      prisma,
      actorEmail: "actor@example.com",
      assetId: "asset-1",
      action: "write",
    });
    expect(requireProjectAccess).toHaveBeenCalledWith({
      prisma,
      actorEmail: "actor@example.com",
      projectId: "project-1",
      action: "write",
    });
    expect(prisma.studioMediaAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: {
        isGlobal: false,
        projects: { connect: { id: "project-1" } },
      },
    });
  });

  it("cannot change quick-review tags without asset write authority", async () => {
    requireAssetAccess.mockRejectedValueOnce(new Error("unavailable"));
    await expect(syncAssetMediaTags("asset-private", ["media-tag"], [])).rejects.toThrow("unavailable");
    expect(prisma.studioMediaAsset.update).not.toHaveBeenCalled();
  });
});
