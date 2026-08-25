import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SessionSourceAlignmentCard } from "./session-source-alignment-card";

function source(recordingAssetId: string, fileName: string) {
  return {
    recordingAssetId,
    fileName,
    kind: "LOCAL_AUDIO",
    recordingStatus: "VERIFIED",
    status: "VERIFIED_MATCH" as const,
    captureId: "capture-1",
    captureGroupId: "ddfbb57c-7b7e-4a38-83a7-46ab27b51d82",
    uploadSessionId: "upload-1",
    startBoundary: null,
    stopBoundary: null,
    sourceOrigin: "CAPTURE" as const,
    cloud: {
      sha256: "a".repeat(64),
      byteSize: "1000",
      generation: "12",
      bucket: "bucket",
      objectPath: "media-vault/source.m4a",
      verifiedAt: "2026-08-24T20:00:00.000Z",
    },
    protectedPlayback: {
      sourceId: recordingAssetId,
      url: `/media/${recordingAssetId}`,
      kind: "audio" as const,
      durationSeconds: 120,
    },
    captureRuntime: {
      appVersion: null,
      appBuild: null,
      deviceModel: null,
      operatingSystem: null,
      audioRoute: null,
    },
    processingDisposition: "RELEASED",
    transcriptDisposition: "RELEASED",
    issues: [],
  };
}

const evidence = {
  sources: [
    source("recording-coach", "Coach MV7i.m4a"),
    source("recording-client", "Client iPhone.m4a"),
  ],
  counts: { VERIFIED_MATCH: 2, HELD: 0, DRIFT: 0, INCOMPLETE: 0 },
};

describe("SessionSourceAlignmentCard", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("shows exact-source measurements and a separate reversible placement action", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        alignments: [
          {
            jobId: "session_alignment_12345678",
            status: "completed",
            spineRecordingAssetId: "recording-coach",
            targetRecordingAssetId: "recording-client",
            clockAuthority: "capture-clock-proposal",
            evidence: {
              opening: {
                measuredOffsetSeconds: 0.351,
                normalizedCorrelation: 0.97,
                peakMargin: 0.77,
              },
              later: {
                measuredOffsetSeconds: 0.352,
                normalizedCorrelation: 0.96,
                peakMargin: 0.78,
              },
              drift: {
                residualDriftMilliseconds: 1,
                observedPartsPerMillion: 16.6667,
              },
              qualification: {
                qualifiedForAuthorizedAgentReview: true,
                reason: "Two distinct exact-source peaks qualify for review.",
              },
            },
            error: null,
          },
        ],
      }),
    }) as jest.Mock;
    render(
      <SessionSourceAlignmentCard
        roomId="room-1"
        evidence={evidence}
        canManage
      />,
    );
    expect(
      await screen.findByText(/distinct peaks ready for protected review/i),
    ).toBeInTheDocument();
    expect(screen.getByText("+351.0 ms")).toBeInTheDocument();
    expect(screen.getByText("1.0 ms")).toBeInTheDocument();
    expect(screen.getByText(/never moves either source/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /applies it reversibly to the Session conversation clock/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use measured placement/i }),
    ).toBeInTheDocument();
  });

  it("queues the selected exact pair from one explicit cost-bearing action", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, alignments: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          alignment: {
            jobId: "session_alignment_12345678",
            status: "blocked",
            spineRecordingAssetId: "recording-coach",
            targetRecordingAssetId: "recording-client",
            clockAuthority: "capture-clock-proposal",
            evidence: null,
            error: "The processor is paused.",
          },
        }),
      });
    render(
      <SessionSourceAlignmentCard
        roomId="room-1"
        evidence={evidence}
        canManage
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: /compare exact-source waveforms/i }),
    );
    await screen.findByText("The processor is paused.");
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-1/source-alignment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "QUEUE",
          spineRecordingAssetId: "recording-coach",
          targetRecordingAssetId: "recording-client",
        }),
      }),
    );
  });

  it("shows the automatic capture-clock estimate before starting acoustic processing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        alignments: [],
        suggestion: {
          status: "ready",
          generatedAutomatically: true,
          acousticAnalysisStarted: false,
          spineRecordingAssetId: "recording-coach",
          targetRecordingAssetId: "recording-client",
          clockAuthority: "capture-clock-proposal",
          initialOffsetSeconds: 0.351,
          overlapStartSeconds: 0,
          overlapEndSeconds: 119.649,
          searchRadiusSeconds: 1,
        },
      }),
    }) as jest.Mock;
    render(
      <SessionSourceAlignmentCard
        roomId="room-1"
        evidence={evidence}
        canManage
      />,
    );
    expect(
      await screen.findByRole("region", {
        name: /automatic capture clock suggestion/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("+351.0 ms")).toBeInTheDocument();
    expect(screen.getByText(/no processing started/i)).toBeInTheDocument();
    expect(
      screen.getByText(/not an acoustic match or an applied edit/i),
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
