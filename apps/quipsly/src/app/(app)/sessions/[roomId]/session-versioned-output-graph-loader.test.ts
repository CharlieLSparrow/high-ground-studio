/** @jest-environment node */

import { loadSessionVersionedOutputGraph } from "./session-versioned-output-graph-loader";
import { createHash } from "node:crypto";

function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

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
      studioMediaAsset: { findMany: findAssets, findFirst: jest.fn() },
      studioEpisodeOutputSelectionReceipt: { findMany: jest.fn().mockResolvedValue([]) },
      studioEpisodeAudioMixPromotionReceipt: { findMany: jest.fn().mockResolvedValue([]) },
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

  it("binds the latest program promotion to the exact registered mix bytes", async () => {
    const previewSha = "f".repeat(64);
    const fingerprint = "d".repeat(64);
    const baselineSha = "c".repeat(64);
    const proposal = { programFingerprintSha256: fingerprint, tracks: [{ assetId: "one" }, { assetId: "two" }] };
    const proposalSha = createHash("sha256").update(stableJson(proposal)).digest("hex");
    const prisma = {
      studioMediaAsset: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: "episode-mix-asset-1",
          url: "/api/ingest/media/mix-source-1",
          assetAttachments: [{ source: "episode-audio-mix-registration", metadataJson: { episodeProductionId: "episode-9", mixJobId: "mix-job-1", playbackUrl: "/api/ingest/media/mix-source-1", output: { sha256: previewSha } } }],
        }),
      },
      studioEpisodeOutputSelectionReceipt: { findMany: jest.fn().mockResolvedValue([]) },
      studioEpisodeAudioMixPromotionReceipt: { findMany: jest.fn().mockResolvedValue([{
        id: "mix-promotion-1",
        episodeProductionId: "episode-9",
        mixJobId: "mix-job-1",
        reviewReceiptId: "mix-review-1",
        operation: "PROMOTE",
        programFingerprintSha256: fingerprint,
        proposalSha256: proposalSha,
        baselineSha256: baselineSha,
        previewSha256: previewSha,
        evidenceJson: {},
        occurredAt: new Date("2026-08-06T22:30:00.000Z"),
        mixJob: {
          id: "mix-job-1",
          status: "completed",
          inputJson: proposal,
          resultJson: {
            receipt: { derivative: { assetId: "episode-mix-asset-1", sha256: previewSha }, baselineDerivative: { sha256: baselineSha } },
            registration: { outputAssetId: "episode-mix-asset-1", playbackUrl: "/api/ingest/media/mix-source-1" },
          },
        },
        reviewReceipt: {
          id: "mix-review-1",
          mixJobId: "mix-job-1",
          decision: "APPROVED",
          programFingerprintSha256: fingerprint,
          proposalSha256: proposalSha,
          baselineSha256: baselineSha,
          previewSha256: previewSha,
        },
      }]) },
    };

    const graph = await loadSessionVersionedOutputGraph({
      prisma,
      projectId: "project-1",
      projectSlug: "high-ground-odyssey",
      episode: { id: "episode-9", slug: "episode-9", title: "Episode 9" },
      sources: [],
    });

    expect(prisma.studioMediaAsset.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "episode-mix-asset-1" }) }));
    expect(graph.programMix).toMatchObject({ state: "ACTIVE", assetId: "episode-mix-asset-1", sourceTrackCount: 2, playbackUrl: "/api/ingest/media/mix-source-1" });
    expect(graph.counts.activeProgramMixes).toBe(1);
  });
});
