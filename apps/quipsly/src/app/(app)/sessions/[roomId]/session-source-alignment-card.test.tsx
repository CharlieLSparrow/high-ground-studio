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
                minimumCorrelation: 0.78,
                minimumPeakMargin: 0.04,
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

  it("explains ambiguous peaks and keeps the capture-clock estimate visibly safe", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        suggestion: {
          status: "ready",
          generatedAutomatically: true,
          acousticAnalysisStarted: false,
          spineRecordingAssetId: "recording-coach",
          targetRecordingAssetId: "recording-client",
          clockAuthority: "capture-clock-proposal",
          initialOffsetSeconds: 4.011,
          overlapStartSeconds: 0,
          overlapEndSeconds: 12.596,
          searchRadiusSeconds: 2.544,
        },
        alignments: [
          {
            jobId: "session_alignment_ambiguous123",
            status: "completed",
            spineRecordingAssetId: "recording-coach",
            targetRecordingAssetId: "recording-client",
            clockAuthority: "capture-clock-proposal",
            evidence: {
              opening: {
                measuredOffsetSeconds: 4.49,
                normalizedCorrelation: 0.999,
                peakMargin: 0.135,
              },
              later: {
                measuredOffsetSeconds: 4.49,
                normalizedCorrelation: 0.999,
                peakMargin: 0,
              },
              drift: {
                residualDriftMilliseconds: 0,
                observedPartsPerMillion: 0,
              },
              qualification: {
                minimumCorrelation: 0.78,
                minimumPeakMargin: 0.04,
                qualifiedForAuthorizedAgentReview: false,
                reason: "The decoded-audio peaks are weak or ambiguous.",
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
      await screen.findByText(/waveform match needs more evidence/i),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Held")).toHaveLength(1);
    expect(
      screen.getByText(/kept the capture-clock estimate and changed nothing/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/a \+479\.0 ms difference/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /use measured placement/i }),
    ).not.toBeInTheDocument();
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
    expect(
      screen.getByRole("img", {
        name: /two-source clock and waveform overview/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /timing envelopes shown; waveforms appear after complete decode/i,
      ),
    ).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("compares every compatible participant master with an optional shared room reference", async () => {
    const suggestion = {
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
      sharedReference: {
        recordingAssetId: "recording-room-reference",
        mode: "audio-reference",
        targets: [
          {
            recordingAssetId: "recording-coach",
            initialOffsetSeconds: -0.1,
            overlapStartSeconds: 0.1,
            overlapEndSeconds: 120,
            searchRadiusSeconds: 1,
            processorCompatible: true,
          },
          {
            recordingAssetId: "recording-client",
            initialOffsetSeconds: 0.251,
            overlapStartSeconds: 0,
            overlapEndSeconds: 119.749,
            searchRadiusSeconds: 1,
            processorCompatible: true,
          },
        ],
        boundaries: {
          participantMastersRemainAuthoritative: true,
          providerReferenceIsOptionalWitness: true,
          exactGenerationReadAndHashed: true,
          referenceCannotReplaceParticipantMaster: true,
        },
      },
    };
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, alignments: [], suggestion }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          alignment: {
            jobId: "session_alignment_reference_coach",
            status: "blocked",
            spineRecordingAssetId: "recording-room-reference",
            targetRecordingAssetId: "recording-coach",
            clockAuthority: "capture-clock-proposal",
            evidence: null,
            error: "Processor paused for the test.",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          alignment: {
            jobId: "session_alignment_reference_client",
            status: "blocked",
            spineRecordingAssetId: "recording-room-reference",
            targetRecordingAssetId: "recording-client",
            clockAuthority: "capture-clock-proposal",
            evidence: null,
            error: "Processor paused for the test.",
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
    expect(
      await screen.findByRole("region", {
        name: /shared room sync reference/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reference only · never the master/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: /strengthen sync with room reference/i,
      }),
    );
    await screen.findByText(/2 participant masters are being compared/i);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/sessions/room-1/source-alignment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "QUEUE",
          spineRecordingAssetId: "recording-room-reference",
          targetRecordingAssetId: "recording-coach",
        }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/sessions/room-1/source-alignment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "QUEUE",
          spineRecordingAssetId: "recording-room-reference",
          targetRecordingAssetId: "recording-client",
        }),
      }),
    );
  });
});
