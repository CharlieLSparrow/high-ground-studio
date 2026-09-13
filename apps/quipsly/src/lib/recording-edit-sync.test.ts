/** @jest-environment jsdom */
import { RecordingEditSync } from "./recording-edit-sync";
import type { SavedRecordingEdit } from "./recording-edit-draft";
const state: SavedRecordingEdit = {selected: ["source"], startSeconds: 1, endSeconds: 20, title: "Session",
  outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: [], editing: true, baseOutputId: null, baseOutputRevision: null};
const ok = (revision: number) => ({ok: true, json: async () => ({ok: true, actorUserId: "coach", edit: {revision}})});
afterEach(() => { jest.useRealTimers(); });

it("serializes changes arriving during a save without losing the newest edit", async () => {
  let finish!: (value: unknown) => void;
  const fetchMock = jest.fn().mockImplementationOnce(() => new Promise(resolve => {finish = resolve;})).mockResolvedValue(ok(2));
  global.fetch = fetchMock;
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set(state);
  const saving = sync.flush();
  sync.set({...state, startSeconds: 4});
  finish(ok(1));
  await saving;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({expectedRevision: 1, state: {startSeconds: 4}});
  expect(sync.revision).toBe(2);
  expect(sync.status).toBe("saved");
});

it("retries an uncertain save with the same identity before sending newer edits", async () => {
  const fetchMock = jest.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(ok(1)).mockResolvedValue(ok(2));
  global.fetch = fetchMock;
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set(state);
  await sync.flush();
  expect(sync.status).toBe("error");
  sync.set({...state, title: "Latest title"});
  await sync.flush();
  expect(fetchMock.mock.calls[0][1].body).toBe(fetchMock.mock.calls[1][1].body);
  expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({expectedRevision: 1, state: {title: "Latest title"}});
  expect(sync.status).toBe("saved");
});

it("does not overwrite a newer device edit until the person chooses their current edit", async () => {
  const fetchMock = jest.fn().mockResolvedValueOnce({ok: false, status: 409, json: async () => ({ok: false, code: "RECORDING_EDIT_CONFLICT", currentRevision: 4, error: "Changed elsewhere"})}).mockResolvedValue(ok(5));
  global.fetch = fetchMock;
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set(state);
  await sync.flush();
  expect(sync.status).toBe("conflict");
  sync.set({...state, title: "My edit"});
  await sync.flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  sync.keepThisEdit();
  await sync.flush();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({expectedRevision: 4, state: {title: "My edit"}});
  expect(sync.status).toBe("saved");
});

it("does not write when restoring an unchanged saved draft", async () => {
  global.fetch = jest.fn();
  const sync = new RecordingEditSync("/draft", "coach", {revision: 2, state, updatedAt: new Date().toISOString()});
  sync.set({...state, selected: [...state.selected]});
  await sync.flush();
  expect(global.fetch).not.toHaveBeenCalled();
});

it("saves corrected input after a definite validation rejection", async () => {
  const fetchMock = jest.fn().mockResolvedValueOnce({ok: false, status: 400, json: async () => ({ok: false, error: "Invalid trim"})}).mockResolvedValue(ok(1));
  global.fetch = fetchMock;
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set({...state, endSeconds: 500});
  await sync.flush();
  sync.set(state);
  await sync.flush();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).state.endSeconds).toBe(20);
  expect(sync.status).toBe("saved");
});

it("binds every save to the account that loaded the draft", async () => {
  global.fetch = jest.fn().mockResolvedValue({ok: false, status: 409, json: async () => ({ok: false, code: "AUTH_CONTEXT_CHANGED", error: "Account changed"})});
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set(state);
  await sync.flush();
  expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).actorUserId).toBe("coach");
  expect(sync.conflictRevision).toBeNull();
  sync.keepThisEdit();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it("recovers a request that never responds instead of staying in Saving forever", async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn((_url, options) => new Promise<never>((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  })) as typeof fetch;
  const sync = new RecordingEditSync("/draft", "coach", null);
  sync.set(state);
  const saving = sync.flush();
  await jest.advanceTimersByTimeAsync(20_000);
  await saving;
  expect(sync.status).toBe("error");
  expect(sync.state).toEqual(state);
  expect(sync.error).toContain("Saving is taking too long");
});
