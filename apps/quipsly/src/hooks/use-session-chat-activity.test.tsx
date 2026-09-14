import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessionChatActivity, SESSION_CHAT_READ_EVENT } from "./use-session-chat-activity";
import { chatPersistedLiveHint, dispatchChatPersistedIncoming } from "@/lib/live-collaboration/chat-live-hint";

describe("call chat activity", () => {
  const originalFetch = global.fetch;
  const response = (roomId: string, unreadCount: number, status = 200) => ({ok: status === 200, status,
    json: async () => ({ok: status === 200, room: {id: roomId}, unreadCount})}) as Response;
  beforeEach(() => {global.fetch = jest.fn().mockResolvedValue(response("room", 2));});
  afterEach(() => {global.fetch = originalFetch;});

  it("reads activity without opening or acknowledging chat, and refreshes after a persisted hint", async () => {
    const view = renderHook(() => useSessionChatActivity("room"));
    await waitFor(() => expect(view.result.current).toBe(2));
    expect(fetch).toHaveBeenCalledWith("/api/sessions/room/conversation?view=activity", expect.objectContaining({cache: "no-store"}));
    jest.mocked(fetch).mockResolvedValue(response("room", 3));
    act(() => {dispatchChatPersistedIncoming(chatPersistedLiveHint("session:other", "other")!);});
    expect(fetch).toHaveBeenCalledTimes(1);
    act(() => {dispatchChatPersistedIncoming(chatPersistedLiveHint("session:room", "new")!);});
    await waitFor(() => expect(view.result.current).toBe(3));
    expect(jest.mocked(fetch).mock.calls.every(([,init]) => !init?.method)).toBe(true);
  });

  it("clears stale-room activity immediately and ignores late responses", async () => {
    let finish!: (response: Response) => void;
    jest.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const view = renderHook(({room}) => useSessionChatActivity(room), {initialProps: {room: "room"}});
    jest.mocked(fetch).mockResolvedValue(response("other", 1));
    view.rerender({room: "other"});
    await waitFor(() => expect(view.result.current).toBe(1));
    await act(async () => {finish(response("room", 99));});
    expect(view.result.current).toBe(1);
  });

  it("refreshes after read acknowledgment and clears activity on revoked access", async () => {
    const view = renderHook(() => useSessionChatActivity("room"));
    await waitFor(() => expect(view.result.current).toBe(2));
    jest.mocked(fetch).mockResolvedValue({ok: false, status: 401, json: async () => {throw new Error("HTML sign-in response");}} as unknown as Response);
    act(() => {window.dispatchEvent(new CustomEvent(SESSION_CHAT_READ_EVENT, {detail: {roomId: "room"}}));});
    await waitFor(() => expect(view.result.current).toBe(0));
  });
});
