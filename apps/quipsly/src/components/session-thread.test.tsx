import { act, fireEvent, render, screen } from "@testing-library/react";

import { CollaborationThread, SessionThread } from "./session-thread";
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

  async function mountThread() {
    await act(async () => { render(<SessionThread projectSlug="coaching" roomId="room-1" sessionTitle="Coaching" />); });
  }

  const message = { id: "message-1", body: "Ready", authorName: "Coach", authorEmail: "coach@example.test", gifUrl: null, createdAt: "2026-09-06T12:00:00Z" };
  const response = (payload: unknown) => ({ ok: true, json: async () => payload }) as Response;

  it("keeps failed text and reuses its request identity after an uncertain save", async () => {
    const fetchMock = globalThis.fetch as jest.Mock;
    let attempts = 0;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method !== "POST") return response({ ok: true, messages: [] });
      if (++attempts === 1) throw new Error("Connection lost");
      return response({ ok: true, message });
    });
    await mountThread();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Ready" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    expect(screen.getByRole("textbox")).toHaveValue("Ready");
    expect(screen.getByRole("alert")).toHaveTextContent("Your text is still here");
    await act(async () => { jest.advanceTimersByTime(3_000); });
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(posts[0][1].body).clientMessageId).toBe(JSON.parse(posts[1][1].body).clientMessageId);
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getAllByText("Ready")).toHaveLength(1);
  });

  it("does not let a successful poll unlock an in-flight send", async () => {
    let finish!: (result: Response) => void;
    (globalThis.fetch as jest.Mock).mockImplementation((_url, init) => init?.method === "POST"
      ? new Promise((resolve) => { finish = resolve; })
      : Promise.resolve(response({ ok: true, messages: [] })));
    await mountThread();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ready" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    await act(async () => { jest.advanceTimersByTime(3_000); });
    expect(screen.getByRole("button", { name: "Send collaboration message" })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    await act(async () => { finish(response({ ok: true, message })); });
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("retains an acknowledged message when an older poll returns afterward", async () => {
    let finishPoll!: (result: Response) => void;
    let reads = 0;
    (globalThis.fetch as jest.Mock).mockImplementation((_url, init) => {
      if (init?.method === "POST") return Promise.resolve(response({ ok: true, message }));
      if (++reads === 1) return Promise.resolve(response({ ok: true, messages: [] }));
      return new Promise((resolve) => { finishPoll = resolve; });
    });
    await mountThread();
    await act(async () => { jest.advanceTimersByTime(3_000); });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ready" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    await act(async () => { finishPoll(response({ ok: true, messages: [] })); });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("clears the previous space's messages and draft on a scope change, including late reads", async () => {
    let finishOldRead!: (result: Response) => void;
    (globalThis.fetch as jest.Mock).mockImplementation((url) => String(url).includes("first")
      ? new Promise((resolve) => { finishOldRead = resolve; })
      : Promise.resolve(response({ ok: true, messages: [] })));
    const view = render(<CollaborationThread projectSlug="first" threadKey="default" collaborationTitle="First" />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Private draft" } });
    await act(async () => { view.rerender(<CollaborationThread projectSlug="second" threadKey="default" collaborationTitle="Second" />); });
    await act(async () => { finishOldRead(response({ ok: true, messages: [message] })); });
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("loads older history and preserves it through live refreshes", async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (url) => response(String(url).includes("cursor=")
      ? { ok: true, messages: [{ ...message, id: "older", body: "Earlier context", createdAt: "2026-09-05T12:00:00Z" }], nextCursor: null }
      : { ok: true, messages: [message], nextCursor: message.id }));
    await mountThread();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Earlier messages" })); });
    await act(async () => { jest.advanceTimersByTime(3_000); });
    expect(screen.getByText("Earlier context")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Earlier messages" })).not.toBeInTheDocument();
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

    expect(screen.getByText(/Your notes, tasks, and recording stay together in this Session/i)).toBeInTheDocument();
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
