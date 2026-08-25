import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  activeCaptureIdsFromReceiptLedger,
  captureRoomActionAuthorizationDecision,
  captureRoomReceiptApplicationDecision,
  captureRoomStatusAfterReceipt,
  isCaptureRoomStateAction,
  isRetryableCaptureRoomTransactionError,
  normalizedCaptureReceiptOccurredAt,
  type CaptureRoomReceiptLedgerEntry,
  type CaptureRoomStateAction,
  type CaptureRoomStatus,
} from "@/lib/server/capture-room-state-ledger";
import {
  buildMobileCaptureConsentVersions,
  latestMobileCaptureConsentForParticipant,
  mobileCaptureAllPartiesReady,
  mobileCaptureConsentVersion,
} from "@/lib/server/mobile-capture-room-readiness";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uuid(value: unknown) {
  const candidate = text(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)
    ? candidate
    : "";
}

function paymentHoldForRoom(room: any) {
  const paymentPolicy = text(room?.booking?.paymentPolicy).toUpperCase();
  const paymentStatus = text(room?.booking?.paymentRecord?.status).toUpperCase();
  const bookingStatus = text(room?.booking?.status).toUpperCase();
  const needsPaymentEvidence =
    paymentPolicy === "PAID_ONE_TO_ONE" &&
    paymentStatus !== "PAID" &&
    ["HOLDING_PAYMENT", "REQUESTED", "CONFIRMED"].includes(bookingStatus || "HOLDING_PAYMENT");

  return {
    blocked: needsPaymentEvidence,
    paymentPolicy,
    paymentStatus: paymentStatus || "MISSING",
    bookingStatus: bookingStatus || "UNKNOWN",
  };
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function normalizeRoomAction(value: unknown) {
  const action = text(value).toUpperCase();
  return isCaptureRoomStateAction(action) ? action : "";
}

function jsonObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

function isoDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const candidate = new Date(String(value || ""));
  return Number.isFinite(candidate.getTime()) ? candidate.toISOString() : null;
}

function receiptPayload(receipt: any) {
  return {
    receiptId: receipt.receiptId,
    captureId: receipt.captureId ?? null,
    action: receipt.action,
    occurredAt: isoDate(receipt.occurredAt),
    receivedAt: isoDate(receipt.receivedAt),
    userId: receipt.actorUserId,
    source: receipt.source,
    outcome: receipt.outcome,
    stateApplied: receipt.stateApplied,
    roomStatusBefore: receipt.roomStatusBefore ?? null,
    roomStatusAfter: receipt.roomStatusAfter ?? null,
    errorCode: receipt.errorCode ?? null,
  };
}

function participantAndConsent(room: any, userId: string) {
  const participant = room.participants.find((item: any) => item.userId === userId) || null;
  const consent = participant
    ? latestMobileCaptureConsentForParticipant(participant, room.recordingConsents)
    : null;
  return { participant, consent };
}

function sessionPayload(args: {
  room: any;
  participant: any;
  consent: any;
  nextAction: string;
}) {
  return {
    id: args.room.id,
    callRoomId: args.room.id,
    status: args.room.status,
    participantId: args.participant?.id ?? null,
    recordingConsentId: args.consent?.id ?? null,
    recordingConsentStatus: args.consent?.status ?? "not-created",
    recordingConsentGranted:
      args.consent?.status === "GRANTED"
      && args.consent?.canRecordAudio === true
      && Boolean(args.consent?.consentedAt)
      && !args.consent?.revokedAt,
    nextAction: args.nextAction,
  };
}

