export type BrowserRecordingReceiptState =
  | "OBSERVED"
  | "STARTED"
  | "START_FAILED"
  | "STOPPING"
  | "STOPPED"
  | "STOP_FAILED";

export type BrowserRecordingReceiptPayload = {
  receiptId: string;
  directiveId: string;
  state: BrowserRecordingReceiptState;
  captureId: string | null;
  clientInstanceId: string;
  clientKind: "web";
  deviceLabel: string;
  detail: string | null;
  occurredAt: string;
};

export type PendingBrowserRecordingReceipt = {
  version: 1;
  ownerParticipantId: string;
  roomId: string;
  payload: BrowserRecordingReceiptPayload;
  createdAt: string;
  deliveryState: "pending" | "acknowledged" | "rejected";
  deliveredAt: string | null;
  serverError: string | null;
};

export type BrowserRecordingReceiptFlushResult = {
  acknowledgedCount: number;
  rejectedCount: number;
  pendingCount: number;
  latestError: string | null;
};

const STORAGE_PREFIX = "quipsly-recording-receipt-outbox:v1:";
const RETAINED_RESULT_MS = 24 * 60 * 60 * 1_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set<BrowserRecordingReceiptState>([
  "OBSERVED",
  "STARTED",
  "START_FAILED",
  "STOPPING",
  "STOPPED",
  "STOP_FAILED",
]);
const TERMINAL_CODES = new Set([
  "INVALID_ENDPOINT_RECEIPT",
  "PARTICIPANT_REQUIRED",
  "DIRECTIVE_NOT_FOUND",
  "RECEIPT_ID_CONFLICT",
]);
const activeFlushes = new Map<
  string,
  Promise<BrowserRecordingReceiptFlushResult>
>();

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function ownerPrefix(ownerParticipantId: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(ownerParticipantId)}:`;
}

function storageKey(ownerParticipantId: string, receiptId: string) {
  return `${ownerPrefix(ownerParticipantId)}${receiptId.toLowerCase()}`;
}

function receiptFrom(value: unknown): PendingBrowserRecordingReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  const payload = entry.payload as Record<string, unknown> | undefined;
  if (
    entry.version !== 1
    || !normalized(entry.ownerParticipantId)
    || !normalized(entry.roomId)
    || !payload
    || !UUID.test(normalized(payload.receiptId))
    || !UUID.test(normalized(payload.directiveId))
    || !STATES.has(normalized(payload.state) as BrowserRecordingReceiptState)
    || (payload.captureId != null && !UUID.test(normalized(payload.captureId)))
    || !normalized(payload.clientInstanceId)
    || payload.clientKind !== "web"
    || !normalized(payload.deviceLabel)
    || !Number.isFinite(Date.parse(normalized(payload.occurredAt)))
    || !Number.isFinite(Date.parse(normalized(entry.createdAt)))
    || !["pending", "acknowledged", "rejected"].includes(
      normalized(entry.deliveryState),
    )
    || (entry.deliveredAt != null
      && !Number.isFinite(Date.parse(normalized(entry.deliveredAt))))
  ) return null;
  return entry as PendingBrowserRecordingReceipt;
}

function readEntry(key: string) {
  const raw = window.localStorage.getItem(key);
  if (raw == null) return null;
  try {
    const entry = receiptFrom(JSON.parse(raw));
    if (!entry) throw new Error("The stored recording-status receipt is invalid.");
    return entry;
  } catch (error) {
    throw new Error(
      `Quipsly preserved an unreadable recording-status receipt instead of overwriting it. ${
        error instanceof Error ? error.message : ""
      }`.trim(),
    );
  }
}

function listKeys(ownerParticipantId: string) {
  const prefix = ownerPrefix(ownerParticipantId);
  const keys: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys.sort();
}

function persist(entry: PendingBrowserRecordingReceipt) {
  window.localStorage.setItem(
    storageKey(entry.ownerParticipantId, entry.payload.receiptId),
    JSON.stringify(entry),
  );
}

function sameRequest(
  left: PendingBrowserRecordingReceipt,
  right: PendingBrowserRecordingReceipt,
) {
  return left.ownerParticipantId === right.ownerParticipantId
    && left.roomId === right.roomId
    && JSON.stringify(left.payload) === JSON.stringify(right.payload);
}

export function enqueueBrowserRecordingReceipt(input: {
  ownerParticipantId: string;
  roomId: string;
  payload: BrowserRecordingReceiptPayload;
  createdAt?: string;
}) {
  const ownerParticipantId = normalized(input.ownerParticipantId);
  const roomId = normalized(input.roomId);
  if (!ownerParticipantId || !roomId)
    throw new Error(
      "Quipsly needs the current Session participant before saving recording status.",
    );
  const candidate = receiptFrom({
    version: 1,
    ownerParticipantId,
    roomId,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString(),
    deliveryState: "pending",
    deliveredAt: null,
    serverError: null,
  });
  if (!candidate)
    throw new Error("Quipsly refused an invalid recording-status receipt.");
  const key = storageKey(ownerParticipantId, candidate.payload.receiptId);
  const existing = readEntry(key);
  if (existing) {
    if (!sameRequest(existing, candidate))
      throw new Error(
        "That recording-status identity already belongs to different endpoint evidence.",
      );
    return existing;
  }
  persist(candidate);
  return candidate;
}

export function listBrowserRecordingReceipts(ownerParticipantId: string) {
  const owner = normalized(ownerParticipantId);
  if (!owner) return [];
  return listKeys(owner).map((key) => readEntry(key)!);
}

function pruneHandled(ownerParticipantId: string, now = Date.now()) {
  for (const key of listKeys(ownerParticipantId)) {
    const entry = readEntry(key);
    if (
      entry
      && entry.deliveryState !== "pending"
      && Date.parse(entry.deliveredAt ?? entry.createdAt)
        < now - RETAINED_RESULT_MS
    ) window.localStorage.removeItem(key);
  }
}

async function deliver(entry: PendingBrowserRecordingReceipt) {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(entry.roomId)}/recording-directive`,
    {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry.payload),
    },
  );
  const packet = await response.json().catch(() => ({}));
  if (response.ok && packet?.ok === true)
    return { kind: "acknowledged" as const, message: null };
  const message =
    packet?.error || "Recording coordination is temporarily unavailable.";
  if (
    response.status === 400
    || response.status === 404
    || TERMINAL_CODES.has(packet?.code)
  ) return { kind: "rejected" as const, message };
  return { kind: "retry" as const, message };
}

