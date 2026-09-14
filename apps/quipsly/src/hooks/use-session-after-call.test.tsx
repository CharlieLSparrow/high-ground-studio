import { act, renderHook, waitFor } from "@testing-library/react";
import { useSessionAfterCall } from "./use-session-after-call";

const response = (roomId = "room", uploaded = 1, status = 200) => ({ ok: status === 200, status, json: async () => ({ ok: status === 200,
  summary: { roomId, recordings: { uploaded, pending: 0, attention: 0 }, transcripts: { available: 0, processing: 0, attention: 0 }, transcriptSourceId: null } }) }) as Response;
const originalFetch = global.fetch;
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue(response()); });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

it("fetches shared availability and refreshes when this device finishes uploading", async () => {
  const view = renderHook(({ phase }) => useSessionAfterCall("room", phase), { initialProps: { phase: "uploading" } });
  await waitFor(() => expect(view.result.current.summary?.recordings.uploaded).toBe(1));
  jest.mocked(fetch).mockResolvedValue(response("room", 2));
  view.rerender({ phase: "ready" });
  await waitFor(() => expect(view.result.current.summary?.recordings.uploaded).toBe(2));
  expect(fetch).toHaveBeenCalledWith("/api/sessions/room/after-call", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
});
it("keeps valid source recovery actions and ignores malformed ones without hiding recordings", async () => {
  const packet = response();
  const body = await packet.json();
  const valid = {recordingAssetId: "source", message: "No audio signal.", retryable: false, failureCode: "NO_AUDIO_SIGNAL"};
  body.summary.transcriptIssues = [valid, null, {message: "Missing source"}, {...valid, retryable: "yes"}, {...valid, recordingAssetId: "x".repeat(241)}];
  jest.mocked(fetch).mockResolvedValue({...packet, json: async () => body} as Response);
  const view = renderHook(() => useSessionAfterCall("room"));
  await waitFor(() => expect(view.result.current.summary?.recordings.uploaded).toBe(1));
  expect(view.result.current.summary?.transcriptIssues).toEqual([valid]);
});
it("refreshes the recap after an ordinary edit and ignores malformed work without hiding media", async () => {
  const packet = response();
  const body = await packet.json();
  body.summary.followThrough = {recap: null, openTasks: 1, openGoals: 0, nextSteps: "not a list"};
  jest.mocked(fetch).mockResolvedValue({...packet, json: async () => body} as Response);
  const view = renderHook(() => useSessionAfterCall("room"));
  await waitFor(() => expect(view.result.current.summary?.recordings.uploaded).toBe(1));
  expect(view.result.current.summary?.followThrough).toBeNull();
  body.summary.followThrough = {recap: {id: "recap", title: "Edited", excerpt: "Current words", visibility: "SESSION_SHARED"}, openTasks: 0, openGoals: 0, nextSteps: []};
  await act(async () => { window.dispatchEvent(new CustomEvent("quipsly-coaching-work-changed")); });
  expect(view.result.current.summary?.followThrough?.recap?.excerpt).toBe("Current words");
});
it.each(["", 42, "x".repeat(241)])("rejects an invalid recording destination %s", async recordingSourceId => {
  const packet = response();
  const body = await packet.json();
  body.summary.recordingSourceId = recordingSourceId;
  jest.mocked(fetch).mockResolvedValue({...packet, json: async () => body} as Response);
  const view = renderHook(() => useSessionAfterCall("room"));
  await waitFor(() => expect(view.result.current.error).toContain("Couldn't refresh"));
  expect(view.result.current.summary).toBeNull();
});

it("polls for a phone upload arriving after the browser call ends", async () => {
  jest.useFakeTimers();
  jest.mocked(fetch).mockResolvedValue(response("room", 0));
  const view = renderHook(() => useSessionAfterCall("room"));
  await act(async () => {});
  expect(view.result.current.summary?.recordings.uploaded).toBe(0);
  jest.mocked(fetch).mockResolvedValue(response("room", 1));
  await act(async () => { jest.advanceTimersByTime(5_000); });
  expect(view.result.current.summary?.recordings.uploaded).toBe(1);
  view.unmount();
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("clears old-room data and ignores responses that arrive after switching sessions", async () => {
  let finish!: (value: Response) => void;
  jest.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = renderHook(({ room }) => useSessionAfterCall(room), { initialProps: { room: "room" } });
  const signal = jest.mocked(fetch).mock.calls[0][1]?.signal;
  jest.mocked(fetch).mockResolvedValue(response("other", 2));
  view.rerender({ room: "other" });
  expect(signal?.aborted).toBe(true);
  await waitFor(() => expect(view.result.current.summary?.recordings.uploaded).toBe(2));
  await act(async () => { finish(response("room", 99)); });
  expect(view.result.current.summary?.roomId).toBe("other");
});

it.each([401, 403, 404])("clears availability and stops background retry after access failure %s", async status => {
  jest.useFakeTimers();
  const view = renderHook(() => useSessionAfterCall("room"));
  await act(async () => {});
  jest.mocked(fetch).mockResolvedValue(response("room", 0, status));
  await act(async () => { jest.advanceTimersByTime(5_000); });
  expect(view.result.current.summary).toBeNull();
  expect(view.result.current.error).toMatch(/account|Sign in/);
  await act(async () => { jest.advanceTimersByTime(120_000); });
  expect(fetch).toHaveBeenCalledTimes(2);
  jest.mocked(fetch).mockResolvedValue(response("room", 3));
  await act(async () => { view.result.current.retry(); });
  expect(view.result.current.summary?.recordings.uploaded).toBe(3);
});

it.each([response("wrong-room"), response("room", -1), { ok: true, status: 200, json: async () => ({ok: true}) } as Response])("rejects mismatched or malformed availability", async packet => {
  jest.mocked(fetch).mockResolvedValue(packet);
  const view = renderHook(() => useSessionAfterCall("room"));
  await waitFor(() => expect(view.result.current.error).toContain("Couldn't refresh"));
  expect(view.result.current.summary).toBeNull();
});

it("backs off after network failure and offers an immediate retry without changing media", async () => {
  jest.useFakeTimers();
  jest.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
  const view = renderHook(() => useSessionAfterCall("room"));
  await act(async () => {});
  expect(view.result.current.error).toContain("Couldn't refresh");
  await act(async () => { jest.advanceTimersByTime(9_000); });
  expect(fetch).toHaveBeenCalledTimes(1);
  jest.mocked(fetch).mockResolvedValue(response());
  await act(async () => { view.result.current.retry(); });
  expect(view.result.current.error).toBeNull();
  expect(view.result.current.summary?.recordings.uploaded).toBe(1);
  expect(jest.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
