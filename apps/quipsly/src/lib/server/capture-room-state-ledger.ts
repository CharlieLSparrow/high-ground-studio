export const CAPTURE_ROOM_STATE_ACTIONS = [
  "OPEN",
  "START_RECORDING",
  "STOP_RECORDING",
  "END",
] as const;

export type CaptureRoomStateAction = (typeof CAPTURE_ROOM_STATE_ACTIONS)[number];

export type CaptureRoomStatus =
  | "PLANNED"
  | "OPEN"
  | "RECORDING"
  | "ENDED"
  | "CANCELED"
  | "FAILED";

export type CaptureRoomReceiptLedgerEntry = {
  receiptId: string;
  captureId: string | null;
  actorUserId?: string;
  action: CaptureRoomStateAction;
  outcome?: string;
  stateApplied: boolean;
  occurredAt?: Date;
  receivedAt?: Date;
  sequence?: bigint;
};

export type CaptureRoomReceiptApplicationDecision = {
  stateApplied: boolean;
  outcome:
    | "APPLIED"
    | "IGNORED_DUPLICATE_START"
    | "IGNORED_TERMINAL_STOP"
    | "IGNORED_PRE_END_BOUNDARY";
};

export type CaptureRoomActorRole =
  | "HOST"
  | "COACH"
  | "CLIENT"
  | "GUEST"
  | "PRODUCER"
  | "OBSERVER"
  | null;

export type CaptureRoomActionAuthorizationDecision = {
  allowed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  captureOwnerUserId: string | null;
  staffCrashCompensation: boolean;
};

export function isCaptureRoomStateAction(value: string): value is CaptureRoomStateAction {
  return CAPTURE_ROOM_STATE_ACTIONS.includes(value as CaptureRoomStateAction);
}

export function normalizedCaptureReceiptOccurredAt(value: unknown, now = new Date()): Date {
  const candidate = value instanceof Date
    ? value
    : new Date(typeof value === "string" ? value.trim() : "");
  if (!Number.isFinite(candidate.getTime())) return now;

  // Offline outboxes are durable evidence and may legitimately replay months
  // later. Preserve all valid history; clamp only implausible future clock skew.
  const fiveMinutes = 5 * 60 * 1_000;
  return candidate.getTime() > now.getTime() + fiveMinutes ? now : candidate;
}

/**
 * Rebuilds active local-take state exclusively from the durable receipt ledger.
 * An accepted STOP is terminal for a capture ID even when it arrived before a
 * delayed START. Policy-rejected STOP attempts have no state effect, and END
 * clears every take active in the room at that ledger boundary.
 */
export function activeCaptureIdsFromReceiptLedger(
  receipts: readonly CaptureRoomReceiptLedgerEntry[],
): Set<string> {
  const active = new Set<string>();
  const stopped = new Set<string>();

  for (const receipt of receipts) {
    if (
      !receipt.stateApplied
      && (receipt.action !== "STOP_RECORDING" || receipt.outcome === "REJECTED")
    ) continue;

    if (receipt.action === "END") {
      active.clear();
      continue;
    }

    const captureId = receipt.captureId;
    if (!captureId) continue;

    if (receipt.action === "STOP_RECORDING") {
      stopped.add(captureId);
      active.delete(captureId);
      continue;
    }

    if (receipt.action === "START_RECORDING" && !stopped.has(captureId)) {
      active.add(captureId);
    }
  }

  return active;
}

export function captureHasTerminalStop(
  receipts: readonly CaptureRoomReceiptLedgerEntry[],
  captureId: string,
): boolean {
  return receipts.some(
    (receipt) => (
      receipt.captureId === captureId
      && receipt.action === "STOP_RECORDING"
      && (receipt.stateApplied || receipt.outcome !== "REJECTED")
    ),
  );
}

export function captureOwnerUserIdFromReceiptLedger(
  receipts: readonly CaptureRoomReceiptLedgerEntry[],
  captureId: string,
) {
  const ownedBoundary = receipts.find((receipt) => (
    receipt.captureId === captureId
    && Boolean(receipt.actorUserId)
    && receipt.stateApplied
    && (
      receipt.action === "START_RECORDING"
      || receipt.action === "STOP_RECORDING"
    )
  ));
  return ownedBoundary?.actorUserId ?? null;
}

/**
 * Explicit room-state role/action matrix. START is participant-local; OPEN and
 * END are room-control actions; STOP belongs to the actor who owns the capture
 * UUID. A staff override is deliberately limited to crash compensation and is
 * separately persisted by the route.
 */
