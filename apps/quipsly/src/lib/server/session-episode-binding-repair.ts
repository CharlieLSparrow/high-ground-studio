import "server-only";

import { Prisma } from "@prisma/client";

import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { sessionMutationAccessWhere, type SessionAccessActor } from "@/lib/server/session-access";
import { resolveSessionEpisodeBinding } from "@/lib/server/session-episode-binding";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

export class SessionEpisodeBindingRepairError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409,
    readonly details: JsonRecord = {},
  ) {
    super(message);
    this.name = "SessionEpisodeBindingRepairError";
  }
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function expectedDate(value: unknown) {
  const raw = text(value, 64);
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.valueOf())) {
    throw new SessionEpisodeBindingRepairError(
      "Refresh this Session before repairing its Episode relationship.",
      "EXPECTED_ROOM_VERSION_REQUIRED",
      400,
    );
  }
  return parsed;
}

function responseFromReceipt(receipt: any, idempotentReplay: boolean) {
  return {
    idempotentReplay,
    receipt: {
      id: receipt.id,
      requestId: receipt.requestId,
      roomId: receipt.roomId,
      projectId: receipt.projectId,
      action: String(receipt.action),
      previousEpisodeProductionId: receipt.previousEpisodeProductionId,
      previousEpisodeSlug: receipt.previousEpisodeSlug,
      nextEpisodeProductionId: receipt.nextEpisodeProductionId,
      nextEpisodeSlug: receipt.nextEpisodeSlug,
      reason: receipt.reason,
      roomUpdatedAtBefore: receipt.roomUpdatedAtBefore.toISOString(),
      roomUpdatedAtAfter: receipt.roomUpdatedAtAfter.toISOString(),
      createdAt: receipt.createdAt.toISOString(),
    },
    boundaries: {
      canonicalSessionRelationshipChanged: receipt.action !== "NOOP",
      immutableSourcesChanged: false,
      recordingChanged: false,
      transcriptChanged: false,
      participantsChanged: false,
      sessionThreadChanged: false,
      episodeThreadChanged: false,
      calendarChanged: false,
      invitationsSent: false,
      publicationChanged: false,
      externalSideEffects: false,
    },
  };
}

