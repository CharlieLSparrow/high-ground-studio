export type RecordingEditDraft = {
  selected: Set<string>;
  startSeconds: number;
  endSeconds: number;
  title: string;
  outputMediaKind: "audio" | "video";
  primaryVideoSourceId: string;
  excludedTranscriptKeys: Set<string>;
};

export type RecordingEditHistory = {
  present: RecordingEditDraft;
  past: RecordingEditDraft[];
  future: RecordingEditDraft[];
  group: string | null;
  changedAt: number;
};

export function recordingEditHistory(present: RecordingEditDraft): RecordingEditHistory {
  return {present, past: [], future: [], group: null, changedAt: 0};
}

function sameDraft(left: RecordingEditDraft, right: RecordingEditDraft) {
  const key = (draft: RecordingEditDraft) => JSON.stringify({
    ...draft,
    selected: [...draft.selected].sort(),
    excludedTranscriptKeys: [...draft.excludedTranscriptKeys].sort(),
  });
  return key(left) === key(right);
}

export type RecordingEditHistoryAction =
  | {type: "reset"; draft: RecordingEditDraft}
  | {type: "restore"; history: RecordingEditHistory}
  | {type: "change"; update: Partial<RecordingEditDraft> | ((draft: RecordingEditDraft) => Partial<RecordingEditDraft>); group?: string; at: number}
  | {type: "undo" | "redo"};

export function reduceRecordingEditHistory(state: RecordingEditHistory, action: RecordingEditHistoryAction): RecordingEditHistory {
  if (action.type === "reset") return recordingEditHistory(action.draft);
  if (action.type === "restore") return action.history;
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous ? {present: previous, past: state.past.slice(0, -1), future: [state.present, ...state.future], group: null, changedAt: 0} : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next ? {present: next, past: [...state.past, state.present], future: state.future.slice(1), group: null, changedAt: 0} : state;
  }
  if (action.type !== "change") return state;
  const present = {...state.present, ...(typeof action.update === "function" ? action.update(state.present) : action.update)};
  if (sameDraft(state.present, present)) return state;
  // A slider drag or short typing burst is one action, not dozens of undos.
  const coalesced = Boolean(action.group && action.group === state.group && action.at - state.changedAt < 600 && state.future.length === 0);
  return {present, past: coalesced ? state.past : [...state.past, state.present].slice(-100), future: [], group: action.group ?? null, changedAt: action.at};
}
