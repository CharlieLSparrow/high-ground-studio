import { NextResponse } from "next/server";

import {
  isEditableSessionNoteKind,
  isSessionNoteVisibility,
} from "@/lib/session-note-contract";
import { getPrismaClient } from "@/lib/prisma";
import { editSessionNote } from "@/lib/server/session-note-edit";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max: number, preserveLineBreaks = false) {
  if (typeof value !== "string") return "";
  const normalized = preserveLineBreaks ? value.trim() : value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, max);
}

function tagIds(value: unknown) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 24) return undefined;
  const ids = [...new Set(value.map((item) => text(item, 200)).filter(Boolean))].sort();
  return ids.length === value.length ? ids : undefined;
}

async function body(request: Request) {
  try { return record(await request.json()); } catch { return {}; }
}

function statusFor(code: string) {
  if (code === "NOT_FOUND") return 404;
  if (code === "AUDIENCE_AUTHOR_REQUIRED" || code === "PROJECT_ROLE_REQUIRED" || code === "TAGS_UNAVAILABLE") return 403;
  if (code === "CONFLICT" || code === "REQUEST_ID_CONFLICT") return 409;
  return 400;
}

export async function PATCH(request: Request, context: { params: Promise<{ noteId: string }> }) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, code: "AUTH_REQUIRED", error: "Sign in before editing a private note." },
      { status: 401 },
    );
  }

  const { noteId: rawNoteId } = await context.params;
  const noteId = text(rawNoteId, 200);
  const input = await body(request);
  const title = text(input.title, 500);
  const noteBody = text(input.body, 20_000, true);
  const expectedUpdatedAt = new Date(text(input.expectedUpdatedAt, 80));
  const requestedKind = input.kind === undefined
    ? null
    : isEditableSessionNoteKind(input.kind) ? input.kind : undefined;
  const requestedVisibility = input.visibility === undefined
    ? null
    : isSessionNoteVisibility(input.visibility) ? input.visibility : undefined;
  const requestedTagIds = tagIds(input.tagIds);
  const clientRequestId = input.clientRequestId === undefined
    ? null
    : text(input.clientRequestId, 80).toLowerCase();
  const surface = clientRequestId
    ? "ios-capture-session-notes" as const
    : "nest-session-notes" as const;

  if (
    !noteId
    || !noteBody
    || !Number.isFinite(expectedUpdatedAt.getTime())
    || requestedKind === undefined
    || requestedVisibility === undefined
    || requestedTagIds === undefined
    || (clientRequestId !== null && !UUID_PATTERN.test(clientRequestId))
  ) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", error: "Keep some note text and refresh before saving an invalid or incomplete draft." },
      { status: 400 },
    );
  }

  const result = await editSessionNote({
    prisma: getPrismaClient(),
    actor: session.user,
    noteId,
    title,
    body: noteBody,
    kind: requestedKind,
    visibility: requestedVisibility,
    tagIds: requestedTagIds,
    expectedUpdatedAt,
    clientRequestId,
    surface,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: statusFor(result.code) });
  }
  return NextResponse.json({
    ...result,
    boundaries: {
      authorizedCollaborator: true,
      privateAuthorOnly: true,
      canonicalSessionMutationAccess: true,
      sessionAccessRechecked: true,
      projectAuthorityRechecked: true,
      explicitVisibility: true,
      canonicalTagsAtomic: requestedTagIds !== null,
      appendOnlyRevision: true,
      retryIdentityProtected: clientRequestId !== null,
      externalSideEffects: false,
    },
  });
}
