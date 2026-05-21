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

export type DecisionEventParseResult = {
  events: DecisionEvent[];
  totalCount: number;
  rejectedCount: number;
};

export function isProgramState(value: unknown): value is ProgramState {
  return PROGRAM_STATES.includes(value as ProgramState);
}

export function isDecisionEvent(value: unknown): value is DecisionEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<DecisionEvent>;

  return (
    typeof event.id === "string" &&
    event.id.trim().length > 0 &&
    typeof event.projectId === "string" &&
    event.projectId.trim().length > 0 &&
    typeof event.branchId === "string" &&
    event.branchId.trim().length > 0 &&
    typeof event.sourceTimeMs === "number" &&
    Number.isFinite(event.sourceTimeMs) &&
    event.sourceTimeMs >= 0 &&
    isProgramState(event.state) &&
    typeof event.createdBy === "string" &&
    event.createdBy.trim().length > 0 &&
    typeof event.createdAt === "string" &&
    event.createdAt.trim().length > 0 &&
    !Number.isNaN(Date.parse(event.createdAt)) &&
    (event.note === undefined || typeof event.note === "string")
  );
}

export function parseDecisionEventsPayload(
  payload: unknown,
): DecisionEventParseResult {
  const candidateEvents = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.decisionEvents)
      ? payload.decisionEvents
      : [];

  const events = candidateEvents.filter(isDecisionEvent);

  return {
    events,
    totalCount: candidateEvents.length,
    rejectedCount: candidateEvents.length - events.length,
  };
}

export function sortDecisionEvents(events: readonly DecisionEvent[]) {
  return [...events].sort(
    (left, right) =>
      left.sourceTimeMs - right.sourceTimeMs ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export function mergeDecisionEvents(events: readonly DecisionEvent[]) {
  const eventsById = new Map<string, DecisionEvent>();

  for (const event of events) {
    eventsById.set(event.id, event);
  }

  return sortDecisionEvents([...eventsById.values()]);
}

export function deriveSegments(events: readonly DecisionEvent[]): DerivedSegment[] {
  const sortedEvents = sortDecisionEvents(events);

  return sortedEvents.map((event, index) => {
    const nextEvent = sortedEvents[index + 1];
    return {
      startSourceTimeMs: event.sourceTimeMs,
      ...(nextEvent ? { endSourceTimeMs: nextEvent.sourceTimeMs } : {}),
      state: event.state,
      sourceEventId: event.id,
    };
  });
}

export function getCurrentDecisionEvent(
  events: readonly DecisionEvent[],
  sourceTimeMs: number,
) {
  let currentEvent: DecisionEvent | undefined;

  for (const event of sortDecisionEvents(events)) {
    if (event.sourceTimeMs <= sourceTimeMs) {
      currentEvent = event;
      continue;
    }

    break;
  }

  return currentEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
