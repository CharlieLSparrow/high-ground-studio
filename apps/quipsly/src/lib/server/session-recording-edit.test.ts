/** @jest-environment node */
jest.mock("server-only", () => ({}));
jest.mock("./session-recording-share", () => ({...jest.requireActual("./session-recording-share"), readSessionRecordingEditSources: jest.fn()}));
import { readSessionRecordingEditSources, SessionRecordingShareError } from "./session-recording-share";
import { readSessionRecordingEdit, saveSessionRecordingEdit } from "./session-recording-edit";
const read = readSessionRecordingEditSources as jest.Mock;
const input = {roomId: "room", takeId: "start:take", actor: {id: "coach"}, expectedRevision: 0, clientRequestId: "11111111-1111-4111-8111-111111111111",
  state: {selected: ["source"], startSeconds: 1, endSeconds: 20, title: "Session", outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: ["job:segment"], editing: true, baseOutputId: null, baseOutputRevision: null}};
const workspace = {role: "COACH", available: {selectedTakeId: "start:take", programDurationSeconds: 30, sources: [{id: "source"}], transcriptSegments: [{transcriptJobId: "job", segmentId: "segment"}]}};
function database() {
  const rows = new Map<string, any>();
  const key = (value: any) => [value.roomId, value.userId, value.takeId].join("|");
  const model = {
    findUnique: jest.fn(async ({where}) => rows.get(key(where.roomId_userId_takeId)) ?? null),
    create: jest.fn(async ({data}) => { if (rows.has(key(data))) throw Object.assign(new Error("exists"), {code: "P2002"});
      const row = {...data, updatedAt: new Date()}; rows.set(key(data), row); return row; }),
    updateMany: jest.fn(async ({where, data}) => { const row = rows.get(key(where)); if (!row || row.revision !== where.revision) return {count: 0};
      rows.set(key(where), {...row, ...data, revision: row.revision + 1, updatedAt: new Date()}); return {count: 1}; }),
  };
  const db: any = {sessionRecordingEditDraft: model, transcriptSegment: {findMany: jest.fn(async ({where}) => where.id.in.includes("segment") && where.transcriptJobId.in.includes("job") ? [{id: "segment", transcriptJobId: "job"}] : [])}};
  db.$transaction = async (fn: any) => fn(db);
  return db;
}
beforeEach(() => { read.mockReset(); read.mockResolvedValue(workspace); });

it("persists timestamp cuts without requiring any transcript rows", async () => {
  const db = database();
  const manualCuts = [{startSeconds: 3, endSeconds: 8}];
  await saveSessionRecordingEdit(db, {...input, state: {...input.state, excludedTranscriptKeys: [], manualCuts}});
  expect(await readSessionRecordingEdit(db, input)).toMatchObject({revision: 1, state: {manualCuts}});
  expect(db.transcriptSegment.findMany).not.toHaveBeenCalled();
});

it.each([null, [{startSeconds: 1, endSeconds: 31}], [{startSeconds: 5, endSeconds: 3}]])("rejects invalid manual cuts before saving %#", async manualCuts => {
  const db = database();
  await expect(saveSessionRecordingEdit(db, {...input, state: {...input.state, manualCuts}})).rejects.toMatchObject({status: 400});
  expect(db.sessionRecordingEditDraft.create).not.toHaveBeenCalled();
});

it("saves a private take draft and reads the same editing intent", async () => {
  const db = database();
  const saved = await saveSessionRecordingEdit(db, input);
  expect(saved).toMatchObject({revision: 1, state: input.state});
  expect(await readSessionRecordingEdit(db, input)).toEqual(saved);
  expect(db.sessionRecordingEditDraft.findUnique).toHaveBeenCalledWith({where: {roomId_userId_takeId: {roomId: "room", userId: "coach", takeId: "start:take"}}});
});

it("replays the same request without incrementing revision and rejects identity reuse with changed content", async () => {
  const db = database();
  await saveSessionRecordingEdit(db, input);
  expect(await saveSessionRecordingEdit(db, input)).toMatchObject({revision: 1});
  await expect(saveSessionRecordingEdit(db, {...input, state: {...input.state, title: "Different"}})).rejects.toMatchObject({status: 409});
});

it("rejects a stale device revision and keeps the newer edit", async () => {
  const db = database();
  await saveSessionRecordingEdit(db, input);
  const next = {...input, expectedRevision: 1, clientRequestId: "22222222-2222-4222-8222-222222222222", state: {...input.state, title: "Newer edit"}};
  await saveSessionRecordingEdit(db, next);
  await expect(saveSessionRecordingEdit(db, {...input, expectedRevision: 1})).rejects.toMatchObject({status: 409, details: {currentRevision: 2}});
  expect(await readSessionRecordingEdit(db, input)).toMatchObject({revision: 2, state: {title: "Newer edit"}});
});

it("does not expose one coach's draft to another authorized editor", async () => {
  const db = database();
  await saveSessionRecordingEdit(db, input);
  expect(await readSessionRecordingEdit(db, {...input, actor: {id: "other-editor"}})).toBeNull();
});

it.each(["CLIENT", "COLLABORATOR"])("denies draft reads and writes for %s", async role => {
  read.mockResolvedValue({...workspace, role});
  const db = database();
  await expect(readSessionRecordingEdit(db, input)).rejects.toMatchObject({status: 403});
  await expect(saveSessionRecordingEdit(db, input)).rejects.toMatchObject({status: 403});
  expect(db.sessionRecordingEditDraft.findUnique).not.toHaveBeenCalled();
  expect(db.sessionRecordingEditDraft.create).not.toHaveBeenCalled();
});

it("does not read drafts when session access is denied", async () => {
  read.mockRejectedValue(new SessionRecordingShareError(404, "NO_ACCESS", "Unavailable"));
  const db = database();
  await expect(readSessionRecordingEdit(db, input)).rejects.toMatchObject({status: 404});
  expect(db.sessionRecordingEditDraft.findUnique).not.toHaveBeenCalled();
});

it.each([{selected: ["other-room-source"]}, {excludedTranscriptKeys: ["other-job:segment"]}, {endSeconds: 31}, {startSeconds: -1}, {outputMediaKind: "arbitrary"}])("rejects out-of-scope or invalid edit fields %j", async patch => {
  const db = database();
  await expect(saveSessionRecordingEdit(db, {...input, state: {...input.state, ...patch}})).rejects.toMatchObject({status: 400});
  expect(db.sessionRecordingEditDraft.create).not.toHaveBeenCalled();
});
