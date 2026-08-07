/** @jest-environment node */

import { planCaptureTakeMaterialization } from "@/lib/episode-production/capture-take-materialization";
import { episodeTimelineContentFingerprint } from "@/app/(app)/episode-production/episodeArtifact";
import { getPrismaClient } from "@/lib/prisma";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { loadEpisodeCaptureTakeMaterialization } from "@/lib/server/episode-capture-take-materialization";
import { appendEpisodeTimelineSavedReceipt } from "@/lib/server/episode-edit-review-ledger";

import { GET, POST } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/episode-capture-take-materialization", () => ({ loadEpisodeCaptureTakeMaterialization: jest.fn() }));
jest.mock("@/lib/server/episode-edit-review-ledger", () => ({
  appendEpisodeTimelineSavedReceipt: jest.fn(),
  EpisodeEditReviewLedgerError: class EpisodeEditReviewLedgerError extends Error {},
  publicEpisodeEditReviewReceipt: (receipt: unknown) => receipt,
}));

const actor = {
  id: "user-1",
  email: "editor@example.com",
  name: "Editor",
  isStaff: false,
  source: "embedded-cookie",
};
const emptyTimeline = { clips: [], transcript: [] };
const emptyFingerprint = episodeTimelineContentFingerprint(emptyTimeline);

function request(method: "GET" | "POST", body?: Record<string, unknown>) {
  return new Request("http://localhost/api/episode-production/capture-takes?projectSlug=high-ground-odyssey&episodeSlug=episode-9", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function inspection(plan = planCaptureTakeMaterialization({
  timeline: emptyTimeline,
  sources: [{
    captureGroupId: "group-1",
    roomId: "room-1",
    recordingAssetId: "recording-1",
    mediaAssetId: "media-1",
    sourceId: "source-1",
    sourceSha256: "a".repeat(64),
    storageGeneration: "1",
    playbackUrl: "/api/ingest/media/source-1",
    originalName: "Charlie.wav",
    kind: "audio",
    durationSeconds: 20,
    participant: null,
    cameraPosition: null,
    audioDecodeEvidence: {
      status: "complete",
      jobId: "decode-recording-1",
      sourceSha256: "a".repeat(64),
      completedAt: "2026-08-06T15:55:00.000Z",
      completeDecode: true,
      signalStatus: "signal-present",
      rmsDbfs: -22,
      samplePeakDbfs: -3,
      durationSeconds: 20,
      error: null,
    },
    alignment: null,
  }],
  actor,
  materializedAt: "2026-08-06T16:00:00.000Z",
})) {
  return {
    production: {
      id: "production-1",
      projectId: "project-1",
      slug: "episode-9",
      title: "Episode 9",
      timelineJson: null,
      transcriptJson: null,
      productionJson: { importedMedia: [] },
      updatedAt: new Date("2026-08-06T15:00:00.000Z"),
    },
    captureGroupId: "group-1",
    importedMediaCount: 1,
    selectedMediaCount: 1,
    sourceCount: 1,
    transcriptJobId: null,
    plan,
  };
}

describe("Capture take materialization route", () => {
  const update = jest.fn();
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: unknown) => unknown) => operation({
      studioEpisodeProduction: {
        findUnique: jest.fn(async () => ({
          id: "production-1",
          timelineJson: null,
          transcriptJson: null,
          productionJson: { importedMedia: [] },
          updatedAt: new Date("2026-08-06T15:00:00.000Z"),
        })),
        update,
      },
    })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    update.mockResolvedValue({ id: "production-1", updatedAt: new Date("2026-08-06T16:00:00.000Z") });
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
      allowed: true,
      actor,
      access: { allowed: true, projectId: "project-1", role: "EDITOR" },
    } as never);
    jest.mocked(loadEpisodeCaptureTakeMaterialization).mockResolvedValue(inspection() as never);
    jest.mocked(appendEpisodeTimelineSavedReceipt).mockResolvedValue({ id: "save-receipt-1" } as never);
  });

  it("returns a no-store inspection without mutating episode state", async () => {
    const response = await GET(request("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.plan.status).toBe("media-ready");
    expect(payload.plan.impact).toMatchObject({
      operation: "initial-materialization",
      sourceLanesCreated: 1,
      sourceLanesReused: 0,
    });
    expect(payload.plan.timeline).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a stale editor timeline before opening a transaction", async () => {
    const response = await POST(request("POST", {
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      clientRequestId: "request-1",
      expectedTimelineFingerprint: "stale",
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).errorCode).toBe("CAPTURE_TAKE_TIMELINE_CONFLICT");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("persists one artifact and canonical timeline receipt without mutating source media", async () => {
    const response = await POST(request("POST", {
      projectSlug: "high-ground-odyssey",
      episodeSlug: "episode-9",
      clientRequestId: "request-1",
      expectedTimelineFingerprint: emptyFingerprint,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.changed).toBe(true);
    expect(payload.plan.changed).toBe(false);
    expect(payload.timelineJson.timelineClips[0]).toMatchObject({
      id: "capture-take:group-1:recording-1",
      captureTakeSource: {
        recordingAssetId: "recording-1",
      },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        timelineJson: expect.objectContaining({ payloadVersion: 6 }),
        transcriptJson: expect.objectContaining({ payloadVersion: 6 }),
        productionJson: expect.objectContaining({
          lastCaptureTakeMaterialization: expect.objectContaining({
            sourceMediaUnchanged: true,
            publicationNotStarted: true,
          }),
        }),
      }),
    }));
    expect(appendEpisodeTimelineSavedReceipt).toHaveBeenCalledWith(expect.objectContaining({
      clientRequestId: "request-1",
      linkedReviewReceiptIds: [],
      saveMode: "manual",
    }));
  });
});
