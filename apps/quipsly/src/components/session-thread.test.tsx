import { act, fireEvent, render, screen } from "@testing-library/react";

import { SessionThread } from "./session-thread";
import {
  CHAT_PERSISTED_OUTGOING_EVENT,
  chatPersistedLiveHint,
  dispatchChatPersistedIncoming,
} from "@/lib/live-collaboration/chat-live-hint";

describe("SessionThread", () => {
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

  it("makes the recording-Session thread distinct from the episode-wide thread", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="high-ground"
        roomId="room-1"
        sessionTitle="Episode 5 take"
        scopeLabel="This recording Session only"
        scopeDescription="Use the Episode thread for the long-lived production conversation."
      />);
      await Promise.resolve();
    });

    expect(screen.getByText("This recording Session only")).toBeInTheDocument();
    expect(screen.getByText(/Episode thread for the long-lived production conversation/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write to everyone in this Session…")).toBeEnabled();
  });

  it("keeps a view-only collaborator from composing a message", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="high-ground"
        roomId="room-2"
        sessionTitle="Episode 5 take"
        canPost={false}
      />);
      await Promise.resolve();
    });

    expect(screen.getByPlaceholderText("View-only Session thread")).toBeDisabled();
    expect(screen.getByText(/editor access is required to post/i)).toBeInTheDocument();
  });

  it("uses purpose-neutral default scope language", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="coaching"
        roomId="room-3"
        sessionTitle="Retained coaching follow-up"
      />);
      await Promise.resolve();
    });

    expect(screen.getByText(/Reviewed notes, goals, tasks, and outputs stay in their dedicated Session tools/i)).toBeInTheDocument();
    expect(screen.queryByText(/Episode-wide production/i)).not.toBeInTheDocument();
  });

  it("announces only a persisted message identity after the durable POST succeeds", async () => {
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockImplementation(async (_input, init) => ({
      ok: true,
      json: async () => init?.method === "POST"
        ? {
          ok: true,
          message: {
            id: "message_1",
            authorName: "Charlie",
            authorEmail: "charlie@example.test",
            body: "Ready for the take",
            gifUrl: null,
            createdAt: "2026-08-05T06:00:00.000Z",
          },
        }
        : { ok: true, messages: [] },
    }) as Response);
    const outgoing = jest.fn();
    window.addEventListener(CHAT_PERSISTED_OUTGOING_EVENT, outgoing);

    await act(async () => {
      render(<SessionThread projectSlug="high-ground" roomId="room-1" sessionTitle="Episode take" />);
      await Promise.resolve();
    });
    fireEvent.change(screen.getByPlaceholderText("Write to everyone in this Session…"), {
      target: { value: "Ready for the take" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/nest-chat", expect.objectContaining({ method: "POST" }));
    expect(outgoing).toHaveBeenCalledTimes(1);
    const detail = (outgoing.mock.calls[0]?.[0] as CustomEvent).detail;
    expect(detail).toEqual({
      schema: "quipsly-chat-persisted-hint.v1",
      threadKey: "session:room-1",
      messageId: "message_1",
      persistedAt: "2026-08-05T06:00:00.000Z",
    });
    expect(detail).not.toHaveProperty("body");
    expect(detail).not.toHaveProperty("authorEmail");
    window.removeEventListener(CHAT_PERSISTED_OUTGOING_EVENT, outgoing);
  });

  it("uses an exact live hint to refresh authenticated durable state", async () => {
    const fetchMock = globalThis.fetch as jest.MockedFunction<typeof fetch>;
    await act(async () => {
      render(<SessionThread projectSlug="coaching" roomId="room-3" sessionTitle="Coaching follow-up" />);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const hint = chatPersistedLiveHint("session:room-3", "message_2");
    expect(hint).not.toBeNull();
    await act(async () => {
      dispatchChatPersistedIncoming(hint!);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      dispatchChatPersistedIncoming(hint!);
      dispatchChatPersistedIncoming({ ...hint!, threadKey: "session:another-room" });
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
