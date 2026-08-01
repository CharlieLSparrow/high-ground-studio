import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";
import {
  decryptGoogleRefreshToken,
  getGoogleCalendarOAuthConfig,
  GoogleCalendarOAuthError,
  refreshGoogleCalendarAccess,
} from "@/lib/server/google-calendar-oauth";
import {
  buildSessionCalendarProjectionPreview,
  buildSessionCalendarSnapshot,
  cancelSessionGoogleCalendarProjection,
  SessionCalendarProjectionError,
  writeSessionGoogleCalendarProjection,
} from "@/lib/server/google-calendar-session-projection";
import { mobileSessionScheduledTimezone } from "@/lib/server/mobile-capture-session-schedule";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere, sessionMutationAccessWhere } from "@/lib/server/session-access";

export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function purposeForRoom(purpose: string) {
  if (purpose === "PODCAST") return "PODCAST_PRODUCTION";
  if (purpose === "COACHING") return "COACHING";
  return null;
}

async function projectionContext(input: {
  request: Request;
  roomId: string;
  collectionId: string;
  actor: { id: string; email: string; primaryEmail: string; isStaff: boolean };
  action?: "read" | "write";
  prisma: any;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: input.action === "write"
      ? sessionMutationAccessWhere(input.roomId, input.actor)
      : sessionAccessWhere(input.roomId, input.actor),
    select: {
      id: true,
      title: true,
      purpose: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      metadataJson: true,
      projectId: true,
      booking: { select: { timezone: true } },
    },
  });
  if (!room) throw new SessionCalendarProjectionError("That Session is unavailable.", "session-not-found", 404);
  if (!room.scheduledStart || !room.scheduledEnd) {
    throw new SessionCalendarProjectionError("Schedule the Session in Quipsly before previewing a provider event.", "session-not-scheduled", 409);
  }
  const collectionPurpose = purposeForRoom(room.purpose);
  if (!collectionPurpose) {
    throw new SessionCalendarProjectionError("Google projection is currently available for podcast and coaching Sessions.", "unsupported-session-purpose", 409);
  }
  const collection = await input.prisma.calendarCollection.findFirst({
    where: {
      id: input.collectionId,
      purpose: collectionPurpose,
      status: "ACTIVE",
      connection: {
        userId: input.actor.id,
        provider: "GOOGLE",
        connectionKind: "USER_OAUTH",
        status: "VERIFIED",
      },
      OR: [
        { ownerUserId: input.actor.id },
        ...(room.projectId ? [{ nestId: room.projectId }] : []),
      ],
    },
    include: {
      connection: { include: { oauthCredential: true } },
    },
  });
  if (!collection?.providerCalendarId) {
    throw new SessionCalendarProjectionError("Choose an owned Google calendar for this Quipsly lane first.", "calendar-selection-not-found", 409);
  }
  const snapshot = buildSessionCalendarSnapshot({
    roomId: room.id,
    title: room.title,
    purpose: room.purpose,
    roomStatus: room.status,
    scheduledStart: room.scheduledStart,
    scheduledEnd: room.scheduledEnd,
    timezone: mobileSessionScheduledTimezone(room.metadataJson, room.booking?.timezone) || collection.timezone || "UTC",
    url: new URL(`/sessions/${encodeURIComponent(room.id)}`, resolveCalendarPublicOrigin(input.request.url)).toString(),
    providerVisibility: collection.visibility === "TEAM" ? "default" : "private",
  });
  const existing = await input.prisma.calendarProjection.findUnique({
    where: {
      collectionId_sourceType_sourceId: {
        collectionId: collection.id,
        sourceType: "CallRoom",
        sourceId: room.id,
      },
    },
  });
  return {
    room,
    collection,
    preview: buildSessionCalendarProjectionPreview({ snapshot, existing }),
  };
}

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const collectionId = new URL(request.url).searchParams.get("collectionId")?.trim() || "";
  if (!collectionId) return json({ ok: false, error: "Choose a Google calendar selection first." }, 400);
  try {
    const { roomId } = await context.params;
    const result = await projectionContext({
      request,
      roomId,
      collectionId,
      actor: session.user,
      prisma: getPrismaClient() as any,
    });
    return json({
      ok: true,
      collection: { id: result.collection.id, displayName: result.collection.displayName, purpose: result.collection.purpose },
      preview: result.preview,
      externalSideEffects: false,
    });
  } catch (error) {
    const known = error instanceof SessionCalendarProjectionError;
    return json({ ok: false, error: known ? error.message : "The Session calendar preview is temporarily unavailable.", externalSideEffects: false }, known ? error.status : 503);
  }
}

