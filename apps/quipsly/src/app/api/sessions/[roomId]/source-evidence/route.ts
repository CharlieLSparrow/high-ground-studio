import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { sessionAccessWhere } from "@/lib/server/session-access";

import {
  buildSessionSourceEvidence,
  buildSessionSourceEvidenceReceipt,
} from "../../../../(app)/sessions/[roomId]/session-source-evidence-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string, error: string) {
  return Response.json(
    { ok: false, code, error, externalSideEffects: false },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return jsonError(
      401,
      "UNAUTHORIZED",
      "Sign in before downloading private Session source evidence.",
    );
  }

  const { roomId } = await context.params;
  try {
    const prisma = getPrismaClient() as any;
    const room = await prisma.callRoom.findFirst({
      where: sessionAccessWhere(roomId, session.user),
      select: {
        id: true,
        recordingAssets: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            roomId: true,
            fileName: true,
            kind: true,
            status: true,
            byteSize: true,
            storageBucket: true,
            storageObjectPath: true,
            checksum: true,
            verifiedAt: true,
            recordedStartedAt: true,
            recordedStoppedAt: true,
            localManifestJson: true,
          },
        },
        stateReceipts: {
          where: { captureId: { not: null } },
          orderBy: { sequence: "asc" },
          select: {
            receiptId: true,
            captureId: true,
            actorUserId: true,
            action: true,
            outcome: true,
            stateApplied: true,
            occurredAt: true,
            receivedAt: true,
          },
        },
      },
    });
    if (!room) {
      return jsonError(
        404,
        "SESSION_NOT_FOUND",
        "This private Session is unavailable.",
      );
    }

    const finalizationReceipts = await prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { roomId: room.id },
      orderBy: { updatedAt: "desc" },
      select: {
        uploadSessionId: true,
        captureId: true,
        roomId: true,
        actorUserId: true,
        startReceiptId: true,
        processingDisposition: true,
        transcriptDisposition: true,
        recordingAssetId: true,
        metadataJson: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const evidence = buildSessionSourceEvidence({
      roomId: room.id,
      recordingAssets: room.recordingAssets,
      finalizationReceipts,
      stateReceipts: room.stateReceipts,
    });
    const receipt = buildSessionSourceEvidenceReceipt({
      roomId: room.id,
      generatedAt: new Date(),
      evidence,
    });
    return new Response(`${JSON.stringify(receipt, null, 2)}\n`, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="quipsly-nest-source-evidence.json"',
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[session-source-evidence] receipt read failed", error);
    return jsonError(
      503,
      "SOURCE_EVIDENCE_UNAVAILABLE",
      "Quipsly could not read the private source evidence. No recording, transcript, or cloud object changed.",
    );
  }
}
