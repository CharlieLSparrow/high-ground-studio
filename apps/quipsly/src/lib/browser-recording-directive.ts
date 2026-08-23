import { browserClientInstanceId } from "@/lib/browser-client-instance";

export type BrowserRecordingDirective = {
  id: string;
  sequence: string;
  action: "START" | "STOP";
  captureGroupId: string;
  issuedAt: string;
  shouldRecord: boolean;
  participantStatuses: BrowserParticipantRecordingStatus[];
  recordingHealth: BrowserRecordingHealth;
  endpointReceipts: Array<{
    id: string;
    clientKind: string;
    deviceLabel: string;
    participantLabel: string;
    state: string;
    captureId: string | null;
    detail: string | null;
    occurredAt: string;
    receivedAt: string;
  }>;
};

export type BrowserParticipantRecordingStatus = {
  id: string;
  participantLabel: string;
  state:
    | "RECORDING"
    | "GETTING_READY"
    | "NEEDS_ATTENTION"
    | "STOPPING"
    | "STOPPED_SAFELY"
    | "WAITING";
  endpointCount: number;
  recordingEndpointCount: number;
  attentionEndpointCount: number;
};

export type BrowserRecordingHealth = {
  expectedParticipantCount: number;
  participantWithEndpointCount: number;
  recordingParticipantCount: number;
  attentionParticipantCount: number;
  waitingParticipantCount: number;
  allParticipantsRecording: boolean;
  allParticipantsStoppedSafely: boolean;
};

export function projectBrowserRecordingHealth(
  directive: BrowserRecordingDirective,
) {
  const health = directive.recordingHealth;
  const attentionCount = health.attentionParticipantCount;
  const waitingCount = health.waitingParticipantCount;
  let title = "Recording status";
  let detail = "Quipsly is checking each participant's recording.";
  let tone: "ready" | "waiting" | "attention" = "waiting";

  if (attentionCount > 0) {
    title = `${attentionCount} ${attentionCount === 1 ? "person needs" : "people need"} attention`;
    detail = "Open the participant status below for the recovery step.";
    tone = "attention";
  } else if (directive.action === "START" && health.allParticipantsRecording) {
    title = "Everyone is recording";
    detail = "Each expected participant has a local source in progress.";
    tone = "ready";
  } else if (
    directive.action === "STOP" &&
    health.allParticipantsStoppedSafely
  ) {
    title = "Everyone stopped safely";
    detail = "Each expected recorder confirmed its local stop.";
    tone = "ready";
  } else if (waitingCount > 0) {
    title =
      directive.action === "START"
        ? `Waiting for ${waitingCount} ${waitingCount === 1 ? "person" : "people"}`
        : `Finishing ${waitingCount} ${waitingCount === 1 ? "recording" : "recordings"}`;
    detail =
      directive.action === "START"
        ? "The call can continue while Quipsly gets their recorder ready."
        : "Keep this Session open while Quipsly finishes safely.";
  }

  return {
    title,
    detail,
    tone,
    participants: directive.participantStatuses.map((participant) => ({
      ...participant,
      label:
        participant.state === "RECORDING"
          ? "Recording"
          : participant.state === "GETTING_READY"
            ? "Getting ready"
            : participant.state === "NEEDS_ATTENTION"
              ? "Needs attention"
              : participant.state === "STOPPING"
                ? "Saving safely"
                : participant.state === "STOPPED_SAFELY"
                  ? "Stopped safely"
                  : directive.action === "START"
                    ? "Waiting for recorder"
                    : "Waiting for safe stop",
    })),
  };
}

function receiptId(roomId: string, directiveId: string, state: string) {
  const key = `quipsly-recording-directive-receipt:${roomId}:${directiveId}:${state}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

async function packet(response: Response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok || value?.ok !== true)
    throw new Error(
      value?.error || "Recording coordination is temporarily unavailable.",
    );
  return value;
}

export async function readBrowserRecordingDirective(
  roomId: string,
): Promise<BrowserRecordingDirective | null> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(roomId)}/recording-directive`,
    { cache: "no-store", credentials: "same-origin" },
  );
  return (await packet(response)).directive ?? null;
}

export async function issueBrowserRecordingDirective(
  roomId: string,
  action: "START" | "STOP",
): Promise<BrowserRecordingDirective> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(roomId)}/recording-directive`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), action }),
    },
  );
  return (await packet(response)).directive;
}

export async function acknowledgeBrowserRecordingDirective(input: {
  roomId: string;
  directiveId: string;
  state:
    | "OBSERVED"
    | "STARTED"
    | "START_FAILED"
    | "STOPPING"
    | "STOPPED"
    | "STOP_FAILED";
  captureId?: string | null;
  detail?: string | null;
}) {
  const clientInstanceId = browserClientInstanceId();
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(input.roomId)}/recording-directive`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receiptId: receiptId(input.roomId, input.directiveId, input.state),
        directiveId: input.directiveId,
        state: input.state,
        captureId: input.captureId || null,
        clientInstanceId,
        clientKind: "web",
        deviceLabel: navigator.platform
          ? `Quipsly Web · ${navigator.platform}`
          : "Quipsly Web",
        detail: input.detail || null,
      }),
    },
  );
  return packet(response);
}
