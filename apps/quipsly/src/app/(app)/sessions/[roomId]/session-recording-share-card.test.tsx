import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionRecordingShareCard } from "./session-recording-share-card";

const transcriptSegment = {
  transcriptJobId: "transcript_job_0001",
  segmentId: "transcript_segment_0001",
  sourceRecordingAssetId: "recording_asset_0001",
  providerTextSha256: "a".repeat(64),
  speakerLabel: "Coach",
  text: "Remove the scheduling detour from the shared copy.",
  startSeconds: 8,
  endSeconds: 12,
  cutStartSeconds: 8.1,
  cutEndSeconds: 11.9,
  timingFingerprint: "c".repeat(64),
  timingBasis: "provider-words",
  cutSafety: "safe",
  cutSafetyReason: "Word timing is bound to this exact source recording.",
};

const snapshot = {
  ok: true,
  role: "COACH",
  room: { id: "session_room_0001", title: "First coaching session", coach: { id: "coach_user_0001", label: "Coach" }, client: { id: "client_user_0001", label: "Client" } },
  available: {
    programDurationSeconds: 30,
    sources: [{ id: "recording_asset_0001", participantLabel: "Coach", kind: "LOCAL_AUDIO", fileName: "coach.webm", sizeBytes: 4_000, startedAt: "2026-08-22T12:00:00.000Z", stoppedAt: "2026-08-22T12:00:30.000Z", programOffsetSeconds: 0, playbackUrl: "/api/sessions/session_room_0001/recordings/recording_asset_0001/media" }],
    transcriptSegments: [transcriptSegment],
  },
  output: null,
  readiness: { canPrepare: true, hasVerifiedParticipantSources: true, localRendererAvailable: true, cloudRendererAvailable: false },
};

function response(value: unknown) {
  return { ok: true, json: async () => value } as Response;
}

