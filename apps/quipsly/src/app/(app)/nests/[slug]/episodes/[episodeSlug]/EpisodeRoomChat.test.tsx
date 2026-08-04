import { act, fireEvent, render, screen } from "@testing-library/react";

import {
  CHAT_PERSISTED_OUTGOING_EVENT,
  chatPersistedLiveHint,
  dispatchChatPersistedIncoming,
} from "@/lib/live-collaboration/chat-live-hint";

import EpisodeRoomChat from "./EpisodeRoomChat";

describe("EpisodeRoomChat live durability bridge", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, messages: [] }),
    }) as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("announces a safe episode hint only after the durable message exists", async () => {
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockImplementation(async (_input, init) => ({
      ok: true,
      json: async () => init?.method === "POST"
        ? {
          ok: true,
          message: {
            id: "episode_message_1",
            authorName: "Homer",
            authorEmail: "homer@example.test",
            body: "Clip two is ready",
            gifUrl: null,
            createdAt: "2026-08-05T06:30:00.000Z",
          },
        }
        : { ok: true, messages: [] },
    }) as Response);
    const outgoing = jest.fn();
    window.addEventListener(CHAT_PERSISTED_OUTGOING_EVENT, outgoing);

    await act(async () => {
      render(<EpisodeRoomChat projectSlug="high-ground" episodeSlug="episode-8" canEdit />);
      await Promise.resolve();
    });
    fireEvent.change(screen.getByPlaceholderText("Write to the episode thread…"), {
      target: { value: "Clip two is ready" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send episode message" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(outgoing).toHaveBeenCalledTimes(1);
    const detail = (outgoing.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({
      schema: "quipsly-chat-persisted-hint.v1",
      threadKey: "episode:episode-8",
      messageId: "episode_message_1",
      persistedAt: "2026-08-05T06:30:00.000Z",
    });
    expect(detail).not.toHaveProperty("body");
    expect(detail).not.toHaveProperty("authorEmail");
    window.removeEventListener(CHAT_PERSISTED_OUTGOING_EVENT, outgoing);
  });

  it("refreshes only for the exact episode thread and deduplicates the hint", async () => {
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    await act(async () => {
      render(<EpisodeRoomChat projectSlug="high-ground" episodeSlug="episode-8" canEdit />);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const hint = chatPersistedLiveHint("episode:episode-8", "episode_message_2");
    expect(hint).not.toBeNull();
    await act(async () => {
      dispatchChatPersistedIncoming(hint!);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      dispatchChatPersistedIncoming(hint!);
      dispatchChatPersistedIncoming({ ...hint!, threadKey: "episode:episode-9" });
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
