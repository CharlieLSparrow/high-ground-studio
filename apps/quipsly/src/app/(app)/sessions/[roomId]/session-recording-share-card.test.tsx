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
    sources: [{ id: "recording_asset_0001", participantLabel: "Coach", kind: "LOCAL_AUDIO", fileName: "coach.webm", sizeBytes: 4_000, startedAt: "2026-08-22T12:00:00.000Z", stoppedAt: "2026-08-22T12:00:30.000Z", programOffsetSeconds: 0 }],
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
      revision: 1,
      contentSha256: "d".repeat(64),
      recipient: { id: "client_user_0001", label: "Client" },
      render: { status: "VERIFIED", durationSeconds: 30, sizeBytes: 4_000, sha256: "e".repeat(64) },
      mediaUrl: "/api/sessions/session_room_0001/recording-share/media/session_output_0001",
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
      expectedRevision: 1,
    }));
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
});
