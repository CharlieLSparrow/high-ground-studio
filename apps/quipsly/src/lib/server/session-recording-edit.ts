import "server-only";
import { randomUUID } from "node:crypto";
import type { SavedRecordingEdit } from "../recording-edit-draft";
import type { SessionAccessActor } from "./session-access";
import { readSessionRecordingEditSources, SessionRecordingShareError, stableJson } from "./session-recording-share";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Context = {roomId: string; takeId: string; actor: SessionAccessActor};
function invalid(message: string): never { throw new SessionRecordingShareError(400, "INVALID_RECORDING_EDIT", message); }
const serialize = (row: any) => row ? {revision: row.revision, state: row.stateJson as SavedRecordingEdit, updatedAt: new Date(row.updatedAt).toISOString()} : null;

async function workspace(client: any, input: Context) {
  if (!input.takeId || input.takeId.length > 240) invalid("Choose a recording before editing.");
  const current = await readSessionRecordingEditSources(client, input);
  if (current.role !== "COACH") throw new SessionRecordingShareError(403, "RECORDING_EDIT_FORBIDDEN", "You cannot edit this recording.");
  if (current.available.selectedTakeId !== input.takeId) throw new SessionRecordingShareError(404, "RECORDING_ATTEMPT_NOT_FOUND", "This recording is no longer available.");
  return current;
}
function key(input: Context) { return {roomId: input.roomId, userId: input.actor.id, takeId: input.takeId}; }

export async function readSessionRecordingEdit(client: any, input: Context) {
  await workspace(client, input);
  return serialize(await client.sessionRecordingEditDraft.findUnique({where: {roomId_userId_takeId: key(input)}}));
}

export async function saveSessionRecordingEdit(client: any, input: Context & {expectedRevision: number; clientRequestId: string; state: unknown}) {
  const currentWorkspace = await workspace(client, input);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !uuid.test(input.clientRequestId)) invalid("The edit could not be saved. Reload and try again.");
  const state = input.state as SavedRecordingEdit;
  if (!state || typeof state !== "object" || Array.isArray(state)) invalid("Choose a valid recording edit.");
  const strings = (value: unknown, max: number): value is string[] => Array.isArray(value) && value.length <= max && value.every(item => typeof item === "string" && item.length > 0 && item.length <= 500);
  if (!strings(state.selected, 100) || !strings(state.excludedTranscriptKeys, 10_000) ||
      typeof state.title !== "string" || state.title.length > 500 ||
      !Number.isFinite(state.startSeconds) || !Number.isFinite(state.endSeconds) ||
      state.startSeconds < 0 || state.endSeconds <= state.startSeconds || state.endSeconds > currentWorkspace.available.programDurationSeconds + 0.1 ||
      !["audio", "video"].includes(state.outputMediaKind) || typeof state.primaryVideoSourceId !== "string" ||
      typeof state.editing !== "boolean" ||
      !(state.baseOutputId === null || (typeof state.baseOutputId === "string" && state.baseOutputId.length <= 240)) ||
      !(state.baseOutputRevision === null || (Number.isSafeInteger(state.baseOutputRevision) && state.baseOutputRevision > 0))) invalid("The recording edit has invalid fields.");
  const sourceIds = new Set(currentWorkspace.available.sources.map((source: any) => source.id));
  const exclusions = state.excludedTranscriptKeys.map(key => key.split(":"));
  const segmentRows = exclusions.length ? await client.transcriptSegment.findMany({where: {
    id: {in: exclusions.map(parts => parts[1] ?? "")},
    transcriptJobId: {in: exclusions.map(parts => parts[0])},
    transcriptJob: {roomId: input.roomId, assetId: {in: [...sourceIds]}, status: "COMPLETED"},
  }, select: {id: true, transcriptJobId: true}}) : [];
  const segments = new Set(segmentRows.map((segment: any) => `${segment.transcriptJobId}:${segment.id}`));
  if (state.selected.some(id => !sourceIds.has(id)) || state.excludedTranscriptKeys.some(id => !segments.has(id)) ||
      (state.primaryVideoSourceId && !sourceIds.has(state.primaryVideoSourceId))) invalid("This edit contains a source or passage outside the selected recording.");
  // Persist only known editing fields, never arbitrary client metadata.
  const stateJson: SavedRecordingEdit = {selected: [...new Set(state.selected)].sort(), startSeconds: state.startSeconds, endSeconds: state.endSeconds,
    title: state.title, outputMediaKind: state.outputMediaKind, primaryVideoSourceId: state.primaryVideoSourceId,
    excludedTranscriptKeys: [...new Set(state.excludedTranscriptKeys)].sort(), editing: state.editing,
    baseOutputId: state.baseOutputId, baseOutputRevision: state.baseOutputRevision};
  const where = key(input);
  const conflict = async (database = client) => {
    const latest = await database.sessionRecordingEditDraft.findUnique({where: {roomId_userId_takeId: where}});
    if (latest?.clientRequestId === input.clientRequestId && stableJson(latest.stateJson) === stableJson(stateJson)) return serialize(latest);
    throw new SessionRecordingShareError(409, "RECORDING_EDIT_CONFLICT", "This edit changed on another device. Your changes are still here.", {currentRevision: latest?.revision ?? 0});
  };
  try {
    if (input.expectedRevision === 0) return serialize(await client.sessionRecordingEditDraft.create({data: {
      ...where, id: randomUUID(), revision: 1, clientRequestId: input.clientRequestId, stateJson,
    }}));
    return await client.$transaction(async (tx: any) => {
      const result = await tx.sessionRecordingEditDraft.updateMany({where: {...where, revision: input.expectedRevision}, data: {
        stateJson, clientRequestId: input.clientRequestId, revision: {increment: 1},
      }});
      if (!result.count) return conflict(tx);
      return serialize(await tx.sessionRecordingEditDraft.findUnique({where: {roomId_userId_takeId: where}}));
    });
  } catch (error) {
    if ((error as {code?: string}).code === "P2002") return conflict();
    throw error;
  }
}