describe("SessionRecordingShareCard", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

  it("prepares a source-bound text edit without treating transcript correction as media mutation", async () => {
    const requests: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    global.fetch = jest.fn(async (_url, init) => {
      const method = init?.method || "GET";
      requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null });
      return response(method === "POST" ? { ...snapshot, output: null } : snapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const passage = await screen.findByText(transcriptSegment.text);
    const passageCheckbox = passage.closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(passageCheckbox).toBeChecked();
    await userEvent.click(passageCheckbox);
    expect(passageCheckbox).not.toBeChecked();
    expect(screen.getByText(/1 passage removed · 0:04 cut · preview about 0:26/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests.some((request) => request.method === "POST")).toBe(true));
    const prepare = requests.find((request) => request.method === "POST")?.body;
    expect(prepare).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: ["recording_asset_0001"],
      excludedTranscriptSegments: [{
        transcriptJobId: transcriptSegment.transcriptJobId,
        segmentId: transcriptSegment.segmentId,
        providerTextSha256: transcriptSegment.providerTextSha256,
        timingFingerprint: transcriptSegment.timingFingerprint,
      }],
    }));
  });

  it("prepares through the verified cloud renderer when no local renderer is available", async () => {
    const cloudOnlySnapshot = { ...snapshot, readiness: { ...snapshot.readiness, localRendererAvailable: false, cloudRendererAvailable: true } };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(cloudOnlySnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const prepare = await screen.findByRole("button", { name: "Create private preview" });
    expect(prepare).toBeEnabled();
    expect(screen.queryByText(/temporarily unavailable/i)).not.toBeInTheDocument();
    await userEvent.click(prepare);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({ action: "PREPARE" }));
  });

  it("holds preview preparation only when no verified renderer is available", async () => {
    const noRendererSnapshot = { ...snapshot, readiness: { ...snapshot.readiness, localRendererAvailable: false, cloudRendererAvailable: false } };
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(noRendererSnapshot)) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(await screen.findByRole("button", { name: "Create private preview" })).toBeDisabled();
    expect(screen.getByText(/preview preparation is temporarily unavailable/i)).toBeInTheDocument();
  });

  it("reopens the retained edit choices after a failed private preview", async () => {
    const failedSnapshot = {
      ...snapshot,
      output: {
        id: "session_output_failed_0001",
        status: "DRAFT",
        title: "Retained recording edit",
        revision: 2,
        contentSha256: "d".repeat(64),
        recipient: { id: "client_user_0001", label: "Client" },
        render: { status: "FAILED", durationSeconds: null, sizeBytes: null, sha256: null },
        mediaUrl: null,
        body: { edit: { startSeconds: 3, endSeconds: 24, transcriptExclusions: [] } },
        sourceManifest: { sources: [{ recordingAssetId: "recording_asset_0001" }] },
      },
    };
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(failedSnapshot)) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(await screen.findByText(/original recording and edit choices are safe/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Review trim and try again" }));

    expect(screen.getByDisplayValue("Retained recording edit")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Recording start" })).toHaveValue("3");
    expect(screen.getByRole("slider", { name: "Recording end" })).toHaveValue("24");
    expect(screen.getByRole("button", { name: "Create private preview" })).toBeEnabled();
  });

  it("focuses the exact transcript cut requested by the review surface", async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(snapshot)) as jest.MockedFunction<typeof fetch>;
    const focusTranscriptKey = `${transcriptSegment.transcriptJobId}:${transcriptSegment.segmentId}`;

    render(<SessionRecordingShareCard roomId="session_room_0001" focusTranscriptKey={focusTranscriptKey} />);

    const passage = await screen.findByText(transcriptSegment.text);
    const row = passage.closest("label");
    expect(row).toHaveAttribute("data-transcript-key", focusTranscriptKey);
    expect(row).toHaveClass("ring-4");
    expect((row?.querySelector("input[type=checkbox]") as HTMLInputElement)).toBeChecked();
  });

  it("auditions the exact source-bound passage before rendering a cut", async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(snapshot)) as jest.MockedFunction<typeof fetch>;
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Listen to exact passage" }));

    const source = screen.getByLabelText("Source passage from Coach") as HTMLAudioElement;
    expect(source).toHaveAttribute("src", "/api/sessions/session_room_0001/recordings/recording_asset_0001/media");
    fireEvent.loadedMetadata(source);
    expect(source.currentTime).toBeCloseTo(8.1, 3);
    expect(play).toHaveBeenCalled();
    expect(screen.getByText(/plays only the exact source passage/i)).toBeInTheDocument();
  });

  it("keeps overlapping speech included and explains why", async () => {
    const unsafeSnapshot = {
      ...snapshot,
      available: {
        ...snapshot.available,
        transcriptSegments: [{
          ...transcriptSegment,
          cutSafety: "overlapping-speech",
          cutSafetyReason: "Another participant is speaking here. Keep the passage.",
        }],
      },
    };
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(unsafeSnapshot)) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const passage = await screen.findByText(transcriptSegment.text);
    const passageCheckbox = passage.closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(passageCheckbox).toBeChecked();
    expect(passageCheckbox).toBeDisabled();
    expect(screen.getByText(/another participant is speaking here/i)).toBeInTheDocument();
  });

  it("uses familiar trim controls while keeping technical source choices out of the main path", async () => {
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(snapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const start = await screen.findByRole("slider", { name: "Recording start" });
    const end = screen.getByRole("slider", { name: "Recording end" });
    expect(start).toHaveValue("0");
    expect(end).toHaveValue("30");
    expect(screen.getByText(/name and recording sources/i).closest("details")).not.toHaveAttribute("open");

    fireEvent.change(start, { target: { value: "5" } });
    fireEvent.change(end, { target: { value: "25" } });
    expect(screen.getByText("0:20 selected")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: ["recording_asset_0001"],
      startSeconds: 5,
      endSeconds: 25,
    }));
  });

  it("shares a verified private preview with one explicit standard action", async () => {
    const output = {
      id: "session_output_0001",
      status: "DRAFT",
      title: "First coaching session recording",
      revision: 2,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_0001",
      playbackReview: { schema: "quipsly-session-recording-share-playback-review-v1", requiredSecondBins: [0, 15, 29], joinSecondBins: [], reviewed: true, reviewedAt: "2026-08-24T12:00:00.000Z", clientTrackedPlaybackIsNotProofOfAudibility: true },
      body: { edit: { startSeconds: 0, endSeconds: 30, transcriptExclusions: [] } },
    };
    const draft = { ...snapshot, output };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(draft);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const share = await screen.findByRole("button", { name: "Share with Client" });
    expect(share).toBeEnabled();
    await userEvent.click(share);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "RELEASE",
      outputId: output.id,
      expectedRevision: 2,
    }));
  });

  it("observes required preview checkpoints and saves review without a checkbox", async () => {
    const draftOutput = {
      id: "session_output_review_0001",
      status: "DRAFT",
      title: "First coaching session recording",
      revision: 2,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_review_0001",
      playbackReview: { schema: "quipsly-session-recording-share-playback-review-v1", requiredSecondBins: [0, 15, 29], joinSecondBins: [], reviewed: false, reviewedAt: null, clientTrackedPlaybackIsNotProofOfAudibility: true },
      body: { edit: { startSeconds: 0, endSeconds: 30, transcriptExclusions: [] } },
    };
    const reviewedOutput = { ...draftOutput, revision: 3, playbackReview: { ...draftOutput.playbackReview, reviewed: true, reviewedAt: "2026-08-24T12:00:00.000Z" } };
    let currentOutput: typeof draftOutput | typeof reviewedOutput = draftOutput;
    const requests: Array<Record<string, any>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        if (body.action === "REVIEW") currentOutput = reviewedOutput;
      }
      return response({ ...snapshot, output: currentOutput });
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const audio = await screen.findByLabelText("Private recording preview") as HTMLAudioElement;
    const play = jest.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    Object.defineProperties(audio, {
      duration: { configurable: true, value: 30 },
      paused: { configurable: true, value: false },
      seeking: { configurable: true, value: false },
    });
    await userEvent.click(screen.getByRole("button", { name: "Play next review point" }));
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalled();
    for (const second of [0, 15, 29]) {
      audio.currentTime = second + 0.1;
      fireEvent.play(audio);
      fireEvent.timeUpdate(audio);
      fireEvent.pause(audio);
    }

    await waitFor(() => expect(requests.some((request) => request.action === "REVIEW")).toBe(true));
    expect(requests.find((request) => request.action === "REVIEW")).toMatchObject({
      outputId: draftOutput.id,
      expectedRevision: 2,
      playbackEvidence: { listenedSecondBins: [0, 15, 29], clientTrackedPlaybackIsNotProofOfAudibility: true },
    });
    expect(await screen.findByText(/listening review saved for this exact revision/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share with Client" })).toBeEnabled();
  });

  it("reopens the current edit without losing transcript cuts and cancels safely", async () => {
    const output = {
      id: "session_output_0002",
      status: "DRAFT",
      title: "First coaching session recording",
      revision: 4,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 26, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_0002",
      body: {
        edit: {
          startSeconds: 2,
          endSeconds: 28,
          transcriptExclusions: [transcriptSegment],
        },
      },
    };
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response({ ...snapshot, output })) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit private preview" }));

    const passage = screen.getByText(transcriptSegment.text);
    const passageCheckbox = passage.closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(screen.getByText(/editing starts from revision 4/i)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Recording start" })).toHaveValue("2");
    expect(screen.getByRole("slider", { name: "Recording end" })).toHaveValue("28");
    expect(passageCheckbox).not.toBeChecked();

    await userEvent.click(passageCheckbox);
    expect(passageCheckbox).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
    expect(screen.queryByText(/editing starts from revision 4/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit private preview" }));
    const restored = screen.getByText(transcriptSegment.text).closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(restored).not.toBeChecked();
  });

  it("reopens from the exact reviewed source manifest instead of substituting the current default track", async () => {
    const cameraSegment = {
      ...transcriptSegment,
      segmentId: "transcript_segment_camera_0001",
      sourceRecordingAssetId: "recording_asset_camera_0001",
      text: "Keep the reviewed camera-master wording decision.",
    };
    const cameraSource = {
      ...snapshot.available.sources[0],
      id: "recording_asset_camera_0001",
      kind: "LOCAL_VIDEO",
      fileName: "coach-camera.mov",
    };
    const output = {
      id: "session_output_exact_sources_0001",
      status: "DRAFT",
      title: "Reviewed camera-master edit",
      revision: 3,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 26, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_exact_sources_0001",
      body: { edit: { startSeconds: 2, endSeconds: 28, transcriptExclusions: [cameraSegment] } },
      sourceManifest: { sources: [{ recordingAssetId: cameraSource.id }] },
    };
    const exactSnapshot = {
      ...snapshot,
      available: {
        ...snapshot.available,
        sources: [...snapshot.available.sources, cameraSource],
        transcriptSegments: [transcriptSegment, cameraSegment],
      },
      output,
    };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(exactSnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Edit private preview" }));
    await userEvent.click(screen.getByText(/name and recording sources/i));

    const localAudio = screen.getByText(/local audio master/i).closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    const cameraAudio = screen.getByText(/camera master audio/i).closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(localAudio).not.toBeChecked();
    expect(cameraAudio).toBeChecked();
    const passage = screen.getByText(cameraSegment.text).closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(passage).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: [cameraSource.id],
      excludedTranscriptSegments: [expect.objectContaining({ segmentId: cameraSegment.segmentId })],
    }));
  });
});