async function durableReceiptTransaction<T>(
  prisma: any,
  operation: (transaction: any) => Promise<T>,
): Promise<T> {
  const maximumAttempts = 4;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "ReadCommitted",
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      if (attempt === maximumAttempts || !isRetryableCaptureRoomTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 15));
    }
  }
  throw new Error("Capture room transaction retry loop exited unexpectedly.");
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);

  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before updating a capture room." },
      { status: 401 },
    );
  }

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);
  const action = normalizeRoomAction(body.action);
  const rawReceiptId = text(body.receiptId);
  const receiptId = uuid(body.receiptId);
  const rawCaptureId = text(body.captureId);
  const captureId = uuid(body.captureId);
  const sourceType = text(body.sourceType).toLowerCase() === "video" ? "video" : "audio";

  if (!rawReceiptId) {
    return NextResponse.json(
      { ok: false, error: "Capture receiptId is required for every room-state action." },
      { status: 400 },
    );
  }
  if (!receiptId) {
    return NextResponse.json({ ok: false, error: "Capture receiptId must be a UUID." }, { status: 400 });
  }
  if (rawCaptureId && !captureId) {
    return NextResponse.json({ ok: false, error: "Capture captureId must be a UUID." }, { status: 400 });
  }

  if (!callRoomId) {
    return NextResponse.json(
      { ok: false, error: "Choose a Quipsly capture room before updating state." },
      { status: 400 },
    );
  }

  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Choose a valid room action: OPEN, START_RECORDING, STOP_RECORDING, or END." },
      { status: 400 },
    );
  }

  if (["START_RECORDING", "STOP_RECORDING"].includes(action) && !captureId) {
    return NextResponse.json(
      { ok: false, error: "Capture captureId is required for START_RECORDING and STOP_RECORDING receipts." },
      { status: 400 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  const now = new Date();
  const occurredAt = normalizedCaptureReceiptOccurredAt(body.occurredAt, now);
  const source = (text(body.source) || "mobile-capture").slice(0, 160);
  const staffCrashCompensationRequested = body.staffCrashCompensation === true;
  const staffCrashCompensationReason = text(body.staffCrashCompensationReason).slice(0, 1_000);

  try {
    const result = await durableReceiptTransaction(prisma, async (transaction) => {
      const roomAccessWhere = session.user.isStaff
        ? { id: callRoomId }
        : {
            id: callRoomId,
            OR: [
              { createdByUserId: userId },
              { participants: { some: { userId, accessStatus: "ACTIVE" } } },
              { booking: { clientUserId: userId } },
              { booking: { coachUserId: userId } },
            ],
          };
      const accessibleRoom = await transaction.callRoom.findFirst({
        where: roomAccessWhere,
        select: { id: true },
      });

      if (!accessibleRoom) {
        return {
          status: 404,
          body: { ok: false, error: "You do not have access to this capture room." },
        };
      }

      // Serialize the durable receipt ledger by its canonical room row. Under
      // Read Committed, a waiter reads the winner's committed receipt state
      // after acquiring the lock instead of inheriting a stale Serializable
      // snapshot and surfacing P2034 as expected control flow.
      await transaction.$queryRawUnsafe(
        'SELECT "id" FROM "CallRoom" WHERE "id" = $1 FOR UPDATE',
        callRoomId,
      );
      const room = await transaction.callRoom.findFirst({
        where: roomAccessWhere,
        include: {
          booking: { include: { paymentRecord: true } },
          participants: { where: { accessStatus: "ACTIVE" } },
          recordingConsents: true,
        },
      });

      if (!room) {
        return {
          status: 404,
          body: { ok: false, error: "You do not have access to this capture room." },
        };
      }

      const duplicateReceipt = await transaction.captureRoomStateReceipt.findUnique({
        where: { receiptId },
      });
      if (duplicateReceipt) {
        const receiptMetadata = jsonObject(duplicateReceipt.metadataJson);
        const receiptSourceType = text(receiptMetadata.sourceType).toLowerCase() === "video" ? "video" : "audio";
        const requestMatches = duplicateReceipt.roomId === room.id
          && duplicateReceipt.actorUserId === userId
          && duplicateReceipt.action === action
          && (duplicateReceipt.captureId ?? null) === (captureId || null)
          && (action !== "START_RECORDING" || receiptSourceType === sourceType);
        if (!requestMatches) {
          return {
            status: 409,
            body: {
              ok: false,
              error: "Capture receiptId is already bound to a different immutable room-state request.",
              errorCode: "RECEIPT_ID_CONFLICT",
            },
          };
        }

        const { participant, consent } = participantAndConsent(room, userId);
        const nextAction = text(receiptMetadata.nextAction)
          || "Capture room receipt was already persisted; no room state was changed.";
        if (duplicateReceipt.outcome === "REJECTED") {
          return {
            status: duplicateReceipt.httpStatus,
            body: {
              ok: false,
              idempotentReplay: true,
              receiptPersisted: true,
              error: duplicateReceipt.errorMessage || "This capture receipt was rejected.",
              errorCode: duplicateReceipt.errorCode,
              receipt: receiptPayload(duplicateReceipt),
              ...receiptMetadata,
              nextAction,
            },
          };
        }

        return {
          status: duplicateReceipt.httpStatus,
          body: {
            ok: true,
            idempotentReplay: true,
            receiptPersisted: true,
            stateApplied: duplicateReceipt.stateApplied,
            receipt: receiptPayload(duplicateReceipt),
            session: sessionPayload({ room, participant, consent, nextAction }),
          },
        };
      }

      let participant = room.participants.find((item: any) => item.userId === userId) || null;
      let consent = participant
        ? latestMobileCaptureConsentForParticipant(participant, room.recordingConsents)
        : null;

      // Business-rule rejections are receipts too. Persist the immutable 409
      // outcome so retries cannot later mutate room state after consent/payment
      // changes. iOS recognizes receiptPersisted, marks the protected local entry
      // terminal (without deleting its evidence), and surfaces operator attention.
      const persistRejectedReceipt = async (args: {
        errorCode: string;
        errorMessage: string;
        nextAction: string;
        metadata?: Record<string, unknown>;
        httpStatus?: number;
        captureOwnerUserId?: string | null;
      }) => {
        const httpStatus = args.httpStatus ?? 409;
        const metadataJson = {
          ...(args.metadata ?? {}),
          nextAction: args.nextAction,
          participantId: participant?.id ?? null,
          recordingConsentId: consent?.id ?? null,
          sourceType,
        };
        const receipt = await transaction.captureRoomStateReceipt.create({
          data: {
            receiptId,
            roomId: room.id,
            captureId: captureId || null,
            actorUserId: userId,
            captureOwnerUserId: args.captureOwnerUserId ?? null,
            action,
            source,
            occurredAt,
            receivedAt: now,
            outcome: "REJECTED",
            stateApplied: false,
            roomStatusBefore: room.status,
            roomStatusAfter: room.status,
            httpStatus,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            metadataJson,
          },
        });
        return {
          status: httpStatus,
          body: {
            ok: false,
            receiptPersisted: true,
            error: args.errorMessage,
            errorCode: args.errorCode,
            receipt: receiptPayload(receipt),
            ...(args.metadata ?? {}),
            nextAction: args.nextAction,
          },
        };
      };

      // A local STOP is factual crash-compensation evidence even when another
      // actor already closed the room. Persist it as an applied no-op boundary;
      // every other mutation still requires OPEN first.
      if (
        ["ENDED", "CANCELED", "FAILED"].includes(room.status)
        && action !== "OPEN"
        && action !== "STOP_RECORDING"
      ) {
        return persistRejectedReceipt({
          errorCode: "ROOM_CLOSED",
          errorMessage: "This capture room is closed. Reopen it before changing recording state.",
          nextAction: "Reopen the room with a new receipt before changing recording state.",
        });
      }

      const participants = [...room.participants];
      if (!participant) {
        const role = room.booking?.coachUserId === userId
          ? "COACH"
          : room.booking?.clientUserId === userId
            ? "CLIENT"
            : "GUEST";
        participant = await transaction.callParticipant.create({
          data: {
            roomId: room.id,
            userId,
            displayName: session.user.name || session.user.primaryEmail || "Quipsly participant",
            email: session.user.primaryEmail,
            role,
            deviceLabel: "Quipsly iOS Capture",
          },
        });
        participants.push(participant);
      }

      consent = latestMobileCaptureConsentForParticipant(participant, room.recordingConsents);

      const priorRows = await transaction.captureRoomStateReceipt.findMany({
        where: { roomId: room.id },
        orderBy: [{ sequence: "asc" }],
        select: {
          receiptId: true,
          sequence: true,
          captureId: true,
          actorUserId: true,
          action: true,
          outcome: true,
          stateApplied: true,
          occurredAt: true,
          receivedAt: true,
        },
      });
      const priorReceipts = priorRows as CaptureRoomReceiptLedgerEntry[];
      const roomActionAuthorization = captureRoomActionAuthorizationDecision({
        action: action as CaptureRoomStateAction,
        actorUserId: userId,
        actorIsStaff: session.user.isStaff,
        actorIsRoomOwner: room.createdByUserId === userId,
        actorIsBookingCoach: room.booking?.coachUserId === userId,
        participantRole: participant?.role ?? null,
        captureId: captureId || null,
        priorReceipts,
        staffCrashCompensationRequested,
      });
      if (!roomActionAuthorization.allowed) {
        return persistRejectedReceipt({
          errorCode: roomActionAuthorization.errorCode || "ROOM_ACTION_NOT_AUTHORIZED",
          errorMessage: roomActionAuthorization.errorMessage || "This actor cannot apply the requested room action.",
          nextAction: "Keep the protected local receipt and ask the capture owner or room controller to apply this action.",
          captureOwnerUserId: roomActionAuthorization.captureOwnerUserId,
          metadata: {
            roleActionMatrixVersion: 1,
            participantRole: participant?.role ?? null,
          },
          httpStatus: 403,
        });
      }
      if (
        roomActionAuthorization.staffCrashCompensation
        && staffCrashCompensationReason.length < 12
      ) {
        return persistRejectedReceipt({
          errorCode: "STAFF_CRASH_COMPENSATION_REASON_REQUIRED",
          errorMessage: "Staff crash compensation requires an audit reason of at least 12 characters.",
          nextAction: "Retry the STOP with a specific crash-compensation reason; no capture ownership changed.",
          captureOwnerUserId: roomActionAuthorization.captureOwnerUserId,
          httpStatus: 400,
        });
      }

      const paymentHold = paymentHoldForRoom(room);
      if (action === "START_RECORDING" && paymentHold.blocked) {
        const paymentBoundary = {
          paymentPolicy: paymentHold.paymentPolicy,
          paymentStatus: paymentHold.paymentStatus,
          bookingStatus: paymentHold.bookingStatus,
          stripeIsEvidenceOnly: true,
          noPaymentMutation: true,
        };
        return persistRejectedReceipt({
          errorCode: "PAYMENT_EVIDENCE_REQUIRED",
          errorMessage: "Recording cannot start for a paid one-to-one coaching session until payment evidence is resolved.",
          nextAction: "Resolve payment evidence in Quipsly before starting local or provider recording.",
          metadata: { callRoomId: room.id, paymentBoundary },
          captureOwnerUserId: roomActionAuthorization.captureOwnerUserId,
        });
      }

      const allPartyConsentVersions = action === "START_RECORDING"
        ? buildMobileCaptureConsentVersions({
            participants,
            consents: room.recordingConsents,
          })
        : [];
      const allPartyConsentVersion = action === "START_RECORDING"
        ? mobileCaptureConsentVersion(allPartyConsentVersions)
        : null;

      if (
        action === "START_RECORDING"
        && (
          consent?.status !== "GRANTED"
          || consent.canRecordAudio !== true
          || (sourceType === "video" && consent.canRecordVideo !== true)
          || !consent.consentedAt
          || consent.revokedAt
        )
      ) {
        return persistRejectedReceipt({
          errorCode: "PARTICIPANT_CONSENT_REQUIRED",
          errorMessage: `Recording cannot be marked started until this participant has granted ${sourceType}-recording consent.`,
          nextAction: "Grant this participant's recording consent, then begin a new capture take with a new receipt.",
        });
      }

      if (action === "START_RECORDING") {
        const allRegisteredConsentGranted = mobileCaptureAllPartiesReady(
          allPartyConsentVersions,
          sourceType,
        );
        if (!allRegisteredConsentGranted) {
          return persistRejectedReceipt({
            errorCode: "ALL_PARTICIPANT_CONSENT_REQUIRED",
            errorMessage: `Every signed-in, non-observer participant must grant ${sourceType}-recording consent before the room is marked recording.`,
            nextAction: `Collect explicit ${sourceType}-recording consent from every signed-in participant, then begin a new capture take with a new receipt.`,
          });
        }
      }
      const applicationDecision = captureRoomReceiptApplicationDecision({
        action: action as CaptureRoomStateAction,
        captureId: captureId || null,
        occurredAt,
        priorReceipts,
      });
      const stateApplied = applicationDecision.stateApplied;
      const candidateReceipt: CaptureRoomReceiptLedgerEntry = {
        receiptId,
        captureId: captureId || null,
        actorUserId: userId,
        action: action as CaptureRoomStateAction,
        stateApplied,
        occurredAt,
        receivedAt: now,
      };
      const activeCaptureIds = activeCaptureIdsFromReceiptLedger([...priorReceipts, candidateReceipt]);
      const nextStatus = captureRoomStatusAfterReceipt({
        action: action as CaptureRoomStateAction,
        currentStatus: room.status as CaptureRoomStatus,
        stateApplied,
        activeCaptureIds,
      });
      const outcome = applicationDecision.outcome;
      const nextAction = !stateApplied
        ? outcome === "IGNORED_PRE_END_BOUNDARY"
          ? "The delayed START predates the latest END boundary; it was preserved but did not resurrect recording state."
          : outcome === "IGNORED_DUPLICATE_START"
            ? "This capture already has an applied START receipt; the duplicate was preserved without changing state."
          : "This take already has a durable STOP receipt; the delayed START was preserved but did not resurrect recording state."
        : nextStatus === "RECORDING"
          ? "Room is marked recording. Keep the visible recording indicator on."
          : nextStatus === "ENDED"
            ? "Room ended. Upload and transcript review can continue."
            : action === "OPEN"
              ? "Room is open. Existing consent choices remain saved; recording still starts separately."
              : "Room state updated. Recording still starts separately.";
      const roomMetadata = jsonObject(room.metadataJson);
      const updateData: Record<string, unknown> = {
        status: nextStatus,
        metadataJson: {
          ...roomMetadata,
          mobileCaptureRoomReceiptLedgerVersion: 1,
          mobileCaptureRoomReceiptLedgerTable: "CaptureRoomStateReceipt",
          mobileActiveCaptureIds: [...activeCaptureIds],
          ...(stateApplied
            ? {
                lastMobileStateAction: action,
                lastMobileStateActionAt: now.toISOString(),
                lastMobileStateOccurredAt: occurredAt.toISOString(),
                lastMobileStateActionByUserId: userId,
                lastMobileStateReceiptId: receiptId,
              }
            : {
                lastIgnoredMobileStateAction: action,
                lastIgnoredMobileStateActionAt: now.toISOString(),
                lastIgnoredMobileStateReceiptId: receiptId,
              }),
        },
      };
      if (stateApplied && action === "OPEN" && !room.openedAt) updateData.openedAt = now;
      if (stateApplied && action === "START_RECORDING" && !room.recordingStartedAt) {
        updateData.recordingStartedAt = occurredAt;
      }
      if (stateApplied && action === "END") updateData.endedAt = now;

      const createdReceipt = await transaction.captureRoomStateReceipt.create({
        data: {
          receiptId,
          roomId: room.id,
          captureId: captureId || null,
          actorUserId: userId,
          captureOwnerUserId: roomActionAuthorization.captureOwnerUserId,
          action,
          source,
          occurredAt,
          receivedAt: now,
          outcome,
          stateApplied,
          roomStatusBefore: room.status,
          roomStatusAfter: nextStatus,
          httpStatus: 200,
          actorConsentId: action === "START_RECORDING" ? consent?.id ?? null : null,
          consentVersion: allPartyConsentVersion,
          staffCrashCompensation: roomActionAuthorization.staffCrashCompensation,
          metadataJson: {
            nextAction,
            participantId: participant.id,
            recordingConsentId: consent?.id ?? null,
            sourceType,
            roleActionMatrixVersion: 1,
            captureOwnerUserId: roomActionAuthorization.captureOwnerUserId,
            allPartyConsentVersion,
            allPartyConsentVersions,
            ...(roomActionAuthorization.staffCrashCompensation
              ? {
                  staffCrashCompensation: {
                    version: 1,
                    reason: staffCrashCompensationReason,
                    staffUserId: userId,
                    startOwnerUserId: roomActionAuthorization.captureOwnerUserId,
                    appliedAt: now.toISOString(),
                  },
                }
              : {}),
          },
        },
      });
      const updated = await transaction.callRoom.update({
        where: { id: room.id },
        data: updateData,
      });

      return {
        status: 200,
        body: {
          ok: true,
          receiptPersisted: true,
          stateApplied,
          receipt: receiptPayload(createdReceipt),
          session: sessionPayload({
            room: updated,
            participant,
            consent,
            nextAction,
          }),
        },
      };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[mobile-capture room state] durable receipt transaction failed", {
      receiptId,
      callRoomId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "The capture receipt could not reach the durable room ledger. Keep the local receipt and retry.",
        errorCode: "DURABLE_RECEIPT_UNAVAILABLE",
      },
      { status: 503, headers: { "Retry-After": "1" } },
    );
  }
}