async function flushOwner(
  ownerParticipantId: string,
): Promise<BrowserRecordingReceiptFlushResult> {
  pruneHandled(ownerParticipantId);
  let acknowledgedCount = 0;
  let rejectedCount = 0;
  let latestError: string | null = null;
  const pending = listBrowserRecordingReceipts(ownerParticipantId)
    .filter((entry) => entry.deliveryState === "pending")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const entry of pending) {
    try {
      const result = await deliver(entry);
      if (result.kind === "retry") {
        latestError = result.message;
        break;
      }
      persist({
        ...entry,
        deliveryState: result.kind,
        deliveredAt: new Date().toISOString(),
        serverError: result.message,
      });
      if (result.kind === "acknowledged") acknowledgedCount += 1;
      else rejectedCount += 1;
    } catch (error) {
      latestError = error instanceof Error
        ? error.message
        : "Recording coordination is temporarily unavailable.";
      break;
    }
  }
  const pendingCount = listBrowserRecordingReceipts(ownerParticipantId)
    .filter((entry) => entry.deliveryState === "pending").length;
  return { acknowledgedCount, rejectedCount, pendingCount, latestError };
}

export function flushBrowserRecordingReceiptOutbox(input: {
  ownerParticipantId: string;
}): Promise<BrowserRecordingReceiptFlushResult> {
  const ownerParticipantId = normalized(input.ownerParticipantId);
  if (!ownerParticipantId) {
    return Promise.resolve({
      acknowledgedCount: 0,
      rejectedCount: 0,
      pendingCount: 0,
      latestError: null,
    });
  }
  const active = activeFlushes.get(ownerParticipantId);
  if (active) return active;
  const operation = flushOwner(ownerParticipantId).finally(() => {
    if (activeFlushes.get(ownerParticipantId) === operation)
      activeFlushes.delete(ownerParticipantId);
  });
  activeFlushes.set(ownerParticipantId, operation);
  return operation;
}
