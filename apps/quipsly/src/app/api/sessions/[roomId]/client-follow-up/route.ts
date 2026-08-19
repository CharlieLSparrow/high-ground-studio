import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  acknowledgeClientFollowUp,
  ClientFollowUpError,
  createClientFollowUpDraft,
  exportClientFollowUp,
  parseClientFollowUpDraft,
  readClientFollowUp,
  releaseClientFollowUp,
  revokeClientFollowUp,
  updateClientFollowUpDraft,
} from "@/lib/server/session-client-follow-up";

export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
};

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

async function requestBody(request: Request) {
  try {
    return object(await request.json());
  } catch {
    return {};
  }
}

async function actor(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  return session?.user?.id ? session.user : null;
}

function handled(error: unknown) {
  if (error instanceof ClientFollowUpError) {
    return privateJson(
      {
        ok: false,
        code: error.code,
        error: error.message,
        ...(error.details ?? {}),
      },
      error.status,
    );
  }
  console.error("[client-follow-up] operation failed", error);
  return privateJson(
    {
      ok: false,
      code: "FOLLOW_UP_UNAVAILABLE",
      error:
        "Quipsly could not verify this private client follow-up. Nothing was released or changed.",
    },
    503,
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const signedInActor = await actor(request);
  if (!signedInActor)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before opening a client follow-up.",
      },
      401,
    );
  const roomId = text((await context.params).roomId);
  if (!roomId)
    return privateJson(
      {
        ok: false,
        code: "ROOM_REQUIRED",
        error: "Choose one Session before opening a client follow-up.",
      },
      400,
    );
  try {
    const result = await readClientFollowUp(getPrismaClient() as any, {
      roomId,
      actor: signedInActor,
    });
    return privateJson({ ok: true, ...result });
  } catch (error) {
    return handled(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const signedInActor = await actor(request);
  if (!signedInActor)
    return privateJson(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before changing a client follow-up.",
      },
      401,
    );
  const roomId = text((await context.params).roomId);
  const body = await requestBody(request);
  const action = text(body.action, 40).toUpperCase();
  const clientRequestId = text(body.clientRequestId, 80).toLowerCase();
  if (!roomId)
    return privateJson(
      {
        ok: false,
        code: "ROOM_REQUIRED",
        error: "Choose one Session before changing a client follow-up.",
      },
      400,
    );
  if (!UUID_PATTERN.test(clientRequestId)) {
    return privateJson(
      {
        ok: false,
        code: "REQUEST_ID_REQUIRED",
        error:
          "A stable request identity is required for this client follow-up operation.",
      },
      400,
    );
  }

  const prisma = getPrismaClient() as any;
  try {
    if (action === "CREATE_DRAFT") {
      const result = await createClientFollowUpDraft(prisma, {
        roomId,
        actor: signedInActor,
        draft: parseClientFollowUpDraft(body),
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          releasedToClient: false,
          externalMessageSent: false,
          providerCalendarMutated: false,
          publicationPerformed: false,
        },
      });
    }

    const outputId = text(body.outputId);
    if (!outputId)
      return privateJson(
        {
          ok: false,
          code: "OUTPUT_REQUIRED",
          error: "Choose one client follow-up before changing its state.",
        },
        400,
      );
    if (action === "UPDATE_DRAFT") {
      const expectedRevision = integer(body.expectedRevision);
      if (!expectedRevision) {
        return privateJson(
          {
            ok: false,
            code: "REVISION_REQUIRED",
            error: "Refresh the private draft before saving changes.",
          },
          400,
        );
      }
      const result = await updateClientFollowUpDraft(prisma, {
        roomId,
        outputId,
        actor: signedInActor,
        expectedRevision,
        draft: parseClientFollowUpDraft(body),
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          privateDraftRevised: true,
          releasedToClient: false,
          externalMessageSent: false,
          providerCalendarMutated: false,
          publicationPerformed: false,
        },
      });
    }
    if (action === "ACKNOWLEDGE_OPEN") {
      const result = await acknowledgeClientFollowUp(prisma, {
        roomId,
        outputId,
        actor: signedInActor,
        clientRequestId,
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          recipientConfirmedOpen: true,
          externalMessageSent: false,
        },
      });
    }
    if (action === "EXPORT") {
      const expectedRevision = integer(body.expectedRevision);
      const expectedContentSha256 = text(body.expectedContentSha256, 64).toLowerCase();
      if (!expectedRevision || !/^[a-f0-9]{64}$/.test(expectedContentSha256)) {
        return privateJson(
          {
            ok: false,
            code: "EXPORT_SNAPSHOT_REQUIRED",
            error: "Refresh the exact client-safe snapshot before preparing its file.",
          },
          400,
        );
      }
      const result = await exportClientFollowUp(prisma, {
        roomId,
        outputId,
        actor: signedInActor,
        clientRequestId,
        expectedRevision,
        expectedContentSha256,
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          localFilePrepared: true,
          externalDeliveryConfirmed: false,
          externalMessageSent: false,
          sourceRecordsChanged: false,
        },
      });
    }

    const expectedRevision = integer(body.expectedRevision);
    if (!expectedRevision) {
      return privateJson(
        {
          ok: false,
          code: "REVISION_REQUIRED",
          error: "Refresh the client follow-up before changing its visibility.",
        },
        400,
      );
    }
    if (action === "RELEASE") {
      const result = await releaseClientFollowUp(prisma, {
        roomId,
        outputId,
        actor: signedInActor,
        expectedRevision,
        clientRequestId,
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          releasedInApp: true,
          recipientUserIdImmutable: true,
          externalMessageSent: false,
          providerCalendarMutated: false,
          publicationPerformed: false,
        },
      });
    }
    if (action === "REVOKE") {
      const result = await revokeClientFollowUp(prisma, {
        roomId,
        outputId,
        actor: signedInActor,
        expectedRevision,
        clientRequestId,
      });
      return privateJson({
        ok: true,
        ...result,
        boundaries: {
          inAppVisibilityRevoked: true,
          sourceRecordsUnchanged: true,
          externalMessageSent: false,
        },
      });
    }
    return privateJson(
      {
        ok: false,
        code: "INVALID_ACTION",
        error:
          "Choose create draft, revise draft, release, revoke, export, or confirm-open for this client follow-up.",
      },
      400,
    );
  } catch (error) {
    return handled(error);
  }
}