export async function repairSessionEpisodeBinding(input: {
  prisma: any;
  actor: SessionAccessActor;
  roomId: unknown;
  episodeSlug: unknown;
  requestId: unknown;
  expectedRoomUpdatedAt: unknown;
  confirmRebind?: unknown;
  reason?: unknown;
}) {
  const roomId = text(input.roomId, 240);
  const episodeSlug = text(input.episodeSlug, 200);
  const requestId = text(input.requestId, 64).toLowerCase();
  const actorEmail = text(input.actor.primaryEmail || input.actor.email, 320).toLowerCase();
  const expectedRoomUpdatedAt = expectedDate(input.expectedRoomUpdatedAt);
  const reason = text(input.reason, 500) || null;
  if (!roomId || !episodeSlug || !UUID_PATTERN.test(requestId) || !input.actor.id || !actorEmail) {
    throw new SessionEpisodeBindingRepairError(
      "A Session, exact Episode, signed-in actor, and stable UUID request identity are required.",
      "INVALID_EPISODE_BINDING_REPAIR",
      400,
    );
  }

  return input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `session-episode-binding:${roomId}`);

    const replay = await tx.callRoomEpisodeBindingReceipt.findUnique({
      where: { requestId },
    });
    if (replay) {
      const replayAuthorized = await tx.callRoom.findFirst({
        where: sessionMutationAccessWhere(roomId, input.actor),
        select: { id: true },
      });
      if (!replayAuthorized) {
        throw new SessionEpisodeBindingRepairError(
          "This Session is not available for Episode relationship repair.",
          "SESSION_NOT_FOUND",
          404,
        );
      }
      if (
        replay.roomId !== roomId
        || replay.actorUserId !== input.actor.id
        || replay.actorEmail !== actorEmail
        || replay.nextEpisodeSlug !== episodeSlug
      ) {
        throw new SessionEpisodeBindingRepairError(
          "This request identity already belongs to a different Episode relationship decision.",
          "REQUEST_ID_CONFLICT",
        );
      }
      return responseFromReceipt(replay, true);
    }

    const room = await tx.callRoom.findFirst({
      where: sessionMutationAccessWhere(roomId, input.actor),
      select: {
        id: true,
        projectId: true,
        purpose: true,
        episodeProductionId: true,
        episodeProduction: { select: { id: true, projectId: true, slug: true } },
        metadataJson: true,
        updatedAt: true,
      },
    });
    if (!room) {
      throw new SessionEpisodeBindingRepairError(
        "This Session is not available for Episode relationship repair.",
        "SESSION_NOT_FOUND",
        404,
      );
    }
    if (room.purpose !== "PODCAST") {
      throw new SessionEpisodeBindingRepairError(
        "Only a podcast recording Session can be bound to an Episode Room.",
        "PODCAST_SESSION_REQUIRED",
        400,
      );
    }
    if (!room.projectId) {
      throw new SessionEpisodeBindingRepairError(
        "Connect this recording Session to a Nest before choosing its Episode Room.",
        "SESSION_PROJECT_REQUIRED",
      );
    }
    if (room.updatedAt.valueOf() !== expectedRoomUpdatedAt.valueOf()) {
      throw new SessionEpisodeBindingRepairError(
        "This Session changed after the relationship choices loaded. Refresh and review the current relationship before saving.",
        "STALE_SESSION_VERSION",
        409,
        { currentRoomUpdatedAt: room.updatedAt.toISOString() },
      );
    }

    const binding = await resolveSessionEpisodeBinding({
      prisma: tx,
      projectId: room.projectId,
      purpose: room.purpose,
      episodeSlug,
    });
    const previousEpisodeProductionId = room.episodeProductionId;
    const previousEpisodeSlug = room.episodeProduction?.slug
      || text(record(room.metadataJson).episodeSlug, 200)
      || null;
    const sameBinding = previousEpisodeProductionId === binding.episodeProductionId;
    const rebind = Boolean(previousEpisodeProductionId && !sameBinding);
    if (rebind && input.confirmRebind !== true) {
      throw new SessionEpisodeBindingRepairError(
        "This Session already points to a different Episode. Confirm the rebind and explain why before changing production continuity.",
        "REBIND_CONFIRMATION_REQUIRED",
      );
    }
    if (rebind && (!reason || reason.length < 8)) {
      throw new SessionEpisodeBindingRepairError(
        "Explain the Episode rebind in at least eight characters so collaborators can audit the correction.",
        "REBIND_REASON_REQUIRED",
        400,
      );
    }

    let roomUpdatedAtAfter = room.updatedAt;
    const action = sameBinding ? "NOOP" : rebind ? "REBIND" : "BIND";
    if (!sameBinding) {
      const updated = await tx.callRoom.updateMany({
        where: {
          id: room.id,
          projectId: room.projectId,
          purpose: "PODCAST",
          updatedAt: room.updatedAt,
          episodeProductionId: previousEpisodeProductionId,
        },
        data: {
          episodeProductionId: binding.episodeProductionId,
          metadataJson: {
            ...record(room.metadataJson),
            episodeSlug: binding.episodeSlug,
            episodeBindingSource: "session-episode-binding-repair",
          } as Prisma.InputJsonValue,
        },
      });
      if (updated.count !== 1) {
        throw new SessionEpisodeBindingRepairError(
          "This Session changed while the relationship was being saved. Refresh before trying again.",
          "STALE_SESSION_VERSION",
        );
      }
      const updatedRoom = await tx.callRoom.findUnique({
        where: { id: room.id },
        select: { updatedAt: true },
      });
      if (!updatedRoom) {
        throw new SessionEpisodeBindingRepairError(
          "The repaired Session could not be read back.",
          "SESSION_READBACK_FAILED",
          500,
        );
      }
      roomUpdatedAtAfter = updatedRoom.updatedAt;
    }

    const receipt = await tx.callRoomEpisodeBindingReceipt.create({
      data: {
        requestId,
        roomId: room.id,
        projectId: room.projectId,
        actorUserId: input.actor.id,
        actorEmail,
        action,
        previousEpisodeProductionId,
        previousEpisodeSlug,
        nextEpisodeProductionId: binding.episodeProductionId,
        nextEpisodeSlug: binding.episodeSlug,
        reason,
        expectedRoomUpdatedAt,
        roomUpdatedAtBefore: room.updatedAt,
        roomUpdatedAtAfter,
        metadataJson: {
          schema: "quipsly-session-episode-binding-receipt-v1",
          episodeResolvedBy: "same-project-compound-key",
          legacyMetadataRetained: true,
          externalSideEffects: false,
        },
      },
    });
    return responseFromReceipt(receipt, false);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 20_000,
  });
}
