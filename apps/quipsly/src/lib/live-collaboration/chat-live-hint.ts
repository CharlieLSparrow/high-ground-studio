export const CHAT_PERSISTED_LIVE_HINT_SCHEMA = "quipsly-chat-persisted-hint.v1" as const;
export const CHAT_PERSISTED_LIVE_TOPIC = "quipsly.chat.persisted.v1" as const;
export const CHAT_PERSISTED_OUTGOING_EVENT = "quipsly:chat-persisted-outgoing" as const;
export const CHAT_PERSISTED_INCOMING_EVENT = "quipsly:chat-persisted-incoming" as const;

const MAX_HINT_BYTES = 2_048;
const THREAD_KEY_PATTERN = /^[a-zA-Z0-9:_-]{1,192}$/;
const MESSAGE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,192}$/;

export type ChatPersistedLiveHint = {
  schema: typeof CHAT_PERSISTED_LIVE_HINT_SCHEMA;
  threadKey: string;
  messageId: string;
  persistedAt: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validIso(value: string) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

export function sessionChatThreadKey(callRoomId: string) {
  const roomId = callRoomId.trim();
  const threadKey = `session:${roomId}`;
  return roomId && THREAD_KEY_PATTERN.test(threadKey) ? threadKey : null;
}

export function episodeChatThreadKey(episodeSlug: string) {
  const slug = episodeSlug.trim();
  const threadKey = `episode:${slug}`;
  return slug && THREAD_KEY_PATTERN.test(threadKey) ? threadKey : null;
}

export function chatPersistedLiveHint(
  threadKey: string,
  messageId: string,
  persistedAt = new Date().toISOString(),
): ChatPersistedLiveHint | null {
  return parseChatPersistedLiveHint({
    schema: CHAT_PERSISTED_LIVE_HINT_SCHEMA,
    threadKey,
    messageId,
    persistedAt,
  }, threadKey);
}

export function parseChatPersistedLiveHint(
  value: unknown,
  expectedThreadKey?: string,
): ChatPersistedLiveHint | null {
  const row = record(value);
  const allowedKeys = new Set(["schema", "threadKey", "messageId", "persistedAt"]);
  if (Object.keys(row).some((key) => !allowedKeys.has(key))) return null;
  const hint: ChatPersistedLiveHint = {
    schema: text(row.schema) as typeof CHAT_PERSISTED_LIVE_HINT_SCHEMA,
    threadKey: text(row.threadKey),
    messageId: text(row.messageId),
    persistedAt: text(row.persistedAt),
  };
  if (
    hint.schema !== CHAT_PERSISTED_LIVE_HINT_SCHEMA
    || !THREAD_KEY_PATTERN.test(hint.threadKey)
    || !MESSAGE_ID_PATTERN.test(hint.messageId)
    || !validIso(hint.persistedAt)
    || (expectedThreadKey !== undefined && hint.threadKey !== expectedThreadKey)
  ) return null;
  return hint;
}

export function encodeChatPersistedLiveHint(hint: ChatPersistedLiveHint) {
  return new TextEncoder().encode(JSON.stringify(hint));
}

export function decodeChatPersistedLiveHint(
  payload: Uint8Array,
  expectedThreadKey: string,
) {
  if (payload.byteLength < 2 || payload.byteLength > MAX_HINT_BYTES) return null;
  try {
    return parseChatPersistedLiveHint(
      JSON.parse(new TextDecoder().decode(payload)),
      expectedThreadKey,
    );
  } catch {
    return null;
  }
}

export function dispatchChatPersistedOutgoing(hint: ChatPersistedLiveHint) {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(CHAT_PERSISTED_OUTGOING_EVENT, { detail: hint }));
  return true;
}

export function dispatchChatPersistedIncoming(hint: ChatPersistedLiveHint) {
  if (typeof window === "undefined") return false;
  window.dispatchEvent(new CustomEvent(CHAT_PERSISTED_INCOMING_EVENT, { detail: hint }));
  return true;
}
