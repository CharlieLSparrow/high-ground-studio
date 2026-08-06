/** @jest-environment node */

import { loadSessionVersionedOutputGraph } from "./session-versioned-output-graph-loader";

describe("Session versioned output graph loader", () => {
  it("uses canonical Nest attachment receipts and deduplicates repeated Session projections", async () => {
    const findAssets = jest.fn().mockResolvedValue([{
      id: "asset-1",
      variants: [],
      audioMasterPromotions: [],
      processingJobs: [],
      assetAttachments: [{ role: "primary-audio" }],
    }]);
    const prisma = {
      studioMediaAsset: { findMany: findAssets },
      studioEpisodeOutputSelectionReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const graph = await loadSessionVersionedOutputGraph({
      prisma,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episode: { id: "episode-9", slug: "episode-9", title: "Episode 9" },
      sources: [
        { recordingAssetId: "recording-1", mediaAssetId: "asset-1", sourceId: "source-1", label: "Phone audio" },
        { recordingAssetId: "recording-1-duplicate", mediaAssetId: "asset-1", sourceId: "source-1", label: "Duplicate projection" },
      ],
    });

    expect(findAssets).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["asset-1"] }, assetAttachments: { some: { projectId: "project-1" } } } }));
    expect(graph.counts.sources).toBe(1);
    expect(graph.assets[0]).toMatchObject({ mediaAssetId: "asset-1", attachmentRole: "primary-audio", masterState: "NOT_OBSERVED" });
  });
});