export async function POST(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string" ? body.expectedSourceRevision.trim() : "";
  if (!collectionId || !expectedSourceRevision) {
    return json({ ok: false, error: "Preview this exact Session revision before confirming the Google write.", externalSideEffects: false }, 400);
  }
  const prisma = getPrismaClient() as any;
  let result: Awaited<ReturnType<typeof projectionContext>> | null = null;
  let providerWriteAttempted = false;
  let providerExternalMutated: boolean | null = null;
  try {
    const { roomId } = await context.params;
    const current = await projectionContext({ request, roomId, collectionId, actor: session.user, action: "write", prisma });
    result = current;
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({ ok: false, error: "The Session changed after preview. Review the current event before confirming.", code: "stale-session-preview", externalSideEffects: false }, 409);
    }
    if (current.preview.snapshot.status === "CANCELLED") {
      return json({ ok: false, error: current.preview.warning, code: "cancellation-requires-separate-action", externalSideEffects: false }, 409);
    }
    const credential = current.collection.connection.oauthCredential;
    if (!credential?.encryptedPayload) {
      throw new SessionCalendarProjectionError("Reconnect Google Calendar before writing this event.", "missing-encrypted-credential", 409);
    }
    const config = getGoogleCalendarOAuthConfig(request.url);
    const refreshToken = decryptGoogleRefreshToken(credential.encryptedPayload, config.encryptionKey);
    const accessToken = await refreshGoogleCalendarAccess({ refreshToken, config });
    providerWriteAttempted = !["NOOP", "BLOCKED", "CANCEL"].includes(current.preview.action);
    const provider = await writeSessionGoogleCalendarProjection({
      preview: current.preview,
      accessToken,
      calendarId: current.collection.providerCalendarId,
    });
    providerExternalMutated = provider.externalMutated;
    const occurredAt = new Date();
    const providerUpdatedAt = provider.providerUpdatedAt ? new Date(provider.providerUpdatedAt) : null;
    const operation = current.preview.action === "CREATE" ? "CREATE_EVENT" : current.preview.action === "UPDATE" ? "UPDATE_EVENT" : "READ_EVENT";
    const persisted = await prisma.$transaction(async (transaction: any) => {
      const projection = await transaction.calendarProjection.upsert({
        where: {
          collectionId_sourceType_sourceId: {
            collectionId: current.collection.id,
            sourceType: "CallRoom",
            sourceId: current.room.id,
          },
        },
        create: {
          collectionId: current.collection.id,
          sourceType: "CallRoom",
          sourceId: current.room.id,
          sourceRevision: current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: provider.providerEtag,
          providerUpdatedAt,
          uid: current.preview.uid,
          status: "SYNCED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: { schema: "quipsly-session-calendar-projection-v1", sendUpdates: "none", attendeesIncluded: false },
        },
        update: {
          sourceRevision: current.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: provider.providerEtag,
          providerUpdatedAt,
          sequence: { increment: provider.externalMutated ? 1 : 0 },
          status: "SYNCED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: { schema: "quipsly-session-calendar-projection-v1", sendUpdates: "none", attendeesIncluded: false },
        },
      });
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: current.collection.connectionId,
          collectionId: current.collection.id,
          projectionId: projection.id,
          actorUserId: session.user.id,
          operation,
          outcome: provider.outcome === "NOOP" ? "SKIPPED" : "SUCCEEDED",
          requestDigest: current.preview.sourceRevision,
          responseDigest: provider.providerEtag || provider.providerEventId,
          providerStatus: provider.recoveredCreate ? "recovered-create" : provider.providerStatus,
          externalMutated: provider.externalMutated,
          occurredAt,
          metadataJson: { schema: "quipsly-session-calendar-sync-receipt-v1", sendUpdates: "none", attendeesIncluded: false, recoveredCreate: provider.recoveredCreate },
        },
      });
      return { projection, receipt };
    });
    return json({
      ok: true,
      result: {
        projectionId: persisted.projection.id,
        receiptId: persisted.receipt.id,
        sourceRevision: current.preview.sourceRevision,
        action: current.preview.action,
        externalMutated: provider.externalMutated,
        recoveredCreate: provider.recoveredCreate,
      },
    });
  } catch (error) {
    const known = error instanceof SessionCalendarProjectionError || error instanceof GoogleCalendarOAuthError;
    if (result && error instanceof SessionCalendarProjectionError && error.code === "provider-etag-conflict" && result.preview.existing?.projectionId) {
      const conflictResult = result;
      await prisma.$transaction(async (transaction: any) => {
        await transaction.calendarProjection.update({ where: { id: conflictResult.preview.existing!.projectionId }, data: { conflictState: "EXTERNAL_CHANGED" } });
        await transaction.calendarSyncReceipt.create({ data: {
          connectionId: conflictResult.collection.connectionId,
          collectionId: conflictResult.collection.id,
          projectionId: conflictResult.preview.existing!.projectionId,
          actorUserId: session.user.id,
          operation: "UPDATE_EVENT",
          outcome: "CONFLICT",
          requestDigest: conflictResult.preview.sourceRevision,
          providerStatus: "etag-conflict",
          externalMutated: false,
          metadataJson: { schema: "quipsly-session-calendar-sync-receipt-v1", lostUpdatePrevented: true },
        } });
      }).catch((receiptError: unknown) => {
        console.error("[calendar-session-projection] Could not persist the provider conflict receipt.", receiptError);
      });
    }
    return json({
      ok: false,
      error: known ? error.message : "The Google Calendar event could not be synchronized safely.",
      code: known ? error.code : "provider-sync-failed",
      providerWriteAttempted,
      externalSideEffects:
        providerExternalMutated === true
          ? true
          : providerWriteAttempted && providerExternalMutated === null
            ? "unknown"
            : false,
      nextAction:
        providerWriteAttempted && providerExternalMutated === null
          ? "Retry the same preview. Quipsly will recover the deterministic event instead of creating a duplicate."
          : undefined,
    }, known ? error.status : 503);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ roomId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) return json({ ok: false, error: "Authentication required." }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const collectionId = typeof body?.collectionId === "string" ? body.collectionId.trim() : "";
  const expectedSourceRevision = typeof body?.expectedSourceRevision === "string" ? body.expectedSourceRevision.trim() : "";
  if (!collectionId || !expectedSourceRevision || body?.confirmCancellation !== true) {
    return json({
      ok: false,
      error: "Preview this exact canceled Session and explicitly confirm Google Calendar removal.",
      externalSideEffects: false,
    }, 400);
  }

  const prisma = getPrismaClient() as any;
  let current: Awaited<ReturnType<typeof projectionContext>> | null = null;
  let providerWriteAttempted = false;
  let providerExternalMutated: boolean | null = null;
  let providerCancellation: Awaited<ReturnType<typeof cancelSessionGoogleCalendarProjection>> | null = null;
  try {
    const { roomId } = await context.params;
    current = await projectionContext({ request, roomId, collectionId, actor: session.user, action: "write", prisma });
    if (current.preview.sourceRevision !== expectedSourceRevision) {
      return json({
        ok: false,
        error: "The Session changed after preview. Review the current cancellation before confirming.",
        code: "stale-session-preview",
        externalSideEffects: false,
      }, 409);
    }
    if (current.preview.snapshot.status !== "CANCELLED") {
      return json({
        ok: false,
        error: "This Session is not canceled in Quipsly. No Google event was removed.",
        code: "session-not-cancelled",
        externalSideEffects: false,
      }, 409);
    }

    if (current.preview.action === "NOOP" && current.preview.existing?.status === "CANCELED") {
      const priorReceipt = await prisma.calendarSyncReceipt.findFirst({
        where: {
          connectionId: current.collection.connectionId,
          collectionId: current.collection.id,
          projectionId: current.preview.existing.projectionId,
          operation: "CANCEL_EVENT",
          requestDigest: current.preview.sourceRevision,
          outcome: { in: ["SUCCEEDED", "SKIPPED"] },
        },
        orderBy: { occurredAt: "desc" },
        select: { id: true, externalMutated: true, providerStatus: true, metadataJson: true },
      });
      if (priorReceipt) {
        const receiptMetadata = priorReceipt.metadataJson && typeof priorReceipt.metadataJson === "object"
          ? priorReceipt.metadataJson as Record<string, unknown>
          : {};
        return json({
          ok: true,
          result: {
            projectionId: current.preview.existing.projectionId,
            receiptId: priorReceipt.id,
            sourceRevision: current.preview.sourceRevision,
            action: "CANCEL",
            externalMutated: priorReceipt.externalMutated,
            providerAlreadyAbsent: receiptMetadata.providerAlreadyAbsent === true,
            idempotentReplay: true,
            providerStatus: priorReceipt.providerStatus,
          },
        });
      }
    }

    let accessToken = "";
    if (current.preview.action === "CANCEL") {
      const credential = current.collection.connection.oauthCredential;
      if (!credential?.encryptedPayload) {
        throw new SessionCalendarProjectionError(
          "Reconnect Google Calendar before removing this event.",
          "missing-encrypted-credential",
          409,
        );
      }
      const config = getGoogleCalendarOAuthConfig(request.url);
      const refreshToken = decryptGoogleRefreshToken(credential.encryptedPayload, config.encryptionKey);
      accessToken = await refreshGoogleCalendarAccess({ refreshToken, config });
      providerWriteAttempted = true;
    }
    const provider = await cancelSessionGoogleCalendarProjection({
      preview: current.preview,
      accessToken,
      calendarId: current.collection.providerCalendarId,
    });
    providerCancellation = provider;
    providerExternalMutated = provider.externalMutated;

    const afterProvider = await projectionContext({
      request,
      roomId,
      collectionId,
      actor: session.user,
      action: "write",
      prisma,
    });
    const occurredAt = new Date();
    if (afterProvider.preview.sourceRevision !== current.preview.sourceRevision) {
      if (!providerWriteAttempted && !provider.providerEventId) {
        return json({
          ok: false,
          error: "The Session changed while Quipsly was confirming that no Google event existed. Preview it again.",
          code: "stale-session-preview",
          externalSideEffects: false,
        }, 409);
      }
      const conflict = await prisma.$transaction(async (transaction: any) => {
        const projection = await transaction.calendarProjection.upsert({
          where: {
            collectionId_sourceType_sourceId: {
              collectionId: current!.collection.id,
              sourceType: "CallRoom",
              sourceId: current!.room.id,
            },
          },
          create: {
            collectionId: current!.collection.id,
            sourceType: "CallRoom",
            sourceId: current!.room.id,
            sourceRevision: current!.preview.sourceRevision,
            providerEventId: provider.providerEventId,
            providerEtag: null,
            uid: current!.preview.uid,
            status: "CONFLICT",
            conflictState: "QUIPSLY_CHANGED",
            lastSyncedAt: occurredAt,
            metadataJson: {
              schema: "quipsly-session-calendar-projection-v1",
              cancellationConfirmed: true,
              sourceChangedAfterProviderEffect: true,
              observedCurrentSourceRevision: afterProvider.preview.sourceRevision,
              sendUpdates: "none",
              attendeesIncluded: false,
            },
          },
          update: {
            sourceRevision: current!.preview.sourceRevision,
            providerEventId: provider.providerEventId,
            providerEtag: null,
            sequence: { increment: provider.externalMutated ? 1 : 0 },
            status: "CONFLICT",
            conflictState: "QUIPSLY_CHANGED",
            lastSyncedAt: occurredAt,
            metadataJson: {
              schema: "quipsly-session-calendar-projection-v1",
              cancellationConfirmed: true,
              sourceChangedAfterProviderEffect: true,
              observedCurrentSourceRevision: afterProvider.preview.sourceRevision,
              sendUpdates: "none",
              attendeesIncluded: false,
            },
          },
        });
        const receipt = await transaction.calendarSyncReceipt.create({
          data: {
            connectionId: current!.collection.connectionId,
            collectionId: current!.collection.id,
            projectionId: projection.id,
            actorUserId: session.user.id,
            operation: "CANCEL_EVENT",
            outcome: "CONFLICT",
            requestDigest: current!.preview.sourceRevision,
            responseDigest: provider.providerEventId || provider.providerStatus,
            providerStatus: provider.providerStatus,
            externalMutated: provider.externalMutated,
            occurredAt,
            metadataJson: {
              schema: "quipsly-session-calendar-sync-receipt-v1",
              sourceChangedAfterProviderEffect: true,
              observedCurrentSourceRevision: afterProvider.preview.sourceRevision,
              providerAlreadyAbsent: provider.providerAlreadyAbsent,
              sendUpdates: "none",
              attendeesIncluded: false,
            },
          },
        });
        return { projection, receipt };
      });
      return json({
        ok: false,
        error: "Google cancellation was observed, but the Quipsly Session changed during the operation. Review the recorded conflict before projecting again.",
        code: "source-changed-after-provider-effect",
        projectionId: conflict.projection.id,
        receiptId: conflict.receipt.id,
        externalSideEffects: provider.externalMutated,
      }, 409);
    }

    const persisted = await prisma.$transaction(async (transaction: any) => {
      const projection = await transaction.calendarProjection.upsert({
        where: {
          collectionId_sourceType_sourceId: {
            collectionId: current!.collection.id,
            sourceType: "CallRoom",
            sourceId: current!.room.id,
          },
        },
        create: {
          collectionId: current!.collection.id,
          sourceType: "CallRoom",
          sourceId: current!.room.id,
          sourceRevision: current!.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: null,
          uid: current!.preview.uid,
          status: "CANCELED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: {
            schema: "quipsly-session-calendar-projection-v1",
            cancellationConfirmed: true,
            providerAlreadyAbsent: provider.providerAlreadyAbsent,
            providerEventIdRetainedForAudit: Boolean(provider.providerEventId),
            sendUpdates: "none",
            attendeesIncluded: false,
          },
        },
        update: {
          sourceRevision: current!.preview.sourceRevision,
          providerEventId: provider.providerEventId,
          providerEtag: null,
          sequence: { increment: provider.externalMutated ? 1 : 0 },
          status: "CANCELED",
          conflictState: "NONE",
          lastSyncedAt: occurredAt,
          metadataJson: {
            schema: "quipsly-session-calendar-projection-v1",
            cancellationConfirmed: true,
            providerAlreadyAbsent: provider.providerAlreadyAbsent,
            providerEventIdRetainedForAudit: Boolean(provider.providerEventId),
            sendUpdates: "none",
            attendeesIncluded: false,
          },
        },
      });
      const receipt = await transaction.calendarSyncReceipt.create({
        data: {
          connectionId: current!.collection.connectionId,
          collectionId: current!.collection.id,
          projectionId: projection.id,
          actorUserId: session.user.id,
          operation: "CANCEL_EVENT",
          outcome: provider.externalMutated ? "SUCCEEDED" : "SKIPPED",
          requestDigest: current!.preview.sourceRevision,
          responseDigest: provider.providerEventId || provider.providerStatus,
          providerStatus: provider.providerStatus,
          externalMutated: provider.externalMutated,
          occurredAt,
          metadataJson: {
            schema: "quipsly-session-calendar-sync-receipt-v1",
            providerAlreadyAbsent: provider.providerAlreadyAbsent,
            sendUpdates: "none",
            attendeesIncluded: false,
          },
        },
      });
      return { projection, receipt };
    });
    return json({
      ok: true,
      result: {
        projectionId: persisted.projection.id,
        receiptId: persisted.receipt.id,
        sourceRevision: current.preview.sourceRevision,
        action: "CANCEL",
        externalMutated: provider.externalMutated,
        providerAlreadyAbsent: provider.providerAlreadyAbsent,
      },
    });
  } catch (error) {
    const known = error instanceof SessionCalendarProjectionError || error instanceof GoogleCalendarOAuthError;
    if (
      current
      && providerCancellation
      && providerWriteAttempted
      && current.preview.existing?.projectionId
    ) {
      const conflictCurrent = current;
      const observedProvider = providerCancellation;
      try {
        const receipt = await prisma.$transaction(async (transaction: any) => {
          await transaction.calendarProjection.update({
            where: { id: conflictCurrent.preview.existing!.projectionId },
            data: {
              providerEventId: observedProvider.providerEventId,
              providerEtag: null,
              sequence: { increment: observedProvider.externalMutated ? 1 : 0 },
              status: "CONFLICT",
              conflictState: "QUIPSLY_CHANGED",
              lastSyncedAt: new Date(),
              metadataJson: {
                schema: "quipsly-session-calendar-projection-v1",
                cancellationConfirmed: true,
                postProviderVerificationFailed: true,
                providerAlreadyAbsent: observedProvider.providerAlreadyAbsent,
                sendUpdates: "none",
                attendeesIncluded: false,
              },
            },
          });
          return transaction.calendarSyncReceipt.create({
            data: {
              connectionId: conflictCurrent.collection.connectionId,
              collectionId: conflictCurrent.collection.id,
              projectionId: conflictCurrent.preview.existing!.projectionId,
              actorUserId: session.user.id,
              operation: "CANCEL_EVENT",
              outcome: "CONFLICT",
              requestDigest: conflictCurrent.preview.sourceRevision,
              responseDigest: observedProvider.providerEventId || observedProvider.providerStatus,
              providerStatus: observedProvider.providerStatus,
              externalMutated: observedProvider.externalMutated,
              metadataJson: {
                schema: "quipsly-session-calendar-sync-receipt-v1",
                postProviderVerificationFailed: true,
                providerAlreadyAbsent: observedProvider.providerAlreadyAbsent,
                sendUpdates: "none",
                attendeesIncluded: false,
              },
            },
          });
        });
        return json({
          ok: false,
          error: "Google cancellation was observed, but Session authority or source truth changed before Quipsly could verify the result. Review the recorded conflict.",
          code: "post-provider-verification-failed",
          projectionId: conflictCurrent.preview.existing!.projectionId,
          receiptId: receipt.id,
          providerWriteAttempted: true,
          externalSideEffects: observedProvider.externalMutated,
        }, 409);
      } catch (receiptError) {
        console.error("[calendar-session-projection] Could not persist the post-provider cancellation receipt.", receiptError);
        return json({
          ok: false,
          error: "Google cancellation was observed, but Quipsly could not save its verification receipt. Do not repeat with a different event; retry this exact cancellation after storage recovers.",
          code: "post-provider-receipt-failed",
          providerWriteAttempted: true,
          externalSideEffects: observedProvider.externalMutated,
        }, 503);
      }
    }
    if (current && error instanceof SessionCalendarProjectionError && error.code === "provider-etag-conflict" && current.preview.existing?.projectionId) {
      const conflictCurrent = current;
      await prisma.$transaction(async (transaction: any) => {
        await transaction.calendarProjection.update({
          where: { id: conflictCurrent.preview.existing!.projectionId },
          data: { conflictState: "EXTERNAL_CHANGED", status: "CONFLICT" },
        });
        await transaction.calendarSyncReceipt.create({
          data: {
            connectionId: conflictCurrent.collection.connectionId,
            collectionId: conflictCurrent.collection.id,
            projectionId: conflictCurrent.preview.existing!.projectionId,
            actorUserId: session.user.id,
            operation: "CANCEL_EVENT",
            outcome: "CONFLICT",
            requestDigest: conflictCurrent.preview.sourceRevision,
            providerStatus: "etag-conflict",
            externalMutated: false,
            metadataJson: {
              schema: "quipsly-session-calendar-sync-receipt-v1",
              lostDeletePrevented: true,
              sendUpdates: "none",
              attendeesIncluded: false,
            },
          },
        });
      }).catch((receiptError: unknown) => {
        console.error("[calendar-session-projection] Could not persist the provider cancellation conflict receipt.", receiptError);
      });
    }
    return json({
      ok: false,
      error: known ? error.message : "The Google Calendar event could not be removed safely.",
      code: known ? error.code : "provider-cancel-failed",
      providerWriteAttempted,
      externalSideEffects:
        providerExternalMutated === true
          ? true
          : providerWriteAttempted && providerExternalMutated === null
            ? "unknown"
            : false,
      nextAction:
        providerWriteAttempted && providerExternalMutated === null
          ? "Retry the same cancellation preview. If Google already removed the event, Quipsly will record that exact absence without another effect."
          : undefined,
    }, known ? error.status : 503);
  }
}
