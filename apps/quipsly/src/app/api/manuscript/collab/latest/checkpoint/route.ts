import { NextResponse, type NextRequest } from "next/server";

import { safeManuscriptDraft } from "@/app/manuscript/manuscript-editor-model";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { markStudioManuscriptLiveRoomCheckpoint } from "@/lib/server/studio-manuscript-collab";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { createStudioManuscriptSnapshot } from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getCheckpointOwnerEmail() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to save a live edit checkpoint.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot save live edit checkpoints.", 403),
    };
  }

  const ownerEmail =
    access.session?.user?.primaryEmail || access.session?.user?.email || "";

  if (!ownerEmail) {
    return {
      ok: false as const,
      response: jsonError("Studio session is missing an owner email.", 400),
    };
  }

  return {
    ok: true as const,
    ownerEmail,
  };
}

export async function POST(request: NextRequest) {
  if (!getStudioDatabaseUrl()) {
    return jsonError("Live edit checkpoints need the Studio database.", 503);
  }

  const owner = await getCheckpointOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Checkpoint request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { draft?: unknown; description?: unknown })
      : null;
  const draft = safeManuscriptDraft(requestBody?.draft);

  if (!draft) {
    return jsonError("Checkpoint draft did not match ManuscriptDraft shape.", 400);
  }

  try {
    const snapshot = await createStudioManuscriptSnapshot({
      ownerEmail: owner.ownerEmail,
      draft,
      description:
        typeof requestBody?.description === "string"
          ? requestBody.description
          : "Live edit checkpoint",
      manuscriptId: null,
    });

    if (!snapshot) {
      return jsonError("Could not save the live edit checkpoint.", 404);
    }

    const room = await markStudioManuscriptLiveRoomCheckpoint({
      snapshotId: snapshot.id,
    });

    return NextResponse.json({ ok: true, snapshot, room }, { status: 201 });
  } catch (error) {
    console.error("Studio live edit checkpoint failed.", error);

    return jsonError("Live edit checkpoint could not be saved.", 503);
  }
}
