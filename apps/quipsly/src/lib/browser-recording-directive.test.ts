/** @jest-environment jsdom */

import {
  acknowledgeBrowserRecordingDirective,
  issueBrowserRecordingDirective,
  projectBrowserRecordingHealth,
  readBrowserRecordingDirective,
  type BrowserRecordingDirective,
} from "./browser-recording-directive";

jest.mock("@/lib/browser-client-instance", () => ({
  browserClientInstanceId: () => "browser-installation-1",
}));

describe("browser recording directive client", () => {
  const originalFetch = global.fetch;
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reduces complete participant evidence to one calm recording message", () => {
    const directive = {
      action: "START",
      participantStatuses: [
        {
          id: "participant-a",
          participantLabel: "Coach Taylor",
          state: "RECORDING",
          endpointCount: 1,
          recordingEndpointCount: 1,
          attentionEndpointCount: 0,
        },
        {
          id: "participant-b",
          participantLabel: "Jordan Client",
          state: "RECORDING",
          endpointCount: 1,
          recordingEndpointCount: 1,
          attentionEndpointCount: 0,
        },
      ],
      recordingHealth: {
        expectedParticipantCount: 2,
        participantWithEndpointCount: 2,
        recordingParticipantCount: 2,
        attentionParticipantCount: 0,
        waitingParticipantCount: 0,
        allParticipantsRecording: true,
        allParticipantsStoppedSafely: false,
      },
    } as BrowserRecordingDirective;

    expect(projectBrowserRecordingHealth(directive)).toMatchObject({
      title: "Everyone is recording",
      tone: "ready",
      participants: [
        { participantLabel: "Coach Taylor", label: "Recording" },
        { participantLabel: "Jordan Client", label: "Recording" },
      ],
    });
  });

  it("keeps a silent recorder visible as an expected person", () => {
    const directive = {
      action: "START",
      participantStatuses: [
        {
          id: "participant-a",
          participantLabel: "Coach Taylor",
          state: "RECORDING",
          endpointCount: 1,
          recordingEndpointCount: 1,
          attentionEndpointCount: 0,
        },
        {
          id: "participant-b",
          participantLabel: "Jordan Client",
          state: "WAITING",
          endpointCount: 0,
          recordingEndpointCount: 0,
          attentionEndpointCount: 0,
        },
      ],
      recordingHealth: {
        expectedParticipantCount: 2,
        participantWithEndpointCount: 1,
        recordingParticipantCount: 1,
        attentionParticipantCount: 0,
        waitingParticipantCount: 1,
        allParticipantsRecording: false,
        allParticipantsStoppedSafely: false,
      },
    } as BrowserRecordingDirective;

    expect(projectBrowserRecordingHealth(directive)).toMatchObject({
      title: "Waiting for 1 person",
      tone: "waiting",
      participants: [
        {},
        { participantLabel: "Jordan Client", label: "Waiting for recorder" },
      ],
    });
  });

  it("turns failed endpoint evidence into one recovery-oriented warning", () => {
    const directive = {
      action: "START",
      participantStatuses: [
        {
          id: "participant-b",
          participantLabel: "Jordan Client",
          state: "NEEDS_ATTENTION",
          endpointCount: 1,
          recordingEndpointCount: 0,
          attentionEndpointCount: 1,
        },
      ],
      recordingHealth: {
        expectedParticipantCount: 1,
        participantWithEndpointCount: 1,
        recordingParticipantCount: 0,
        attentionParticipantCount: 1,
        waitingParticipantCount: 0,
        allParticipantsRecording: false,
        allParticipantsStoppedSafely: false,
      },
    } as BrowserRecordingDirective;

    expect(projectBrowserRecordingHealth(directive)).toMatchObject({
      title: "1 person needs attention",
      tone: "attention",
      participants: [{ label: "Needs attention" }],
    });
  });

  it("reads the latest private coordination intent", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        directive: { id: "directive-1", action: "START" },
      }),
    }) as typeof fetch;
    expect(await readBrowserRecordingDirective("room 1")).toMatchObject({
      id: "directive-1",
      action: "START",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/sessions/room%201/recording-directive",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("issues one explicit controller action", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        directive: { id: "directive-1", action: "STOP" },
      }),
    }) as typeof fetch;
    await issueBrowserRecordingDirective("room-1", "STOP");
    expect(
      JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body)),
    ).toMatchObject({
      action: "STOP",
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("retries the exact durable endpoint receipt identity", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    }) as typeof fetch;
    const input = {
      roomId: "room-1",
      directiveId: "directive-1",
      state: "STARTED" as const,
      captureId: "capture-1",
    };
    await acknowledgeBrowserRecordingDirective(input);
    await acknowledgeBrowserRecordingDirective(input);
    const first = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[0][1].body),
    );
    const second = JSON.parse(
      String((global.fetch as jest.Mock).mock.calls[1][1].body),
    );
    expect(first).toMatchObject({
      clientInstanceId: "browser-installation-1",
      clientKind: "web",
      state: "STARTED",
      captureId: "capture-1",
    });
    expect(second.receiptId).toBe(first.receiptId);
  });
});
