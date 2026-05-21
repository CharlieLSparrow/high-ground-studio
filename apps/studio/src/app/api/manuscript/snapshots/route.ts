import { NextResponse, type NextRequest } from "next/server";

import { safeManuscriptDraft } from "@/app/manuscript/manuscript-editor-model";
import { getStudioAccessState } from "@/lib/server/studio-access";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  createStudioManuscriptSnapshot,
  getStudioManuscriptSnapshot,
  listStudioManuscriptSnapshots,
} from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getSnapshotOwnerEmail() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to use manuscript snapshots.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot access Studio snapshots.", 403),
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

function snapshotServiceUnavailable(error: unknown) {
  console.error("Studio manuscript snapshot request failed.", error);

  return jsonError(
    "Server manuscript snapshots are not available in this environment.",
    503,
  );
}

function assertSnapshotPersistenceConfigured() {
  if (getStudioDatabaseUrl()) {
    return null;
  }

  return jsonError(
    "Server manuscript snapshots need a configured Studio database.",
    503,
  );
}

export async function GET(request: NextRequest) {
  const unavailableResponse = assertSnapshotPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getSnapshotOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  try {
    const snapshotId = request.nextUrl.searchParams.get("id")?.trim() ?? "";

    if (snapshotId) {
      const snapshot = await getStudioManuscriptSnapshot({
        ownerEmail: owner.ownerEmail,
        snapshotId,
      });

      return NextResponse.json({ ok: true, snapshot });
    }

    const snapshots = await listStudioManuscriptSnapshots({
      ownerEmail: owner.ownerEmail,
    });

    return NextResponse.json({ ok: true, snapshots });
  } catch (error) {
    return snapshotServiceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const unavailableResponse = assertSnapshotPersistenceConfigured();

  if (unavailableResponse) {
    return unavailableResponse;
  }

  const owner = await getSnapshotOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("Snapshot request body must be valid JSON.", 400);
  }

  const requestBody =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as {
          draft?: unknown;
          description?: unknown;
          snapshotType?: unknown;
        })
      : null;
  const draft = safeManuscriptDraft(requestBody?.draft);

  if (!draft) {
    return jsonError("Snapshot draft did not match ManuscriptDraft shape.", 400);
  }

  if (
    typeof requestBody?.snapshotType === "string" &&
    requestBody.snapshotType !== "manual"
  ) {
    return jsonError("Only manual manuscript snapshots are supported.", 400);
  }

  try {
    const snapshot = await createStudioManuscriptSnapshot({
      ownerEmail: owner.ownerEmail,
      draft,
      description:
        typeof requestBody?.description === "string"
          ? requestBody.description
          : null,
    });

    return NextResponse.json({ ok: true, snapshot }, { status: 201 });
  } catch (error) {
    return snapshotServiceUnavailable(error);
  }
}
