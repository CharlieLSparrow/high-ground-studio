import type { RecordingEditDraft } from "./recording-edit-history";

export type SavedRecordingEdit = {
  selected: string[];
  startSeconds: number;
  endSeconds: number;
  title: string;
  outputMediaKind: "audio" | "video";
  primaryVideoSourceId: string;
  excludedTranscriptKeys: string[];
  manualCuts?: import("./recording-manual-cuts").RecordingTimeRange[];
  editing: boolean;
  baseOutputId: string | null;
  baseOutputRevision: number | null;
};
export type RecordingEditVersion = {revision: number; state: SavedRecordingEdit; updatedAt: string};

export function serializeRecordingEdit(draft: RecordingEditDraft, editing: boolean, output?: {id: string; revision: number} | null): SavedRecordingEdit {
  return {...draft, selected: [...draft.selected].sort(), excludedTranscriptKeys: [...draft.excludedTranscriptKeys].sort(),
    editing, baseOutputId: output?.id ?? null, baseOutputRevision: output?.revision ?? null};
}

export function restoreRecordingEdit(state: SavedRecordingEdit): RecordingEditDraft {
  return {selected: new Set(state.selected), startSeconds: state.startSeconds, endSeconds: state.endSeconds,
    title: state.title, outputMediaKind: state.outputMediaKind, primaryVideoSourceId: state.primaryVideoSourceId,
    excludedTranscriptKeys: new Set(state.excludedTranscriptKeys), manualCuts: state.manualCuts ?? []};
}

export function recordingEditMatchesOutput(state: SavedRecordingEdit, output?: {id: string; revision: number} | null) {
  // Rendering and sharing advance an output's revision without changing its
  // edit. A newly prepared edit has a new output ID.
  return state.baseOutputId === (output?.id ?? null);
}