export function captureRoomActionAuthorizationDecision(args: {
  action: CaptureRoomStateAction;
  actorUserId: string;
  actorIsStaff: boolean;
  actorIsRoomOwner: boolean;
  actorIsBookingCoach: boolean;
  participantRole: CaptureRoomActorRole;
  captureId: string | null;
  priorReceipts: readonly CaptureRoomReceiptLedgerEntry[];
  staffCrashCompensationRequested: boolean;
}): CaptureRoomActionAuthorizationDecision {
  const controlRole = args.actorIsRoomOwner
    || args.actorIsBookingCoach
    || ["HOST", "COACH", "PRODUCER"].includes(args.participantRole || "");
  const participantCanCapture = Boolean(args.participantRole) && args.participantRole !== "OBSERVER";
  const captureOwnerUserId = args.captureId
    ? captureOwnerUserIdFromReceiptLedger(args.priorReceipts, args.captureId)
    : null;

  if (args.action === "OPEN" || args.action === "END") {
    const allowed = args.actorIsStaff || controlRole;
    return {
      allowed,
      errorCode: allowed ? null : "ROOM_CONTROL_ROLE_REQUIRED",
      errorMessage: allowed
        ? null
        : "Only the room owner, coach, host, producer, or staff may open or end this room.",
      captureOwnerUserId: null,
      staffCrashCompensation: false,
    };
  }

  if (args.action === "START_RECORDING") {
    if (!participantCanCapture) {
      return {
        allowed: false,
        errorCode: "CAPTURE_PARTICIPANT_ROLE_REQUIRED",
        errorMessage: "A signed-in, non-observer room participant is required to start recording.",
        captureOwnerUserId,
        staffCrashCompensation: false,
      };
    }
    if (captureOwnerUserId && captureOwnerUserId !== args.actorUserId) {
      return {
        allowed: false,
        errorCode: "CAPTURE_OWNER_MISMATCH",
        errorMessage: "This capture UUID is already owned by another participant.",
        captureOwnerUserId,
        staffCrashCompensation: false,
      };
    }
    return {
      allowed: true,
      errorCode: null,
      errorMessage: null,
      captureOwnerUserId: args.actorUserId,
      staffCrashCompensation: false,
    };
  }

  if (!args.captureId) {
    return {
      allowed: false,
      errorCode: "CAPTURE_ID_REQUIRED",
      errorMessage: "A capture UUID is required to stop recording.",
      captureOwnerUserId,
      staffCrashCompensation: false,
    };
  }
  if (!captureOwnerUserId || captureOwnerUserId === args.actorUserId) {
    return {
      allowed: participantCanCapture || args.actorIsStaff,
      errorCode: participantCanCapture || args.actorIsStaff ? null : "CAPTURE_PARTICIPANT_ROLE_REQUIRED",
      errorMessage: participantCanCapture || args.actorIsStaff
        ? null
        : "A signed-in, non-observer room participant is required to stop recording.",
      captureOwnerUserId: captureOwnerUserId || args.actorUserId,
      staffCrashCompensation: false,
    };
  }
  if (args.actorIsStaff && args.staffCrashCompensationRequested) {
    return {
      allowed: true,
      errorCode: null,
      errorMessage: null,
      captureOwnerUserId,
      staffCrashCompensation: true,
    };
  }
  return {
    allowed: false,
    errorCode: "CAPTURE_STOP_OWNER_REQUIRED",
    errorMessage: "Only the participant who started this capture may stop it; staff must use the audited crash-compensation path.",
    captureOwnerUserId,
    staffCrashCompensation: false,
  };
}

export function shouldApplyCaptureRoomReceipt(args: {
  action: CaptureRoomStateAction;
  captureId: string | null;
  occurredAt: Date;
  priorReceipts: readonly CaptureRoomReceiptLedgerEntry[];
}): boolean {
  return captureRoomReceiptApplicationDecision(args).stateApplied;
}

export function captureRoomReceiptApplicationDecision(args: {
  action: CaptureRoomStateAction;
  captureId: string | null;
  occurredAt: Date;
  priorReceipts: readonly CaptureRoomReceiptLedgerEntry[];
}): CaptureRoomReceiptApplicationDecision {
  if (args.action !== "START_RECORDING") {
    return { stateApplied: true, outcome: "APPLIED" };
  }

  if (args.captureId && args.priorReceipts.some((receipt) => (
    receipt.captureId === args.captureId
    && receipt.action === "START_RECORDING"
    && receipt.stateApplied
  ))) {
    return { stateApplied: false, outcome: "IGNORED_DUPLICATE_START" };
  }

  if (args.captureId && captureHasTerminalStop(args.priorReceipts, args.captureId)) {
    return { stateApplied: false, outcome: "IGNORED_TERMINAL_STOP" };
  }

  const latestEndBoundary = [...args.priorReceipts]
    .reverse()
    .find((receipt) => receipt.stateApplied && receipt.action === "END" && receipt.occurredAt);
  if (
    latestEndBoundary?.occurredAt
    && args.occurredAt.getTime() <= latestEndBoundary.occurredAt.getTime()
  ) {
    return { stateApplied: false, outcome: "IGNORED_PRE_END_BOUNDARY" };
  }

  return { stateApplied: true, outcome: "APPLIED" };
}

export function captureRoomStatusAfterReceipt(args: {
  action: CaptureRoomStateAction;
  currentStatus: CaptureRoomStatus;
  stateApplied: boolean;
  activeCaptureIds: ReadonlySet<string>;
}): CaptureRoomStatus {
  if (!args.stateApplied) return args.currentStatus;
  if (args.action === "END") return "ENDED";
  if (
    args.action === "STOP_RECORDING"
    && ["ENDED", "CANCELED", "FAILED"].includes(args.currentStatus)
  ) {
    return args.currentStatus;
  }
  if (args.activeCaptureIds.size > 0) return "RECORDING";
  if (args.action === "STOP_RECORDING") {
    return args.currentStatus === "RECORDING" ? "OPEN" : args.currentStatus;
  }
  return "OPEN";
}

export function isRetryableCaptureRoomTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { code?: unknown }; cause?: { code?: unknown } };
  const codes = [candidate.code, candidate.meta?.code, candidate.cause?.code]
    .filter((value): value is string => typeof value === "string");

  // P2034 is Prisma's write-conflict/deadlock error. PostgreSQL may surface
  // serialization, deadlock, or unique-conflict SQLSTATEs through the adapter.
  return codes.some((code) => ["P2002", "P2034", "23505", "40001", "40P01"].includes(code));
}
