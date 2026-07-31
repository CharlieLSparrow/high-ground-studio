/** @jest-environment node */

jest.mock("@/lib/server/studio-project-access", () => {
  return {
    normalizeAccessEmail: (value?: string | null) => (value || "").trim().toLowerCase(),
    resolveStudioProjectAccess: jest.fn(),
  };
});

import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import {
  authorizeStudioMediaAsset,
  requireStudioMediaClipWriteAccess,
  requireStudioMediaProjectAccess,
} from "./studio-media-asset-access";

const resolveAccess = resolveStudioProjectAccess as jest.MockedFunction<typeof resolveStudioProjectAccess>;

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    isGlobal: false,
    projects: [{ id: "project-1", slug: "high-ground", name: "High Ground" }],
    mediaBin: null,
    assetAttachments: [],
    ...overrides,
  };
}

describe("Studio media asset access", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails before persistence without an authenticated actor", async () => {
    const findUnique = jest.fn();
    const result = await authorizeStudioMediaAsset({
      prisma: { studioMediaAsset: { findUnique } } as any,
      actorEmail: "",
      assetId: "asset-private",
    });
    expect(result).toMatchObject({ allowed: false, status: 401 });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the same unavailable boundary for missing and inaccessible IDs", async () => {
    const missing = await authorizeStudioMediaAsset({
      prisma: { studioMediaAsset: { findUnique: jest.fn().mockResolvedValue(null) } } as any,
      actorEmail: "actor@example.com",
      assetId: "missing",
    });
    resolveAccess.mockResolvedValue({ allowed: false, role: null, source: "none", projectId: "project-1", projectSlug: "high-ground" });
    const denied = await authorizeStudioMediaAsset({
      prisma: { studioMediaAsset: { findUnique: jest.fn().mockResolvedValue(asset()) } } as any,
      actorEmail: "actor@example.com",
      assetId: "asset-private",
    });
    expect(missing).toMatchObject({ allowed: false, status: 404, error: "This media record is unavailable." });
    expect(denied).toEqual(missing);
  });

  it("allows global reads but never treats global status as write authority", async () => {
    const prisma = {
      studioMediaAsset: {
        findUnique: jest.fn().mockResolvedValue(asset({
          isGlobal: true,
          projects: [],
        })),
      },
    } as any;
    const read = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: "actor@example.com",
      assetId: "asset-1",
      action: "read",
    });
    const write = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: "actor@example.com",
      assetId: "asset-1",
      action: "write",
    });
    expect(read).toMatchObject({ allowed: true, source: "global", canWrite: false });
    expect(write).toMatchObject({ allowed: false, status: 404 });
  });

  it("deduplicates direct, bin, and attachment scopes and reports write authority", async () => {
    resolveAccess.mockImplementation(async ({ projectSlug, action }) => ({
      allowed: projectSlug === "high-ground" || action === "read",
      role: projectSlug === "high-ground" ? "EDITOR" : "VIEWER",
      source: "grant",
      projectId: projectSlug === "high-ground" ? "project-1" : "project-2",
      projectSlug,
    }));
    const prisma = {
      studioMediaAsset: {
        findUnique: jest.fn().mockResolvedValue(asset({
          mediaBin: {
            project: { id: "project-1", slug: "high-ground", name: "High Ground" },
          },
          assetAttachments: [
            { project: { id: "project-2", slug: "coaching", name: "Coaching" } },
          ],
        })),
      },
    } as any;
    const result = await authorizeStudioMediaAsset({
      prisma,
      actorEmail: "actor@example.com",
      assetId: "asset-1",
    });
    expect(result).toMatchObject({
      allowed: true,
      readableProjectIds: ["project-1", "project-2"],
      writableProjectIds: ["project-1"],
      canWrite: true,
    });
    if (result.allowed) expect(result.scopes.map((scope) => scope.id)).toEqual(["project-1", "project-2"]);
  });

  it("rechecks the parent asset before returning a clip for mutation", async () => {
    resolveAccess.mockResolvedValue({ allowed: true, role: "OWNER", source: "grant", projectId: "project-1", projectSlug: "high-ground" });
    const prisma = {
      mediaClip: {
        findUnique: jest.fn().mockResolvedValue({
          id: "clip-1",
          mediaAssetId: "asset-1",
          inTimecode: 4,
          outTimecode: 8,
        }),
      },
      studioMediaAsset: { findUnique: jest.fn().mockResolvedValue(asset()) },
    } as any;
    const result = await requireStudioMediaClipWriteAccess({
      prisma,
      actorEmail: "actor@example.com",
      clipId: "clip-1",
    });
    expect(result.clip.mediaAssetId).toBe("asset-1");
    expect(result.access).toMatchObject({ allowed: true, canWrite: true });
  });

  it("requires destination-project authority independently of asset access", async () => {
    resolveAccess.mockResolvedValue({ allowed: false, role: "VIEWER", source: "grant", projectId: "project-2", projectSlug: "coaching" });
    const prisma = {
      studioProject: {
        findUnique: jest.fn().mockResolvedValue({ id: "project-2", slug: "coaching", name: "Coaching" }),
      },
    } as any;
    await expect(requireStudioMediaProjectAccess({
      prisma,
      actorEmail: "actor@example.com",
      projectId: "project-2",
      action: "write",
    })).rejects.toMatchObject({ status: 404, message: "This media record is unavailable." });
  });
});
