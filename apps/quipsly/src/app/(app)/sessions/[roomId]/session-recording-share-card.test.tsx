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
    timeline: {
      authority: "capture-clock-proposal",
      precision: "provisional",
      reason: "Device clock evidence placed the participant masters automatically. Waveform analysis can refine this provisional placement without changing the originals.",
      sources: [{ recordingAssetId: "recording_asset_0001", programOffsetSeconds: 0, timingUncertaintyMilliseconds: 18 }],
    },
    sources: [{ id: "recording_asset_0001", participantId: "participant_coach_0001", participantLabel: "Coach", kind: "LOCAL_AUDIO", fileName: "coach.webm", sizeBytes: 4_000, startedAt: "2026-08-22T12:00:00.000Z", stoppedAt: "2026-08-22T12:00:30.000Z", programOffsetSeconds: 0, playbackUrl: "/api/sessions/session_room_0001/recordings/recording_asset_0001/media" }],
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

  it("switches recording attempts without combining their sources or gaps", async () => {
    const takes = [{id: "start:latest", startedAt: "2026-09-09T12:00:00Z", sourceCount: 1},
      {id: "start:earlier", startedAt: "2026-09-09T11:00:00Z", sourceCount: 1}];
    const latest = {...snapshot, available: {...snapshot.available, takes, selectedTakeId: "start:latest"}};
    const earlier = {...snapshot, available: {...snapshot.available, takes, selectedTakeId: "start:earlier", programDurationSeconds: 20,
      sources: [{...snapshot.available.sources[0]!, id: "earlier-source", stoppedAt: "2026-08-22T12:00:20.000Z"}], transcriptSegments: []}};
    const fetchMock = jest.fn(async (url: string) => response(url.includes("start%3Aearlier") ? earlier : latest));
    global.fetch = fetchMock as typeof fetch;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const selector = await screen.findByRole("combobox", {name: /Recording attempt/});
    expect(selector).toHaveValue("start:latest");
    await userEvent.selectOptions(selector, "start:earlier");
    await waitFor(() => expect(selector).toHaveValue("start:earlier"));
    expect(screen.getByRole("slider", {name: "Recording end"})).toHaveValue("20");
    expect(screen.queryByText(transcriptSegment.text)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name: "Refresh"}));
    expect(fetchMock).toHaveBeenLastCalledWith("/api/sessions/session_room_0001/recording-share?takeId=start%3Aearlier", expect.anything());
  });

  it("shows loading rather than a permission failure while the workspace is being read", () => {
    global.fetch = jest.fn(() => new Promise<Response>(() => {}));
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading recording tools");
    expect(screen.queryByText(/unavailable|recipient boundary/i)).not.toBeInTheDocument();
  });

  it("does not keep a queued notice after the prepared edit is ready to play and share", async () => {
    let prepared = false;
    const ready = { ...snapshot, output: {
      id: "private-edit-1", status: "DRAFT", title: "First coaching session recording", revision: 2,
      contentSha256: "d".repeat(64), recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "a".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/private-edit-1",
      body: { edit: { startSeconds: 0, endSeconds: 30 } },
    } };
    const requests: string[] = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") { prepared = true; requests.push(JSON.parse(String(init.body)).action); }
      return response(prepared ? ready : snapshot);
    }) as jest.MockedFunction<typeof fetch>;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Create private preview" }));
    expect(await screen.findByLabelText("Private recording preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share with Client" })).toBeEnabled();
    expect(screen.queryByText(/preview queued/i)).not.toBeInTheDocument();
    expect(requests).toEqual(["PREPARE"]);
  });

  it("recovers a failed read through Try again without mutating or sharing the recording", async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValue(response(snapshot));
    global.fetch = fetchMock;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(await screen.findByText("Connection interrupted")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Trim and share" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const args of fetchMock.mock.calls) expect(args).toEqual(["/api/sessions/session_room_0001/recording-share", { cache: "no-store" }]);
  });

  it("explains the client's empty shared-recording space without showing coach instructions", async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response({ ...snapshot, role: "CLIENT", available: undefined,
      readiness: undefined })) as jest.MockedFunction<typeof fetch>;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(await screen.findByRole("heading", { name: "Shared recordings" })).toBeInTheDocument();
    expect(screen.getByText("When your coach shares an edited recording, it will appear here.")).toBeInTheDocument();
    expect(screen.queryByText(/A draft stays coach-only/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Only you can see the preview/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create private preview" })).not.toBeInTheDocument();
  });

  it("refreshes recording availability without replacing an unfinished trim or text cut", async () => {
    const requests: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(snapshot);
    }) as jest.MockedFunction<typeof fetch>;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const start = await screen.findByRole("slider", { name: "Recording start" });
    fireEvent.change(start, { target: { value: "2" } });
    fireEvent.change(screen.getByRole("slider", { name: "Recording end" }), { target: { value: "28" } });
    fireEvent.click(screen.getByRole("checkbox", { name: `Keep in recording: ${transcriptSegment.text}` }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    expect(start).toHaveValue("2");
    expect(screen.getByRole("slider", { name: "Recording end" })).toHaveValue("28");
    expect(screen.getByRole("checkbox", { name: `Restore to recording: ${transcriptSegment.text}` })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({ startSeconds: 2, endSeconds: 28,
      excludedTranscriptSegments: [expect.objectContaining({ segmentId: transcriptSegment.segmentId })] }));
  });

  it("reuses an exact failed preparation request but gives changed edits a new identity", async () => {
    const requests: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") {
        requests.push(JSON.parse(String(init.body)));
        throw new Error(`Preview connection interrupted ${requests.length}`);
      }
      return response(snapshot);
    }) as jest.MockedFunction<typeof fetch>;
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const prepare = await screen.findByRole("button", { name: "Create private preview" });
    for (let attempt = 1; attempt <= 2; attempt++) {
      await userEvent.click(prepare);
      await screen.findByText(`Preview connection interrupted ${attempt}`);
    }
    fireEvent.change(screen.getByRole("slider", { name: "Recording start" }), { target: { value: "2" } });
    await userEvent.click(prepare);
    await screen.findByText("Preview connection interrupted 3");
    expect(requests[0].clientRequestId).toBe(requests[1].clientRequestId);
    expect(requests[2].clientRequestId).not.toBe(requests[1].clientRequestId);
    expect(requests[2].startSeconds).toBe(2);
  });

  it("updates untouched defaults as participant recordings become available", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({ ...snapshot,
      available: { ...snapshot.available, programDurationSeconds: 0, sources: [], transcriptSegments: [] },
      readiness: { ...snapshot.readiness, hasVerifiedParticipantSources: false },
    })).mockResolvedValue(response(snapshot));
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    expect(await screen.findByRole("button", { name: "Create private preview" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create private preview" })).toBeEnabled());
    expect(screen.getByRole("slider", { name: "Recording end" })).toHaveValue("30");
  });

  it("removes cached recording tools after an explicit access denial", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response(snapshot))
      .mockResolvedValue({ ok: false, status: 403, json: async () => ({ok: false, error: "Access removed"}) });
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await screen.findByRole("button", { name: "Create private preview" });
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Access removed");
    expect(screen.queryByRole("button", { name: "Create private preview" })).not.toBeInTheDocument();
    expect(screen.queryByText(transcriptSegment.text)).not.toBeInTheDocument();
  });

  it("can recover when a previously selected recording attempt is no longer available", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(response({...snapshot,
      available: {...snapshot.available, selectedTakeId: "start:removed"},
    })).mockResolvedValueOnce({ok: false, status: 404, json: async () => ({ok: false, error: "Recording attempt unavailable"})})
      .mockResolvedValueOnce(response(snapshot));
    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await screen.findByRole("button", {name: "Create private preview"});
    await userEvent.click(screen.getByRole("button", {name: "Refresh"}));
    await screen.findByText("Recording attempt unavailable");
    await userEvent.click(screen.getByRole("button", {name: "Try again"}));
    await screen.findByRole("button", {name: "Create private preview"});
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain("takeId=start%3Aremoved");
    expect((global.fetch as jest.Mock).mock.calls[2][0]).toBe("/api/sessions/session_room_0001/recording-share");
  });

  it("shows automatic sync quality without making it another required workflow", async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(snapshot)) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);

    const status = await screen.findByTestId("recording-timeline-status");
    expect(status).toHaveTextContent("Synced automatically from device clocks · estimated within ±18 ms");
    expect(status).toHaveTextContent("Waveform analysis can refine this provisional placement");
    expect(status.querySelector("button")).toBeNull();
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

  it("keeps one high-quality master for each participant when display names match", async () => {
    const sameNameSources = [
      {
        ...snapshot.available.sources[0],
        id: "coach_audio",
        participantId: "participant_coach",
        participantLabel: "Scott Sparrow",
        fileName: "coach.m4a",
      },
      {
        ...snapshot.available.sources[0],
        id: "coach_camera",
        participantId: "participant_coach",
        participantLabel: "Scott Sparrow",
        kind: "LOCAL_VIDEO",
        contentType: "video/mp4",
        fileName: "coach.mp4",
      },
      {
        ...snapshot.available.sources[0],
        id: "client_audio",
        participantId: "participant_client",
        participantLabel: "Scott Sparrow",
        fileName: "client.m4a",
      },
      {
        ...snapshot.available.sources[0],
        id: "client_camera",
        participantId: "participant_client",
        participantLabel: "Scott Sparrow",
        kind: "LOCAL_VIDEO",
        contentType: "video/mp4",
        fileName: "client.mp4",
      },
    ];
    const sameNameSnapshot = {
      ...snapshot,
      available: {
        ...snapshot.available,
        sources: sameNameSources,
        transcriptSegments: [],
      },
    };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(sameNameSnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Create private preview" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: ["coach_audio", "client_audio"],
    }));
  });

  it("selects both sequential participant masters after a browser reconnect", async () => {
    const recoveredSources = [
      {
        ...snapshot.available.sources[0],
        id: "coach_before_crash",
        stoppedAt: "2026-08-22T12:10:00.000Z",
        programOffsetSeconds: 0,
      },
      {
        ...snapshot.available.sources[0],
        id: "client_continuous",
        participantId: "participant_client_0001",
        participantLabel: "Client",
        startedAt: "2026-08-22T12:00:01.000Z",
        stoppedAt: "2026-08-22T12:30:01.000Z",
        programOffsetSeconds: 1,
      },
      {
        ...snapshot.available.sources[0],
        id: "coach_after_reconnect",
        startedAt: "2026-08-22T12:10:08.000Z",
        stoppedAt: "2026-08-22T12:30:00.000Z",
        programOffsetSeconds: 608,
      },
    ];
    const recoveredSnapshot = {
      ...snapshot,
      available: {
        ...snapshot.available,
        programDurationSeconds: 1_801,
        sources: recoveredSources,
        transcriptSegments: [],
      },
    };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(recoveredSnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Create private preview" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: ["coach_before_crash", "coach_after_reconnect", "client_continuous"],
    }));
  });

  it("prefers one complete device master over overlapping crash segments", async () => {
    const completeSourceSnapshot = {
      ...snapshot,
      available: {
        ...snapshot.available,
        programDurationSeconds: 1_801,
        transcriptSegments: [],
        sources: [
          { ...snapshot.available.sources[0], id: "browser_before_crash", stoppedAt: "2026-08-22T12:10:00.000Z", programOffsetSeconds: 0 },
          { ...snapshot.available.sources[0], id: "phone_continuous", startedAt: "2026-08-22T13:00:02.000Z", stoppedAt: "2026-08-22T13:30:00.000Z", programOffsetSeconds: 2 },
          { ...snapshot.available.sources[0], id: "browser_after_reconnect", startedAt: "2026-08-22T12:10:08.000Z", stoppedAt: "2026-08-22T12:29:58.000Z", programOffsetSeconds: 608 },
        ],
      },
    };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(completeSourceSnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    await userEvent.click(await screen.findByRole("button", { name: "Create private preview" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: ["phone_continuous"],
    }));
  });

  it("searches long transcripts without changing retained cuts", async () => {
    const retainedSegment = {
      ...transcriptSegment,
      segmentId: "transcript_segment_0002",
      providerTextSha256: "b".repeat(64),
      speakerLabel: "Client",
      text: "Keep the accountability plan in the shared recording.",
      startSeconds: 18,
      endSeconds: 23,
      cutStartSeconds: 18.1,
      cutEndSeconds: 22.9,
      timingFingerprint: "d".repeat(64),
    };
    const longTranscriptSnapshot = {
      ...snapshot,
      available: { ...snapshot.available, transcriptSegments: [transcriptSegment, retainedSegment] },
    };
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
      return response(longTranscriptSnapshot);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const removedPassage = await screen.findByText(transcriptSegment.text);
    const removedCheckbox = removedPassage.closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    await userEvent.click(removedCheckbox);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search recording transcript" }), "accountability");
    expect(screen.queryByText(transcriptSegment.text)).not.toBeInTheDocument();
    expect(screen.getByText(retainedSegment.text)).toBeInTheDocument();
    expect(screen.getByText(/showing 1 of 2 passages/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      excludedTranscriptSegments: [expect.objectContaining({ segmentId: transcriptSegment.segmentId })],
    }));
  });

  it("isolates removed passages without forcing a review step", async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response(snapshot)) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const passage = await screen.findByText(transcriptSegment.text);
    const passageCheckbox = passage.closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    await userEvent.click(passageCheckbox);
    await userEvent.click(screen.getByRole("button", { name: "Removed (1)" }));

    expect(screen.getByText(transcriptSegment.text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Removed (1)" })).toHaveAttribute("aria-pressed", "true");
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

  it("shares a verified private preview without forcing a listening ceremony", async () => {
    const output = {
      id: "session_output_0001",
      status: "DRAFT",
      title: "First coaching session recording",
      revision: 2,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_0001",
      playbackReview: { schema: "quipsly-session-recording-share-playback-review-v1", requiredSecondBins: [0, 15, 29], joinSecondBins: [], reviewed: false, reviewedAt: null, clientTrackedPlaybackIsNotProofOfAudibility: true },
      body: { edit: { startSeconds: 0, endSeconds: 30, transcriptExclusions: [] } },
    };
    const draft = { ...snapshot, output };
    let current = draft;
    const requests: Array<Record<string, unknown>> = [];
    global.fetch = jest.fn(async (_url, init) => {
      if (init?.method === "POST") {
        requests.push(JSON.parse(String(init.body)));
        current = { ...draft, output: { ...output, status: "RELEASED", revision: 3 } };
      }
      return response(current);
    }) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);
    const share = await screen.findByRole("button", { name: "Share with Client" });
    expect(share).toBeEnabled();
    expect(screen.getByText(/preview the edit above when useful, or share it now/i)).toBeInTheDocument();
    await userEvent.click(share);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "RELEASE",
      outputId: output.id,
      expectedRevision: 2,
    }));
    expect(await screen.findByLabelText("Shared recording")).toBeInTheDocument();
    expect(screen.getByText(/This recording is shared with Client inside this Session/)).toBeInTheDocument();
    expect(screen.queryByText(/Only you can see the preview/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Private recording preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create new private edit" })).toBeInTheDocument();
  });

  it("records optional listening evidence without turning it into a share gate", async () => {
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
    Object.defineProperties(audio, {
      duration: { configurable: true, value: 30 },
      paused: { configurable: true, value: false },
      seeking: { configurable: true, value: false },
    });
    expect(screen.getByRole("button", { name: "Share with Client" })).toBeEnabled();
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
    expect(await screen.findByText(/listening review saved for this exact private preview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share with Client" })).toBeEnabled();
  });

  it("describes a client release without claiming somebody completed an optional review", async () => {
    const output = {
      id: "session_output_released_0001",
      status: "RELEASED",
      title: "First coaching session recording",
      revision: 3,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_released_0001",
      playbackReview: { schema: "quipsly-session-recording-share-playback-review-v1", requiredSecondBins: [0, 15, 29], joinSecondBins: [], reviewed: false, reviewedAt: null, clientTrackedPlaybackIsNotProofOfAudibility: true },
      body: { edit: { startSeconds: 0, endSeconds: 30, transcriptExclusions: [] } },
    };
    global.fetch = jest.fn(async (_input: RequestInfo | URL) => response({ ...snapshot, role: "CLIENT", output })) as jest.MockedFunction<typeof fetch>;

    render(<SessionRecordingShareCard roomId="session_room_0001" />);

    expect(await screen.findByText("Your coach shared this private recording in your Session.")).toBeInTheDocument();
    expect(screen.queryByText(/released this reviewed copy/i)).not.toBeInTheDocument();
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
    await userEvent.click(screen.getByRole("button", { name: "Restore all" }));
    await userEvent.click(screen.getByRole("button", { name: "Use full recording" }));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled());
    expect(screen.getByRole("slider", { name: "Recording start" })).toHaveValue("0");
    expect(screen.getByRole("slider", { name: "Recording end" })).toHaveValue("30");
    expect(restored).toBeChecked();
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
      render: { status: "VERIFIED", durationSeconds: 26, sizeBytes: 4_000, sha256: "e".repeat(64), mediaKind: "video", contentType: "video/mp4", primaryVideoSourceId: cameraSource.id },
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
    expect(screen.getByRole("radio", { name: "video" })).toHaveAttribute("aria-checked", "true");
    const passage = screen.getByText(cameraSegment.text).closest("label")?.querySelector("input[type=checkbox]") as HTMLInputElement;
    expect(passage).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Create private preview" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual(expect.objectContaining({
      action: "PREPARE",
      sourceIds: [cameraSource.id],
      outputMediaKind: "video",
      primaryVideoSourceId: cameraSource.id,
      excludedTranscriptSegments: [expect.objectContaining({ segmentId: cameraSegment.segmentId })],
    }));
  });
});
