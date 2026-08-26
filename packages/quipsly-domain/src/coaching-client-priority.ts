export const QUIPSLY_COACHING_CLIENT_PRIORITY_SCHEMA =
  "quipsly-coaching-client-priority-v1" as const;

export type QuipslyCoachingClientPriorityKind =
  | "JOIN_LIVE_SESSION"
  | "REVIEW_LATE_SESSION"
  | "PREPARE_UPCOMING_SESSION"
  | "REVIEW_COACH_FOLLOW_UP"
  | "VIEW_RELEASED_FOLLOW_UP"
  | "PREPARE_UNSCHEDULED_SESSION"
  | "REVIEW_OVERDUE_COMMITMENTS"
  | "OPEN_RELATIONSHIP";

export type QuipslyCoachingClientPriorityTone =
  | "live"
  | "attention"
  | "upcoming"
  | "steady";

export interface QuipslyCoachingClientPriorityRoom {
  readonly id: string;
  readonly title?: string | null;
  readonly status: string;
  readonly scheduledStart?: string | null;
  readonly endedAt?: string | null;
  readonly createdAt?: string | null;
  readonly recordingCount?: number;
  readonly transcriptStatus?: string | null;
  readonly followUpReleased?: boolean;
}

export interface ChooseQuipslyCoachingClientPriorityInput {
  readonly now: string;
  readonly viewerRole: "COACH" | "CLIENT" | "SUPPORT" | "OBSERVER";
  readonly rooms: readonly QuipslyCoachingClientPriorityRoom[];
  readonly overdueCommitmentCount: number;
  readonly upcomingSoonMilliseconds?: number;
}

export interface QuipslyCoachingClientPriority {
  readonly schema: typeof QUIPSLY_COACHING_CLIENT_PRIORITY_SCHEMA;
  readonly kind: QuipslyCoachingClientPriorityKind;
  readonly tone: QuipslyCoachingClientPriorityTone;
  readonly rank: number;
  readonly roomId: string | null;
  readonly roomTitle: string | null;
  readonly scheduledStart: string | null;
  readonly overdueCommitmentCount: number;
  readonly deterministic: true;
  readonly externalSideEffects: false;
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function chronology(room: QuipslyCoachingClientPriorityRoom) {
  return (
    timestamp(room.scheduledStart) ??
    timestamp(room.endedAt) ??
    timestamp(room.createdAt) ??
    0
  );
}

function normalizedStatus(room: QuipslyCoachingClientPriorityRoom) {
  return room.status.trim().toUpperCase();
}

function compareChronologyAscending(
  left: QuipslyCoachingClientPriorityRoom,
  right: QuipslyCoachingClientPriorityRoom,
) {
  return chronology(left) - chronology(right) || left.id.localeCompare(right.id);
}

function compareChronologyDescending(
  left: QuipslyCoachingClientPriorityRoom,
  right: QuipslyCoachingClientPriorityRoom,
) {
  return chronology(right) - chronology(left) || left.id.localeCompare(right.id);
}

function result(
  kind: QuipslyCoachingClientPriorityKind,
  tone: QuipslyCoachingClientPriorityTone,
  rank: number,
  room: QuipslyCoachingClientPriorityRoom | null,
  overdueCommitmentCount: number,
): QuipslyCoachingClientPriority {
  return {
    schema: QUIPSLY_COACHING_CLIENT_PRIORITY_SCHEMA,
    kind,
    tone,
    rank,
    roomId: room?.id ?? null,
    roomTitle: room?.title?.trim() || null,
    scheduledStart: room?.scheduledStart ?? null,
    overdueCommitmentCount,
    deterministic: true,
    externalSideEffects: false,
  };
}

/**
 * Selects one relationship action from committed Session and work state.
 *
 * The priority is deliberately policy-only: it never grants access, creates
 * work, starts a room, changes a calendar, or claims that a recording,
 * transcript, or follow-up exists without the supplied canonical evidence.
 */
export function chooseQuipslyCoachingClientPriority(
  input: ChooseQuipslyCoachingClientPriorityInput,
): QuipslyCoachingClientPriority {
  const now = timestamp(input.now);
  if (now === null) {
    throw new Error("A valid priority clock is required.");
  }
  const overdueCommitmentCount = Number.isFinite(input.overdueCommitmentCount)
    ? Math.max(0, Math.floor(input.overdueCommitmentCount))
    : 0;
  const requestedSoonWindow =
    input.upcomingSoonMilliseconds ?? 24 * 60 * 60 * 1_000;
  const soonWindow = Number.isFinite(requestedSoonWindow)
    ? Math.max(0, requestedSoonWindow)
    : 24 * 60 * 60 * 1_000;
  const live = input.rooms
    .filter((room) => ["OPEN", "RECORDING"].includes(normalizedStatus(room)))
    .sort(compareChronologyDescending)[0];
  if (live) {
    return result("JOIN_LIVE_SESSION", "live", 0, live, overdueCommitmentCount);
  }

  const planned = input.rooms.filter(
    (room) => normalizedStatus(room) === "PLANNED",
  );
  const late = planned
    .filter((room) => {
      const start = timestamp(room.scheduledStart);
      return start !== null && start < now;
    })
    .sort(compareChronologyDescending)[0];
  if (late) {
    return result(
      "REVIEW_LATE_SESSION",
      "attention",
      1,
      late,
      overdueCommitmentCount,
    );
  }

  const upcoming = planned
    .filter((room) => {
      const start = timestamp(room.scheduledStart);
      return start !== null && start >= now;
    })
    .sort(compareChronologyAscending)[0];
  if (
    upcoming &&
    (timestamp(upcoming.scheduledStart) ?? Number.POSITIVE_INFINITY) - now <=
      soonWindow
  ) {
    return result(
      "PREPARE_UPCOMING_SESSION",
      "upcoming",
      2,
      upcoming,
      overdueCommitmentCount,
    );
  }

  const ended = input.rooms
    .filter((room) => normalizedStatus(room) === "ENDED")
    .sort(compareChronologyDescending);
  if (input.viewerRole === "COACH") {
    const pendingFollowUp = ended.find(
      (room) =>
        (room.recordingCount ?? 0) > 0 && room.followUpReleased !== true,
    );
    if (pendingFollowUp) {
      return result(
        "REVIEW_COACH_FOLLOW_UP",
        "attention",
        3,
        pendingFollowUp,
        overdueCommitmentCount,
      );
    }
  }

  if (upcoming) {
    return result(
      "PREPARE_UPCOMING_SESSION",
      "upcoming",
      4,
      upcoming,
      overdueCommitmentCount,
    );
  }

  if (input.viewerRole === "CLIENT") {
    const released = ended.find((room) => room.followUpReleased === true);
    if (released) {
      return result(
        "VIEW_RELEASED_FOLLOW_UP",
        "steady",
        5,
        released,
        overdueCommitmentCount,
      );
    }
  }

  const unscheduled = planned
    .filter((room) => timestamp(room.scheduledStart) === null)
    .sort(compareChronologyDescending)[0];
  if (unscheduled) {
    return result(
      "PREPARE_UNSCHEDULED_SESSION",
      "attention",
      6,
      unscheduled,
      overdueCommitmentCount,
    );
  }

  if (overdueCommitmentCount > 0) {
    return result(
      "REVIEW_OVERDUE_COMMITMENTS",
      "attention",
      7,
      null,
      overdueCommitmentCount,
    );
  }

  return result("OPEN_RELATIONSHIP", "steady", 8, null, overdueCommitmentCount);
}
