/** @jest-environment node */

const findUnique = jest.fn();
const requireAssetAccess = jest.fn();
const actorEmail = jest.fn();

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: () => ({
    studioMediaAsset: { findUnique },
  }),
}));
jest.mock("@/lib/server/home-nest", () => ({
  getCurrentHomeNestActorEmail: (...args: unknown[]) => actorEmail(...args),
}));
jest.mock("@/lib/server/studio-media-asset-access", () => ({
  requireStudioMediaAssetAccess: (...args: unknown[]) => requireAssetAccess(...args),
}));

import { generateStudioCutPackage } from "./export-actions";

describe("Studio Cut export authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    actorEmail.mockResolvedValue("actor@example.com");
    requireAssetAccess.mockResolvedValue({ allowed: true });
    findUnique.mockResolvedValue({
      id: "asset-1",
      filename: "episode.mov",
      url: "/private/source",
      projects: [{ id: "project-1" }],
      clips: [],
    });
  });

  it("rechecks asset write authority before materializing an export", async () => {
    const payload = await generateStudioCutPackage("asset-1");
    expect(requireAssetAccess).toHaveBeenCalledWith(expect.objectContaining({
      actorEmail: "actor@example.com",
      assetId: "asset-1",
      action: "write",
    }));
    expect(findUnique).toHaveBeenCalled();
    expect(payload.sourceAsset.id).toBe("asset-1");
  });

  it("does not query asset bytes or metadata after denial", async () => {
    requireAssetAccess.mockRejectedValueOnce(new Error("unavailable"));
    await expect(generateStudioCutPackage("asset-private")).rejects.toThrow("unavailable");
    expect(findUnique).not.toHaveBeenCalled();
  });
});
