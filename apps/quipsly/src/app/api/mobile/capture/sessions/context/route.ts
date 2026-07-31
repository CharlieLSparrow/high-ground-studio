import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  buildNextCaptureSessionContext,
  hasStoredCaptureSessionContextV2,
  projectCaptureSessionContext,
  readCaptureSessionContext,
  validateCaptureSessionContextReplacement,
} from "@/lib/server/mobile-capture-session-context";
import {
  captureRoomAccessWhere,
  roomJoinText as text,
} from "@/lib/server/mobile-capture-room-join-diagnostics";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const SOURCE_OF_TRUTH = "Quipsly CallRoom.metadataJson.captureSessionContext";
const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_RESPONSE_HEADERS,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(request: Request) {
  try {
    const value = await request.json();
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function roomSelect() {
  return {
    id: true,
    bookingId: true,
    projectId: true,
    title: true,
    purpose: true,
    status: true,
    metadataJson: true,
    updatedAt: true,
  };
}

async function authenticate(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return {
      response: privateJson(
        { ok: false, code: "UNAUTHORIZED", error: "Sign in before syncing capture session context." },
        401,
      ),
    };
  }
  return { user: session.user };
}

async function findRoom(prisma: any, callRoomId: string, user: any) {
  if (!callRoomId) return null;
  return prisma.callRoom.findFirst({
    where: captureRoomAccessWhere(callRoomId, user),
    select: roomSelect(),
  });
}

function missingRoomResponse(callRoomId: string) {
  if (!callRoomId) {
    return privateJson(
      { ok: false, code: "CALL_ROOM_REQUIRED", error: "Choose a Quipsly capture room before syncing notes, goals, or tasks." },
      400,
    );
  }
  return privateJson(
    { ok: false, code: "CALL_ROOM_NOT_FOUND", error: "You do not have access to this capture room." },
    404,
  );
}

function contextPayload(room: any, options: {
  saved?: boolean;
  unchanged?: boolean;
  projectionStats?: Record<string, number> | null;
  nextAction?: string;
} = {}) {
  const metadata = isObject(room.metadataJson) ? room.metadataJson : {};
  const context = readCaptureSessionContext(room.id, metadata.captureSessionContext);

  return {
    ok: true,
    sourceOfTruth: SOURCE_OF_TRUTH,
    localDraftAllowed: true,
    externalSideEffects: false,
    durableProjections: true,
    callRoomId: room.id,
    revisionId: context.revisionId,
    schemaVersion: context.schemaVersion,
    room: {
      id: room.id,
      title: room.title,
      purpose: room.purpose,
      status: room.status,
    },
    // note/goals/tasks remain alongside structured entries for installed and
    // string-array clients. New clients round-trip revisionId + entries.
    context,
    ...(options.saved === undefined ? {} : { saved: options.saved }),
    ...(options.unchanged === undefined ? {} : { unchanged: options.unchanged }),
    ...(options.projectionStats ? { projectionStats: options.projectionStats } : {}),
    nextAction: options.nextAction
      || "Use this context before, during, and after the session. Phone drafts remain local recovery copies; Nest owns shared revision and projection truth.",
  };
}

function conflictPayload(room: any, body: Record<string, unknown>, userId: string, reason = "stale-revision") {
  const metadata = isObject(room.metadataJson) ? room.metadataJson : {};
  const remoteContext = readCaptureSessionContext(room.id, metadata.captureSessionContext);
  const localPreview = buildNextCaptureSessionContext({
    roomId: room.id,
    body,
    current: remoteContext,
    actorUserId: userId,
    source: "ios-capture-conflict-preview",
  }).context;
  const submittedRevisionId = text(body.revisionId) || null;

  return {
    ok: false,
    conflict: true,
    code: "SESSION_CONTEXT_STALE_REVISION",
    reason,
    error: "Nest changed after this phone draft was loaded. The server kept both versions and did not overwrite either one.",
    sourceOfTruth: SOURCE_OF_TRUTH,
    localDraftAllowed: true,
    externalSideEffects: false,
    callRoomId: room.id,
    revisionId: remoteContext.revisionId,
    submittedRevisionId,
    remoteContext,
    localContext: {
      ...localPreview,
      revisionId: submittedRevisionId || localPreview.revisionId,
      parentRevisionId: submittedRevisionId,
    },
    retryable: true,
    nextAction: "Review the Nest version beside the preserved phone draft. Choose one explicitly, then save again from the latest Nest revision.",
  };
}

class ConcurrentSessionContextWrite extends Error {}

export async function GET(request: Request) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const callRoomId = text(new URL(request.url).searchParams.get("callRoomId"));
  if (!callRoomId) return missingRoomResponse(callRoomId);

  const prisma = getPrismaClient() as any;
  const room = await findRoom(prisma, callRoomId, auth.user);
  if (!room) return missingRoomResponse(callRoomId);

  return privateJson(contextPayload(room));
}

