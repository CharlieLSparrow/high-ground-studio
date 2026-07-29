/** @jest-environment node */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/capture-proxy-reconciliation", () => ({
  reconcileCaptureProxyResults: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";

import { loadEpisodeRoomWritingRuntime } from "./episode-room-store";
import { episodeRoomWritingVersion } from "./episode-room-writing";

const documentUpdatedAt = new Date("2026-07-29T10:00:00.000Z");
const latestBlockUpdatedAt = new Date("2026-07-29T10:04:00.000Z");

function createPrisma() {
  const findMany = jest.fn().mockResolvedValue([
    {
      id: "block-1",
      stableId: "swear-jar-opening",
      order: 1,
      title: "Homer",
      body: "Opening rehearsal line.",
    },
  ]);
  const prisma = {
    studioEpisodeProduction: {
      findFirst: jest.fn().mockResolvedValue({
        id: "episode-1",
        slug: "the-swear-jar",
        title: "The Swear Jar",
        status: "READY_TO_RECORD",
        updatedAt: new Date("2026-07-29T10:05:00.000Z"),
        documentId: "document-1",
        boundaryStartOrder: 10,
        boundaryEndOrder: 43,
        document: {
          title: "High Ground Odyssey · The Swear Jar",
          updatedAt: documentUpdatedAt,
        },
      }),
    },
    studioDocumentBlock: {
      aggregate: jest.fn().mockResolvedValue({
        _count: { _all: 34 },
        _max: { updatedAt: latestBlockUpdatedAt },
      }),
      findMany,
    },
    studioDocumentOperation: {
      findFirst: jest.fn().mockResolvedValue({ id: "operation-34" }),
    },
  };
  jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
  return { prisma, findMany };
}

describe("native Episode Room manuscript projection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads only canonical episode and document blocks", async () => {
    const { prisma, findMany } = createPrisma();

    await expect(loadEpisodeRoomWritingRuntime(
      "high-ground-odyssey",
      "the-swear-jar",
    )).resolves.toMatchObject({
      episode: {
        id: "episode-1",
        slug: "the-swear-jar",
        title: "The Swear Jar",
        documentId: "document-1",
      },
      writing: {
        blockCount: 34,
        visibleBlockCount: 1,
        truncated: false,
        textBlocks: [{ stableId: "swear-jar-opening" }],
      },
    });
    expect(prisma.studioEpisodeProduction.findFirst).toHaveBeenCalledWith({
      where: {
        slug: "the-swear-jar",
        project: { slug: "high-ground-odyssey" },
      },
      select: {
        id: true,
        slug: true,
        title: true,
        status: true,
        updatedAt: true,
        documentId: true,
        boundaryStartOrder: true,
        boundaryEndOrder: true,
        document: {
          select: {
            title: true,
            updatedAt: true,
          },
        },
      },
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        documentId: "document-1",
        archivedAt: null,
        order: { gte: 10, lte: 43 },
      },
      take: 400,
    }));
  });

  it("returns metadata only when the protected client already has the same version", async () => {
    const { findMany } = createPrisma();
    const version = episodeRoomWritingVersion({
      documentUpdatedAt,
      latestBlockUpdatedAt,
      blockCount: 34,
      latestOperationId: "operation-34",
    });

    const result = await loadEpisodeRoomWritingRuntime(
      "high-ground-odyssey",
      "the-swear-jar",
      version,
    );

    expect(result?.writing.version).toBe(version);
    expect(result?.writing.textBlocks).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
  });
});
