export const QUIPSLY_COACHING_PRACTICE_COMMAND_SCHEMA =
  "quipsly-coaching-practice-command-v1" as const;

export type QuipslyCoachingPracticeCommandTone =
  | "live"
  | "attention"
  | "upcoming"
  | "follow-up"
  | "steady";

export type QuipslyCoachingPracticeCommandKind =
  | "JOIN_LIVE_SESSION"
  | "REVIEW_TIME_REQUEST"
  | "REVIEW_LATE_SESSION"
  | "REPAIR_RECORDING"
  | "REPAIR_TRANSCRIPT"
  | "REVIEW_FOLLOW_UP"
  | "SHARE_FOLLOW_UP"
  | "PREPARE_SESSION"
  | "OPEN_NEXT_SESSION";

export interface QuipslyCoachingPracticeBooking {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly scheduledStart: string;
  readonly scheduledEnd?: string | null;
  readonly roomId?: string | null;
  readonly roomStatus?: string | null;
  readonly engagementId?: string | null;
  readonly clientLabel?: string | null;
  readonly clientCheckInSubmittedAt?: string | null;
  readonly coachPreparedAt?: string | null;
}

export interface QuipslyCoachingPracticeTimeRequest {
  readonly id: string;
  readonly status: string;
  readonly expiresAt: string;
  readonly scheduledStart: string;
  readonly scheduledEnd?: string | null;
  readonly title?: string | null;
  readonly clientLabel?: string | null;
}

export interface QuipslyCoachingPracticeRoom {
  readonly id: string;
  readonly bookingId?: string | null;
  readonly engagementId?: string | null;
  readonly title: string;
  readonly status: string;
  readonly scheduledStart?: string | null;
  readonly endedAt?: string | null;
  readonly clientLabel?: string | null;
  readonly recordingCount: number;
  readonly recordingStatus?: string | null;
  readonly providerRecordingState?: string | null;
  readonly transcriptStatus?: string | null;
  readonly packetStatus?: string | null;
  readonly followUpReleased?: boolean;
}

export interface BuildQuipslyCoachingPracticeCommandInput {
  readonly now: string;
  readonly bookings: readonly QuipslyCoachingPracticeBooking[];
  readonly timeRequests: readonly QuipslyCoachingPracticeTimeRequest[];
  readonly rooms: readonly QuipslyCoachingPracticeRoom[];
  readonly maxItems?: number;
}

export interface QuipslyCoachingPracticeCommandItem {
  readonly id: string;
  readonly kind: QuipslyCoachingPracticeCommandKind;
  readonly tone: QuipslyCoachingPracticeCommandTone;
  readonly priority: number;
  readonly title: string;
  readonly detail: string;
  readonly actionLabel: string;
  readonly href: string;
  readonly roomId: string | null;
  readonly bookingId: string | null;
  readonly engagementId: string | null;
  readonly requestId: string | null;
  readonly scheduledAt: string | null;
  readonly personLabel: string | null;
}

export interface QuipslyCoachingPracticeCommand {
  readonly schema: typeof QUIPSLY_COACHING_PRACTICE_COMMAND_SCHEMA;
  readonly generatedAt: string;
  readonly headline: string;
  readonly detail: string;
  readonly allCaughtUp: boolean;
  readonly counts: {
    readonly live: number;
    readonly requests: number;
    readonly attention: number;
    readonly prepare: number;
    readonly followUp: number;
    readonly today: number;
  };
  readonly items: readonly QuipslyCoachingPracticeCommandItem[];
  readonly deterministic: true;
  readonly externalSideEffects: false;
}

function timestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalized(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

function sessionHref(roomId: string, mode: "live" | "prepare" | "transcript" | "outputs") {
  return `/sessions/${encodeURIComponent(roomId)}?mode=${mode}`;
}

function requestHref() {
  return "/coaching#incoming-time-requests";
}

function item(input: Omit<QuipslyCoachingPracticeCommandItem, "id">) {
  const identity =
    input.roomId ?? input.requestId ?? input.bookingId ?? input.engagementId ?? input.kind;
  return { id: `${input.kind}:${identity}`, ...input };
}

function isToday(value: string | null | undefined, now: number) {
  const candidate = timestamp(value);
  if (candidate === null) return false;
  const clock = new Date(now);
  const date = new Date(candidate);
  return (
    clock.getUTCFullYear() === date.getUTCFullYear() &&
    clock.getUTCMonth() === date.getUTCMonth() &&
    clock.getUTCDate() === date.getUTCDate()
  );
}

function isRecordingAttention(room: QuipslyCoachingPracticeRoom) {
  return (
    ["FAILED", "ERROR", "CORRUPT", "HELD"].includes(normalized(room.recordingStatus)) ||
    ["NEEDS-REVIEW", "HELD"].includes(normalized(room.providerRecordingState))
  );
}

function isTranscriptAttention(room: QuipslyCoachingPracticeRoom) {
  return ["FAILED", "ERROR", "BLOCKED", "HELD"].includes(
    normalized(room.transcriptStatus),
  );
}

/**
 * Builds a calm coach-facing operating list from canonical scheduling and
 * Session evidence. It never grants access, mutates work, or manufactures
 * unread/attention state. Callers must supply only records already authorized
 * for the exact coach.
 */
export function buildQuipslyCoachingPracticeCommand(
  input: BuildQuipslyCoachingPracticeCommandInput,
): QuipslyCoachingPracticeCommand {
  const now = timestamp(input.now);
  if (now === null) throw new Error("A valid practice command clock is required.");

  const maxItems = Number.isFinite(input.maxItems)
    ? Math.max(1, Math.min(12, Math.floor(input.maxItems ?? 7)))
    : 7;
  const items: QuipslyCoachingPracticeCommandItem[] = [];
  const liveRoomIds = new Set<string>();
  const roomIds = new Set(input.rooms.map((room) => room.id));

  for (const room of input.rooms) {
    const roomStatus = normalized(room.status);
    if (["OPEN", "RECORDING"].includes(roomStatus)) {
      liveRoomIds.add(room.id);
      items.push(
        item({
          kind: "JOIN_LIVE_SESSION",
          tone: "live",
          priority: 0,
          title: room.clientLabel ? `Join ${room.clientLabel}` : "Join the live Session",
          detail: roomStatus === "RECORDING"
            ? "This Session is live and recording. Rejoin the room now."
            : "This Session is open. Check your devices and join the conversation.",
          actionLabel: "Join now",
          href: sessionHref(room.id, "live"),
          roomId: room.id,
          bookingId: room.bookingId ?? null,
          engagementId: room.engagementId ?? null,
          requestId: null,
          scheduledAt: room.scheduledStart ?? null,
          personLabel: room.clientLabel?.trim() || null,
        }),
      );
    }
  }

  for (const request of input.timeRequests) {
    const expiresAt = timestamp(request.expiresAt);
    if (normalized(request.status) !== "ACTIVE" || expiresAt === null || expiresAt <= now) continue;
    items.push(
      item({
        kind: "REVIEW_TIME_REQUEST",
        tone: "attention",
        priority: 10,
        title: request.clientLabel
          ? `${request.clientLabel} requested a time`
          : "A client requested a time",
        detail: "Confirm to create the private Session, or decline to reopen the time.",
        actionLabel: "Review request",
        href: requestHref(),
        roomId: null,
        bookingId: null,
        engagementId: null,
        requestId: request.id,
        scheduledAt: request.scheduledStart,
        personLabel: request.clientLabel?.trim() || null,
      }),
    );
  }

  const activeBookingStatuses = new Set(["REQUESTED", "CONFIRMED"]);
  for (const booking of input.bookings) {
    if (!activeBookingStatuses.has(normalized(booking.status))) continue;
    if (booking.roomId && liveRoomIds.has(booking.roomId)) continue;
    const start = timestamp(booking.scheduledStart);
    if (start === null) continue;
    const roomStatus = normalized(booking.roomStatus);
    if (start < now && !["ENDED", "CANCELED"].includes(roomStatus)) {
      const href = booking.roomId
        ? sessionHref(booking.roomId, "live")
        : "/coaching#upcoming-sessions";
      items.push(
        item({
          kind: "REVIEW_LATE_SESSION",
          tone: "attention",
          priority: 20,
          title: booking.clientLabel
            ? `Review ${booking.clientLabel}'s Session`
            : "Review the late Session",
          detail: "Its planned time has passed. Open it, complete it, or reschedule before it becomes hidden admin debt.",
          actionLabel: "Review Session",
          href,
          roomId: booking.roomId ?? null,
          bookingId: booking.id,
          engagementId: booking.engagementId ?? null,
          requestId: null,
          scheduledAt: booking.scheduledStart,
          personLabel: booking.clientLabel?.trim() || null,
        }),
      );
    }
  }

  for (const room of input.rooms) {
    if (liveRoomIds.has(room.id)) continue;
    if (isRecordingAttention(room)) {
      items.push(
        item({
          kind: "REPAIR_RECORDING",
          tone: "attention",
          priority: 30,
          title: room.clientLabel
            ? `Protect ${room.clientLabel}'s recording`
            : "Protect the Session recording",
          detail: "Quipsly has recording evidence that needs review. The original remains the source of truth.",
          actionLabel: "Review recording",
          href: sessionHref(room.id, "outputs"),
          roomId: room.id,
          bookingId: room.bookingId ?? null,
          engagementId: room.engagementId ?? null,
          requestId: null,
          scheduledAt: room.scheduledStart ?? room.endedAt ?? null,
          personLabel: room.clientLabel?.trim() || null,
        }),
      );
      continue;
    }
    if (isTranscriptAttention(room)) {
      items.push(
        item({
          kind: "REPAIR_TRANSCRIPT",
          tone: "attention",
          priority: 40,
          title: room.clientLabel
            ? `Review ${room.clientLabel}'s transcript`
            : "Review the Session transcript",
          detail: "The transcript could not finish cleanly. Open its source-bound status and retry safely.",
          actionLabel: "Review transcript",
          href: sessionHref(room.id, "transcript"),
          roomId: room.id,
          bookingId: room.bookingId ?? null,
          engagementId: room.engagementId ?? null,
          requestId: null,
          scheduledAt: room.scheduledStart ?? room.endedAt ?? null,
          personLabel: room.clientLabel?.trim() || null,
        }),
      );
      continue;
    }
    const ended = normalized(room.status) === "ENDED";
    const transcriptCompleted = normalized(room.transcriptStatus) === "COMPLETED";
    const packetReady = normalized(room.packetStatus) === "READY_FOR_REVIEW";
    if (ended && packetReady && room.followUpReleased !== true) {
      items.push(
        item({
          kind: "SHARE_FOLLOW_UP",
          tone: "follow-up",
          priority: 50,
          title: room.clientLabel
            ? `Share ${room.clientLabel}'s follow-up`
            : "Share the reviewed follow-up",
          detail: "The packet is ready. Review the recording, transcript, notes, goals, and tasks before releasing it.",
          actionLabel: "Review and share",
          href: sessionHref(room.id, "outputs"),
          roomId: room.id,
          bookingId: room.bookingId ?? null,
          engagementId: room.engagementId ?? null,
          requestId: null,
          scheduledAt: room.scheduledStart ?? room.endedAt ?? null,
          personLabel: room.clientLabel?.trim() || null,
        }),
      );
      continue;
    }
    if (
      ended &&
      room.recordingCount > 0 &&
      transcriptCompleted &&
      !packetReady &&
      room.followUpReleased !== true
    ) {
      items.push(
        item({
          kind: "REVIEW_FOLLOW_UP",
          tone: "follow-up",
          priority: 60,
          title: room.clientLabel
            ? `Finish ${room.clientLabel}'s follow-up`
            : "Finish the Session follow-up",
          detail: "The transcript is ready for corrections, notes, goals, tasks, and a client-safe recording share.",
          actionLabel: "Review transcript",
          href: sessionHref(room.id, "transcript"),
          roomId: room.id,
          bookingId: room.bookingId ?? null,
          engagementId: room.engagementId ?? null,
          requestId: null,
          scheduledAt: room.scheduledStart ?? room.endedAt ?? null,
          personLabel: room.clientLabel?.trim() || null,
        }),
      );
    }
  }

  const preparationWindow = 48 * 60 * 60 * 1_000;
  for (const booking of input.bookings) {
    if (!activeBookingStatuses.has(normalized(booking.status))) continue;
    const start = timestamp(booking.scheduledStart);
    if (start === null || start < now || start - now > preparationWindow) continue;
    if (booking.roomId && liveRoomIds.has(booking.roomId)) continue;
    if (!booking.roomId || roomIds.has(booking.roomId)) {
      const hasClientCheckIn = timestamp(booking.clientCheckInSubmittedAt) !== null;
      const coachPrepared = timestamp(booking.coachPreparedAt) !== null;
      if (!coachPrepared) {
        items.push(
          item({
            kind: "PREPARE_SESSION",
            tone: "upcoming",
            priority: 70,
            title: booking.clientLabel
              ? `Prepare for ${booking.clientLabel}`
              : `Prepare ${booking.title}`,
            detail: hasClientCheckIn
              ? "The client's check-in is ready. Review it and add your private preparation."
              : "Review the client space and add private preparation. Their optional check-in has not arrived yet.",
            actionLabel: "Prepare Session",
            href: booking.roomId
              ? sessionHref(booking.roomId, "prepare")
              : "/coaching#upcoming-sessions",
            roomId: booking.roomId ?? null,
            bookingId: booking.id,
            engagementId: booking.engagementId ?? null,
            requestId: null,
            scheduledAt: booking.scheduledStart,
            personLabel: booking.clientLabel?.trim() || null,
          }),
        );
      }
    }
  }

  const futureBookings = input.bookings
    .filter((booking) => {
      const start = timestamp(booking.scheduledStart);
      return activeBookingStatuses.has(normalized(booking.status)) && start !== null && start >= now;
    })
    .sort(
      (left, right) =>
        (timestamp(left.scheduledStart) ?? 0) - (timestamp(right.scheduledStart) ?? 0) ||
        left.id.localeCompare(right.id),
    );
  const nextBooking = futureBookings[0];
  if (
    nextBooking &&
    !items.some((candidate) => candidate.bookingId === nextBooking.id)
  ) {
    items.push(
      item({
        kind: "OPEN_NEXT_SESSION",
        tone: "steady",
        priority: 80,
        title: nextBooking.clientLabel
          ? `Next: ${nextBooking.clientLabel}`
          : nextBooking.title,
        detail: "Open the client space, invitation, Session plan, and device check from one place.",
        actionLabel: "Open Session",
        href: nextBooking.roomId
          ? sessionHref(nextBooking.roomId, "live")
          : "/coaching#upcoming-sessions",
        roomId: nextBooking.roomId ?? null,
        bookingId: nextBooking.id,
        engagementId: nextBooking.engagementId ?? null,
        requestId: null,
        scheduledAt: nextBooking.scheduledStart,
        personLabel: nextBooking.clientLabel?.trim() || null,
      }),
    );
  }

  const deduped = [...new Map(items.map((candidate) => [candidate.id, candidate])).values()]
    .sort((left, right) => {
      const priority = left.priority - right.priority;
      if (priority) return priority;
      const chronology =
        (timestamp(left.scheduledAt) ?? Number.POSITIVE_INFINITY) -
        (timestamp(right.scheduledAt) ?? Number.POSITIVE_INFINITY);
      return chronology || left.id.localeCompare(right.id);
    });
  const visible = deduped.slice(0, maxItems);
  const counts = {
    live: deduped.filter((candidate) => candidate.tone === "live").length,
    requests: deduped.filter((candidate) => candidate.kind === "REVIEW_TIME_REQUEST").length,
    attention: deduped.filter((candidate) => candidate.tone === "attention").length,
    prepare: deduped.filter((candidate) => candidate.kind === "PREPARE_SESSION").length,
    followUp: deduped.filter((candidate) => candidate.tone === "follow-up").length,
    today: deduped.filter((candidate) => isToday(candidate.scheduledAt, now)).length,
  };
  const actionableCount = counts.live + counts.requests + counts.attention + counts.prepare + counts.followUp;
  const allCaughtUp = actionableCount === 0;

  return {
    schema: QUIPSLY_COACHING_PRACTICE_COMMAND_SCHEMA,
    generatedAt: new Date(now).toISOString(),
    headline: counts.live > 0
      ? "A client is waiting in a live Session."
      : allCaughtUp
        ? "You are caught up."
        : `${actionableCount} ${actionableCount === 1 ? "thing needs" : "things need"} your attention.`,
    detail: counts.live > 0
      ? "Join first. Quipsly will keep preparation and follow-through waiting safely."
      : allCaughtUp
        ? nextBooking
          ? "Your next Session is ready whenever you want to review it."
          : "No live Session, client request, repair, preparation, or follow-up is waiting."
        : "Work from the top. Live conversations and client requests stay ahead of preparation and follow-through.",
    allCaughtUp,
    counts,
    items: visible,
    deterministic: true,
    externalSideEffects: false,
  };
}
