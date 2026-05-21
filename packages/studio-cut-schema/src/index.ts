export type SourceRole = "homer" | "charlie" | "clip" | "program";

export type ProgramState =
  | "charlie"
  | "homer"
  | "both"
  | "charlie_clip"
  | "homer_clip"
  | "both_clip"
  | "cut";

export type DecisionEvent = {
  id: string;
  projectId: string;
  branchId: string;
  sourceTimeMs: number;
  state: ProgramState;
  createdBy: string;
  createdAt: string;
  note?: string;
};

export type DerivedSegment = {
  startSourceTimeMs: number;
  endSourceTimeMs?: number;
  state: ProgramState;
  sourceEventId: string;
};

export const SOURCE_ROLES: readonly SourceRole[] = [
  "homer",
  "charlie",
  "clip",
  "program",
] as const;

export const PROGRAM_STATES: readonly ProgramState[] = [
  "charlie",
  "homer",
  "both",
  "charlie_clip",
  "homer_clip",
  "both_clip",
  "cut",
] as const;

export const PROGRAM_STATE_LABELS: Record<ProgramState, string> = {
  charlie: "Charlie",
  homer: "Homer",
  both: "Both",
  charlie_clip: "Charlie/Clip",
  homer_clip: "Homer/Clip",
  both_clip: "Both/Clip",
  cut: "Cut",
};

export const SOURCE_ROLE_LABELS: Record<SourceRole, string> = {
  homer: "Homer source",
  charlie: "Charlie source",
  clip: "Clip source",
  program: "Program preview",
};
