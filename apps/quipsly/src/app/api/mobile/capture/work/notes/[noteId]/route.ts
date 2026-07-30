import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  editCanonicalDocumentNoteInTransaction,
  type CanonicalDocumentNoteEditInput,
} from "@/lib/server/canonical-document-note-edit";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

function cleanId(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function statusFor(code: string) {
  if (code === "INVALID_INPUT") return 400;
  if (code === "NOT_FOUND" || code === "FORBIDDEN") return 404;
  if (
    code === "CONFLICT"
    || code === "IMMUTABLE_SOURCE"
    || code === "ANCHOR_REVIEW_REQUIRED"
  ) return 409;
  return 503;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ noteId: string }> },
) {
  const session = await getQuipslySessionFromRequest(request);
  const actorUserId = cleanId(session?.user?.id);
  const actorEmail = cleanId(
    session?.user?.primaryEmail || session?.user?.email,
    320,
  ).toLowerCase();
  if (!actorUserId || !actorEmail) {
    return NextResponse.json(
      {
        ok: false,
        code: "AUTH_REQUIRED",
        error: "Sign in before editing a private Nest note.",
      },
      { status: 401 },
    );
  }

  let body: Partial<CanonicalDocumentNoteEditInput> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        error: "The protected note edit body is not valid JSON.",
      },
      { status: 400 },
    );
  }
  const { noteId } = await context.params;
  const result = await editCanonicalDocumentNoteInTransaction({
    actorUserId,
    actorEmail,
    documentId: cleanId(noteId),
    expectedContentRevision: cleanId(body.expectedContentRevision, 64),
    clientRequestId: cleanId(body.clientRequestId, 80),
    title: typeof body.title === "string" ? body.title : "",
    blocks: Array.isArray(body.blocks)
      ? body.blocks.map((block) => ({
          id: cleanId(block?.id),
          stableId: cleanId(block?.stableId),
          body: typeof block?.body === "string" ? block.body : "",
        }))
      : [],
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: statusFor(result.code) });
  }

  revalidatePath("/work");
  revalidatePath("/library");
  revalidatePath("/find");
  revalidatePath("/create");
  return NextResponse.json({
    ...result,
    schema: "quipsly-mobile-document-note-edit-v1",
    boundaries: {
      canonicalDocument: true,
      stableBlocksPreserved: true,
      optimisticContentRevision: true,
      protectedOfflineIntentSupported: true,
      anchorsPreservedOrHeldForReview: true,
      tagsChanged: false,
      structureChanged: false,
      sourceMutated: false,
      externalSideEffects: false,
    },
  });
}
