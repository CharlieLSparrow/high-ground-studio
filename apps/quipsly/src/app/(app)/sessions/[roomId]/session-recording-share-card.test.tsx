import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText(/1 passage removed with short click-safe joins/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Prepare private preview" }));
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
});
