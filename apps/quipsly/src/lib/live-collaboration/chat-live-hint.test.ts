import {
  CHAT_PERSISTED_LIVE_HINT_SCHEMA,
  chatPersistedLiveHint,
  decodeChatPersistedLiveHint,
  encodeChatPersistedLiveHint,
  episodeChatThreadKey,
  parseChatPersistedLiveHint,
  sessionChatThreadKey,
} from "./chat-live-hint";

describe("durable chat live hint", () => {
  it("carries only the durable message identity needed for an authenticated refresh", () => {
    const hint = chatPersistedLiveHint(
      "session:room-1",
      "message_1",
      "2026-08-05T06:00:00.000Z",
    );

    expect(hint).toEqual({
      schema: CHAT_PERSISTED_LIVE_HINT_SCHEMA,
      threadKey: "session:room-1",
      messageId: "message_1",
      persistedAt: "2026-08-05T06:00:00.000Z",
    });
    expect(hint).not.toHaveProperty("body");
    expect(hint).not.toHaveProperty("authorEmail");
  });

  it("decodes only the exact Session thread", () => {
    const hint = chatPersistedLiveHint("session:room-1", "message_1");
    expect(hint).not.toBeNull();

    const payload = encodeChatPersistedLiveHint(hint!);
    expect(decodeChatPersistedLiveHint(payload, "session:room-1")).toEqual(hint);
    expect(decodeChatPersistedLiveHint(payload, "session:room-2")).toBeNull();
  });

  it("rejects malformed, oversized, and content-bearing authority substitutes", () => {
    expect(sessionChatThreadKey("room-1")).toBe("session:room-1");
    expect(episodeChatThreadKey("episode-8")).toBe("episode:episode-8");
    expect(sessionChatThreadKey("bad room")).toBeNull();
    expect(parseChatPersistedLiveHint({
      schema: CHAT_PERSISTED_LIVE_HINT_SCHEMA,
      threadKey: "session:room-1",
      messageId: "message_1",
      persistedAt: "not-a-date",
    })).toBeNull();
    expect(decodeChatPersistedLiveHint(new Uint8Array(2_049), "session:room-1")).toBeNull();
    expect(decodeChatPersistedLiveHint(new TextEncoder().encode(JSON.stringify({
      schema: CHAT_PERSISTED_LIVE_HINT_SCHEMA,
      threadKey: "session:room-1",
      messageId: "message_1",
      persistedAt: new Date().toISOString(),
      body: "Untrusted call-room content",
    })), "session:room-1")).toBeNull();
  });
});
