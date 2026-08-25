import { browserClientInstanceId } from "@/lib/browser-client-instance";
import {
  enqueueBrowserRecordingReceipt,
  flushBrowserRecordingReceiptOutbox,
  listBrowserRecordingReceipts,
  type BrowserRecordingReceiptState,
} from "@/lib/browser-recording-receipt-outbox";

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

export function browserRecordingDirectiveShouldAutoStart(input: {
  action: "START" | "STOP";
  status: string;
  retainedReady: boolean;
  terminalState?: string;
}) {
  return (
    input.action === "START" &&
    input.status === "ready" &&
    input.retainedReady &&
    (!input.terminalState || input.terminalState === "JOIN_REQUIRED")
  );
}

export function browserRecordingDirectiveCanRetry(input: {
  action: "START" | "STOP";
  status: string;
  retainedReady: boolean;
  terminalState?: string;
}) {
  return (
    input.action === "START" &&
    input.status === "error" &&
    input.retainedReady &&
    input.terminalState === "START_FAILED"
  );
}

export function projectBrowserRecordingHealth(
  directive: BrowserRecordingDirective,
) {
  const health = directive.recordingHealth;
  const attentionCount = health.attentionParticipantCount;
  const waitingCount = health.waitingParticipantCount;
  const selfOnly = directive.participantStatuses.length === 1
    && directive.participantStatuses[0]?.participantLabel === "You";
  let title = "Recording status";
  let detail = "Quipsly is checking each participant's recording.";
  let tone: "ready" | "waiting" | "attention" = "waiting";

  if (attentionCount > 0) {
    title = selfOnly
      ? "Your recording needs attention"
      : `${attentionCount} ${attentionCount === 1 ? "person needs" : "people need"} attention`;
    detail = selfOnly
      ? "Keep this browser open and retry your protected recording."
      : "Open Quipsly on the affected recording device so it can retry.";
    tone = "attention";
  } else if (directive.action === "START" && health.allParticipantsRecording) {
    title = selfOnly ? "Your recording is working" : "Everyone is recording";
    detail = selfOnly
      ? "This browser is recording your protected local source."
      : "Each expected participant has a local source in progress.";
    tone = "ready";
  } else if (
    directive.action === "STOP" &&
    health.allParticipantsStoppedSafely
  ) {
    title = selfOnly ? "Your recording is saved locally" : "Everyone’s recording is saved locally";
    detail = selfOnly
      ? "This browser confirmed that your protected local source stopped."
      : "Each expected recorder confirmed its local stop.";
    tone = "ready";
  } else if (waitingCount > 0) {
    title = selfOnly
      ? directive.action === "START"
        ? "Starting your recording"
        : "Saving your recording"
      : directive.action === "START"
          ? `Waiting for ${waitingCount} ${waitingCount === 1 ? "person" : "people"}`
          : `Finishing ${waitingCount} ${waitingCount === 1 ? "recording" : "recordings"}`;
    detail =
      selfOnly
        ? directive.action === "START"
          ? "Keep this Session open while your recorder gets ready."
          : "Keep this Session open while your recording finishes saving."
        : directive.action === "START"
        ? "The call can continue while Quipsly gets their recorder ready."
        : "Keep this Session open while the recordings finish saving.";
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
                ? "Saving recording"
                : participant.state === "STOPPED_SAFELY"
                  ? "Saved locally"
                  : directive.action === "START"
                    ? "Waiting for recorder"
                    : "Waiting to save",
    })),
  };
}

function receiptId(
  ownerParticipantId: string,
  roomId: string,
  directiveId: string,
  state: string,
) {
  const key = `quipsly-recording-directive-receipt:${ownerParticipantId}:${roomId}:${directiveId}:${state}`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const legacyKey = `quipsly-recording-directive-receipt:${roomId}:${directiveId}:${state}`;
  const legacy = window.localStorage.getItem(legacyKey);
  const created = legacy && /^[0-9a-f-]{36}$/i.test(legacy)
    ? legacy
    : crypto.randomUUID();
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
  ownerParticipantId: string;
  roomId: string;
  directiveId: string;
  state: BrowserRecordingReceiptState;
  captureId?: string | null;
  detail?: string | null;
}) {
  const clientInstanceId = browserClientInstanceId();
  const stableReceiptId = receiptId(
    input.ownerParticipantId,
    input.roomId,
    input.directiveId,
    input.state,
  );
  const existingReceipt = listBrowserRecordingReceipts(
    input.ownerParticipantId,
  ).find((entry) => entry.payload.receiptId === stableReceiptId);
  enqueueBrowserRecordingReceipt({
    ownerParticipantId: input.ownerParticipantId,
    roomId: input.roomId,
    payload: {
      receiptId: stableReceiptId,
      directiveId: input.directiveId,
      state: input.state,
      captureId: input.captureId || null,
      clientInstanceId,
      clientKind: "web",
      deviceLabel: navigator.platform
        ? `Quipsly Web · ${navigator.platform}`
        : "Quipsly Web",
      detail: input.detail || null,
      occurredAt:
        existingReceipt?.payload.occurredAt ?? new Date().toISOString(),
    },
  });
  return flushBrowserRecordingReceiptOutbox({
    ownerParticipantId: input.ownerParticipantId,
  });
}
