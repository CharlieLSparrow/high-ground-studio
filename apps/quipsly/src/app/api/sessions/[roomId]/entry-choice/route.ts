import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  parseSessionEntryChoice,
  SESSION_ENTRY_CHOICE_EVENT_NAMES,
  SESSION_ENTRY_CHOICE_SCHEMA,
  SESSION_ENTRY_CHOICES,
  summarizeSessionEntryChoiceEvents,
} from "@/lib/session-entry-choice";
import { acquirePrismaAdvisoryTransactionLock } from "@/lib/server/prisma-advisory-lock";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  sessionAccessWhere,
  sessionInvitationAccessWhere,
} from "@/lib/server/session-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

function roomID(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_-]{1,240}$/.test(id) ? id : "";
}

async function requestBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before choosing how to join this Session." },
      401,
    );
  }
  const id = roomID((await context.params).roomId);
  const choice = parseSessionEntryChoice((await requestBody(request)).choice);
  if (!id || !choice) {
    return privateJson(
      { ok: false, code: "INVALID_ENTRY_CHOICE", error: "Choose the browser, Capture, or TestFlight entry path." },
      400,
    );
  }

  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(id, session.user),
    select: { id: true, purpose: true },
  });
  if (!room) {
    return privateJson(
      { ok: false, code: "NOT_FOUND", error: "This Session is not available to this account." },
      404,
    );
  }

  const eventName = SESSION_ENTRY_CHOICE_EVENT_NAMES[choice];
  const result = await prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(
      tx,
      `quipsly:session-entry-choice:${room.id}:${session.user.id}:${choice}`,
    );
    const existing = await tx.userEvent.findFirst({
      where: {
        userId: session.user.id,
        eventName,
        payloadJson: { path: ["roomId"], equals: room.id },
      },
      select: { id: true },
    });
    if (existing) return { id: existing.id, idempotentReplay: true };
    const created = await tx.userEvent.create({
      data: {
        userId: session.user.id,
        eventName,
        payloadJson: {
          schema: SESSION_ENTRY_CHOICE_SCHEMA,
          roomId: room.id,
          purpose: String(room.purpose || "SESSION"),
          choice,
          surface: "session-app-handoff",
          measurement: choice === "TESTFLIGHT"
            ? "public-link-click-not-install"
            : choice === "CAPTURE_APP"
              ? "native-open-attempt-not-confirmed-open"
              : "browser-call-opened",
        },
      },
      select: { id: true },
    });
    return { id: created.id, idempotentReplay: false };
  });

  return privateJson({
    ok: true,
    choice,
    idempotentReplay: result.idempotentReplay,
    boundaries: {
      grantsAccess: false,
      joinsCall: false,
      startsRecording: false,
      testFlightClickIsInstallProof: false,
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return privateJson(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before reading Session entry choices." },
      401,
    );
  }
  const id = roomID((await context.params).roomId);
  if (!id) {
    return privateJson({ ok: false, code: "NOT_FOUND", error: "Session not found." }, 404);
  }
  const prisma = getPrismaClient() as any;
  const room = await prisma.callRoom.findFirst({
    where: sessionInvitationAccessWhere(id, session.user),
    select: { id: true },
  });
  if (!room) {
    return privateJson(
      { ok: false, code: "NOT_FOUND", error: "Entry-choice metrics are available only to this Session's host." },
      404,
    );
  }
  const rows = await prisma.userEvent.findMany({
    where: {
      eventName: { in: SESSION_ENTRY_CHOICES.map((choice) => SESSION_ENTRY_CHOICE_EVENT_NAMES[choice]) },
      payloadJson: { path: ["roomId"], equals: room.id },
    },
    select: { userId: true, eventName: true },
    take: 10_000,
  });
  return privateJson({
    ok: true,
    ...summarizeSessionEntryChoiceEvents(rows),
    boundaries: {
      selectionsNotInstalls: true,
      appleTestFlightMetricsRemainInstallAuthority: true,
    },
  });
}