export async function POST(request: Request) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const callRoomId = text(body.callRoomId);
  if (!callRoomId) return missingRoomResponse(callRoomId);

  const replacement = validateCaptureSessionContextReplacement(body);
  if (!replacement.ok) {
    return privateJson(
      { ok: false, code: replacement.code, error: replacement.error, localDraftAllowed: true },
      400,
    );
  }

  const prisma = getPrismaClient() as any;

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const room = await findRoom(tx, callRoomId, auth.user);
      if (!room) return { kind: "missing" as const };

      const metadata = isObject(room.metadataJson) ? room.metadataJson : {};
      const storedContext = metadata.captureSessionContext;
      const current = readCaptureSessionContext(room.id, storedContext);
      const submittedRevisionId = text(body.revisionId);
      const currentIsV2 = hasStoredCaptureSessionContextV2(storedContext);

      // A legacy string-only client gets one safe migration save. Once a v2
      // revision exists, an absent or stale revision must never overwrite it.
      if ((currentIsV2 && !submittedRevisionId) || (submittedRevisionId && submittedRevisionId !== current.revisionId)) {
        return { kind: "conflict" as const, room };
      }

      const next = buildNextCaptureSessionContext({
        roomId: room.id,
        body,
        current,
        actorUserId: auth.user.id,
        source: "ios-capture",
        forceRevision: !currentIsV2,
      });

      if (!next.changed && currentIsV2) {
        return { kind: "saved" as const, room, unchanged: true, projectionStats: null };
      }

      const projected = await projectCaptureSessionContext({
        tx,
        room,
        context: next.context,
        actorUserId: auth.user.id,
      });

      const updated = await tx.callRoom.updateMany({
        where: { id: room.id, updatedAt: room.updatedAt },
        data: {
          metadataJson: {
            ...metadata,
            captureSessionContext: projected.context,
          },
        },
      });
      if (updated.count !== 1) throw new ConcurrentSessionContextWrite();

      const savedRoom = await tx.callRoom.findFirst({
        where: captureRoomAccessWhere(callRoomId, auth.user),
        select: roomSelect(),
      });
      if (!savedRoom) throw new ConcurrentSessionContextWrite();

      return {
        kind: "saved" as const,
        room: savedRoom,
        unchanged: false,
        projectionStats: projected.stats,
      };
    }, { isolationLevel: "Serializable" });

    if (result.kind === "missing") return missingRoomResponse(callRoomId);
    if (result.kind === "conflict") {
      return privateJson(conflictPayload(result.room, body, auth.user.id), 409);
    }

    return privateJson(contextPayload(result.room, {
      saved: true,
      unchanged: result.unchanged,
      projectionStats: result.projectionStats,
      nextAction: result.unchanged
        ? "Nest already has this exact session context revision; no duplicate notes, goals, or tasks were created."
        : "Nest saved one revision and projected explicit notes, goals, and tasks into durable session records. Transcript inference remains a separate review boundary.",
    }));
  } catch (error: any) {
    if (error instanceof ConcurrentSessionContextWrite || error?.code === "P2034") {
      const latestRoom = await findRoom(prisma, callRoomId, auth.user);
      if (!latestRoom) return missingRoomResponse(callRoomId);
      return privateJson(
        conflictPayload(latestRoom, body, auth.user.id, "concurrent-room-write"),
        409,
      );
    }

    console.error("Capture session context save failed", error);
    return privateJson(
      {
        ok: false,
        code: "SESSION_CONTEXT_SAVE_FAILED",
        error: "Nest could not save this session context. The phone draft remains available; retry after checking the service.",
        localDraftAllowed: true,
        externalSideEffects: false,
      },
      503,
    );
  }
}
