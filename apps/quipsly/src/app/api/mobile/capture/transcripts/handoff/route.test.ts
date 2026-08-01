/** @jest-environment node */

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { readTranscriptCorrectionDesk } from "@/lib/server/transcript-corrections";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({
  getPrismaClient: jest.fn(() => ({ marker: "prisma" })),
}));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/transcript-corrections", () => ({
  readTranscriptCorrectionDesk: jest.fn(),
}));

describe("canonical transcript handoff", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requires an authenticated Quipsly account", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);

    const response = await GET(
      new Request(
        "http://localhost/api/mobile/capture/transcripts/handoff?callRoomId=room-1&transcriptJobId=job-1",
      ),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(readTranscriptCorrectionDesk).not.toHaveBeenCalled();
  });

  it("exports reviewed text over immutable provider word anchors", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-1",
        primaryEmail: "producer@example.com",
        isStaff: false,
      },
    } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      transcriptJobId: "job-1",
      transcriptStatus: "COMPLETED",
      gate: { allowed: true },
      playback: {
        recordingAssetId: "asset-1",
        url: "/api/playback/asset-1",
      },
      segments: [
        {
          id: "segment-1",
          speakerLabel: "Charlie",
          providerSpeakerLabel: "speaker_0",
          startSeconds: 1.25,
          endSeconds: 2.75,
          text: "Reviewed sentence.",
          providerText: "Reviewd sentence.",
          confidence: 0.96,
          acceptedCorrection: { id: "correction-1" },
          acceptedVerification: null,
          words: [
            {
              id: "word-1",
              providerWordIndex: 0,
              word: "reviewed",
              punctuatedWord: "Reviewed",
              startSeconds: 1.25,
              endSeconds: 1.7,
              confidence: 0.97,
              speakerLabel: "speaker_0",
              channel: 0,
            },
          ],
        },
      ],
    } as any);

    const response = await GET(
      new Request(
        "http://localhost/api/mobile/capture/transcripts/handoff?callRoomId=room-1&transcriptJobId=job-1",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload).toMatchObject({
      ok: true,
      schema: "quipsly-canonical-transcript-handoff-v2",
      roomId: "room-1",
      transcriptJobId: "job-1",
      source: {
        recordingAssetId: "asset-1",
        immutableProviderWords: true,
        reviewedCorrectionsAreOverlays: true,
      },
      segments: [
        {
          id: "segment-1",
          text: "Reviewed sentence.",
          providerText: "Reviewd sentence.",
          reviewStatus: "human-reviewed",
          acceptedReviewId: "correction-1",
          acceptedCorrectionId: "correction-1",
          words: [
            {
              id: "word-1",
              providerWordIndex: 0,
              word: "Reviewed",
              rawWord: "reviewed",
              startTime: 1.25,
              source: "deepgram-word-anchor",
            },
          ],
        },
      ],
      boundaries: {
        sourceMediaUnchanged: true,
        providerWordsUnchanged: true,
        stableExternalIdentitiesIncluded: true,
        importingDoesNotPublish: true,
      },
    });
    expect(readTranscriptCorrectionDesk).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: "room-1",
        actor: {
          id: "user-1",
          email: "producer@example.com",
          isStaff: false,
        },
      }),
    );
  });

  it("refuses a superseded transcript identity", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: { id: "user-1", isStaff: true },
    } as any);
    jest.mocked(readTranscriptCorrectionDesk).mockResolvedValue({
      transcriptJobId: "job-current",
    } as any);

    const response = await GET(
      new Request(
        "http://localhost/api/mobile/capture/transcripts/handoff?callRoomId=room-1&transcriptJobId=job-old",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.errorCode).toBe("TRANSCRIPT_VERSION_SUPERSEDED");
  });
});
