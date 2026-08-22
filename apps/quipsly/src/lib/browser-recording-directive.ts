import { browserClientInstanceId } from "@/lib/browser-client-instance";

export type BrowserRecordingDirective = {
  id: string;
  sequence: string;
  action: "START" | "STOP";
  captureGroupId: string;
  issuedAt: string;
  shouldRecord: boolean;
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
