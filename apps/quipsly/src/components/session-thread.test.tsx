import { act, fireEvent, render, screen } from "@testing-library/react";

import { CollaborationThread, SessionThread } from "./session-thread";
import { WorkspacePanelActivity } from "./workspace-panel-activity";
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

  it("marks visible unread conversation history once and keeps linked tasks available in view-only mode", async () => {
    const height = jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(500);
    const task = {id: "task", title: "Read the chapter", status: "OPEN"};
    jest.mocked(fetch).mockResolvedValue({ok: true, json: async () => ({ok: true, unreadCount: 1,
      capabilities: {canWrite: false}, messages: [{id: "message", body: "Read this chapter", createdAt: "2026-09-13T12:00:00Z", linkedTasks: [task]}]})} as Response);
    await act(async () => {render(<SessionThread roomId="room" sessionTitle="Session" />);});
    expect(screen.getByRole("link", {name: /Read the chapter/})).toHaveAttribute("href", "/sessions/room?mode=work#quick-entry-task");
    expect(screen.queryByRole("button", {name: "Create task"})).not.toBeInTheDocument();
    await act(async () => {jest.advanceTimersByTime(6_000);});
    const writes = jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1]!.body as string)).toEqual({action: "MARK_READ", lastReadMessageId: "message"});
    height.mockRestore();
  });

  it("returns to an exact conversation source without losing a draft or repeatedly moving focus", async () => {
    const scroll = jest.fn();
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    const underlyingMessage = document.createElement("article");
    underlyingMessage.id = `conversation-message-${message.id}`;
    underlyingMessage.tabIndex = -1;
    document.body.append(underlyingMessage);
    try {
      jest.mocked(fetch).mockResolvedValue(response({ok: true, messages: [message]}));
      const view = render(<SessionThread roomId="room-1" sessionTitle="Coaching" />);
      await act(async () => {});
      const composer = screen.getByRole("textbox", {name: "Message"});
      fireEvent.change(composer, {target: {value: "Keep my next thought"}});
      const target = {id: message.id, request: 1};
      await act(async () => {view.rerender(<SessionThread roomId="room-1" sessionTitle="Coaching" messageToOpen={target} />);});
      expect(document.activeElement?.id).toBe(`conversation-message-${message.id}`);
      expect(document.activeElement).not.toBe(underlyingMessage);
      expect(fetch).toHaveBeenCalledWith("/api/sessions/room-1/conversation?limit=50&message=message-1", {cache: "no-store"});
      expect(composer).toHaveValue("Keep my next thought");
      composer.focus();
      await act(async () => {jest.advanceTimersByTime(3000);});
      expect(composer).toHaveFocus();
      await act(async () => {view.rerender(<SessionThread roomId="room-1" sessionTitle="Coaching" messageToOpen={{...target, request: 2}} />);});
      expect(document.activeElement?.id).toBe(`conversation-message-${message.id}`);
      expect(scroll).toHaveBeenCalledTimes(2);
    } finally { HTMLElement.prototype.scrollIntoView = previous; underlyingMessage.remove(); }
  });

  it("does not mark a late fetch read after chat has been closed", async () => {
    let finish!: (result: Response) => void;
    jest.mocked(fetch).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const thread = (active: boolean) => <WorkspacePanelActivity.Provider value={active}><SessionThread roomId="room" sessionTitle="Session" /></WorkspacePanelActivity.Provider>;
    const view = render(thread(true));
    view.rerender(thread(false));
    await act(async () => {finish(response({ok: true, unreadCount: 1, messages: [message]}));});
    expect(jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("keeps incoming messages unread while reading history, then acknowledges after jumping down", async () => {
    jest.mocked(fetch).mockResolvedValue(response({ok: true, unreadCount: 0, messages: [message]}));
    await mountThread();
    const log = screen.getByRole("log");
    Object.defineProperties(log, {clientHeight: {value: 300, configurable: true}, scrollHeight: {value: 1800, configurable: true}});
    log.scrollTop = 200;
    fireEvent.scroll(log);
    jest.mocked(fetch).mockImplementation(async (_url, init) => response(init?.method === "POST"
      ? {ok: true, unreadCount: 0}
      : {ok: true, unreadCount: 1, messages: [message, {...message, id: "new", body: "A new thought", createdAt: "2026-09-13T12:00:00Z"}]}));
    await act(async () => {jest.advanceTimersByTime(3_000);});
    expect(log.scrollTop).toBe(200);
    expect(jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    await act(async () => {fireEvent.click(screen.getByRole("button", {name: "New messages"}));});
    const writes = jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1]!.body as string)).toEqual({action: "MARK_READ", lastReadMessageId: "new"});
  });

  async function mountThread() {
    await act(async () => { render(<SessionThread projectSlug="coaching" roomId="room-1" sessionTitle="Coaching" />); });
  }

  const message = { id: "message-1", body: "Ready", authorName: "Coach", authorEmail: "coach@example.test", gifUrl: null, createdAt: "2026-09-06T12:00:00Z" };
  const response = (payload: unknown) => ({ ok: true, json: async () => payload }) as Response;

  it("uses the native conversation API without requiring a Nest and honors server write access", async () => {
    jest.mocked(fetch).mockResolvedValue(response({ ok: true, messages: [{ ...message, authorName: undefined, author: { id: "coach", label: "Casey Park", isCurrentActor: false } }], capabilities: { canWrite: false } }));
    await act(async () => { render(<SessionThread roomId="room-1" sessionTitle="Coaching" />); });
    expect(fetch).toHaveBeenCalledWith("/api/sessions/room-1/conversation?limit=50", { cache: "no-store" });
    expect(screen.getByText("Casey Park")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Message" })).toBeDisabled();
  });

  it("sends replies and keeps a newer edit when an older poll arrives", async () => {
    const own = { ...message, revision: 1, canEdit: true, author: { id: "coach", label: "Casey", isCurrentActor: true } };
    jest.mocked(fetch).mockResolvedValue(response({ ok: true, messages: [own] }));
    await mountThread();
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "I agree" } });
    jest.mocked(fetch).mockResolvedValueOnce(response({ ok: true, message: { ...own, id: "reply-1", body: "I agree", canEdit: false, replyTo: { id: own.id, body: own.body, authorLabel: "Casey" } } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    const send = jest.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(send[1]!.body as string)).toMatchObject({ body: "I agree", replyToId: own.id, clientRequestId: expect.any(String) });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit message" }), { target: { value: "Ready tomorrow" } });
    jest.mocked(fetch).mockResolvedValueOnce(response({ ok: true, message: { ...own, body: "Ready tomorrow", revision: 2 } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    const edit = jest.mocked(fetch).mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(edit[1]!.body as string)).toEqual({ messageId: own.id, expectedRevision: 1, body: "Ready tomorrow" });
    await act(async () => { jest.advanceTimersByTime(3_000); });
    expect(screen.getByText("Ready tomorrow")).toBeVisible();
  });

  it("fits the call panel with an independently scrolling log and a retained composer", async () => {
    await act(async () => { render(<SessionThread projectSlug="coaching" roomId="room-1" sessionTitle="Coaching" heading="Chat" fillHeight />); });
    expect(screen.getByRole("region", { name: "Chat" })).toHaveClass("h-full", "min-h-0");
    expect(screen.getByRole("region", { name: "Chat" })).not.toHaveClass("min-h-[30rem]");
    expect(screen.getByRole("log", { name: "Chat" })).toHaveClass("overflow-y-auto", "flex-1");
    expect(screen.getByRole("log", { name: "Chat" })).not.toHaveClass("max-h-[32rem]");
    expect(screen.getByRole("textbox", { name: "Message" }).closest("form")).toHaveClass("shrink-0");
  });

  it("pauses hidden-panel polling and refreshes on return without losing a draft", async () => {
    const thread = (active: boolean) => <WorkspacePanelActivity.Provider value={active}>
      <SessionThread projectSlug="coaching" roomId="room-1" sessionTitle="Coaching" />
    </WorkspacePanelActivity.Provider>;
    const view = render(thread(false));
    await act(async () => { jest.advanceTimersByTime(9_000); });
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => { view.rerender(thread(true)); });
    expect(fetch).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("textbox", {name: "Message"}), {target: {value: "Keep this thought"}});
    await act(async () => { view.rerender(thread(false)); });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      const hint = chatPersistedLiveHint("session:room-1", "later");
      expect(hint).not.toBeNull();
      dispatchChatPersistedIncoming(hint!);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    jest.mocked(fetch).mockResolvedValue(response({ok: true, messages: [message]}));
    await act(async () => { view.rerender(thread(true)); });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Ready")).toBeVisible();
    expect(screen.getByRole("textbox", {name: "Message"})).toHaveValue("Keep this thought");
  });

  it("keeps a send acknowledgment when its panel becomes hidden", async () => {
    let finish!: (result: Response) => void;
    jest.mocked(fetch).mockImplementation((_url, init) => init?.method === "POST"
      ? new Promise(resolve => { finish = resolve; })
      : Promise.resolve(response({ok: true, messages: []})));
    const thread = (active: boolean) => <WorkspacePanelActivity.Provider value={active}>
      <SessionThread projectSlug="coaching" roomId="room-1" sessionTitle="Coaching" />
    </WorkspacePanelActivity.Provider>;
    const view = render(thread(true));
    await act(async () => {});
    fireEvent.change(screen.getByRole("textbox"), {target: {value: "Ready"}});
    fireEvent.click(screen.getByRole("button", {name: "Send collaboration message"}));
    await act(async () => { view.rerender(thread(false)); });
    await act(async () => { finish(response({ok: true, message})); });
    await act(async () => { view.rerender(thread(true)); });
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getAllByText("Ready")).toHaveLength(1);
    expect(jest.mocked(fetch).mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

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
    expect(screen.getByRole("alert")).toHaveTextContent("Your draft is retained");
    await act(async () => { jest.advanceTimersByTime(3_000); });
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send collaboration message" })); });
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(JSON.parse(posts[0][1].body).clientRequestId).toEqual(expect.any(String));
    expect(JSON.parse(posts[0][1].body).clientRequestId).toBe(JSON.parse(posts[1][1].body).clientRequestId);
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
    expect(screen.getByText("View-only conversation")).toBeInTheDocument();
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

    expect(fetchMock).toHaveBeenCalledWith("/api/sessions/room-1/conversation", expect.objectContaining({ method: "POST" }));
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
