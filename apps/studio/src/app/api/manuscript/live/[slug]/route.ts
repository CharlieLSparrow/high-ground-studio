import { NextResponse, type NextRequest } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import {
  getLatestStudioManuscriptSnapshotForLiveSlug,
  isStudioManuscriptLiveSlug,
  normalizeStudioManuscriptLiveSlug,
} from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const params = await context.params;
  const slug = normalizeStudioManuscriptLiveSlug(params.slug);

  if (!isStudioManuscriptLiveSlug(slug)) {
    return jsonError("Manuscript live snapshot link was not found.", 404);
  }

  if (!getStudioDatabaseUrl()) {
    return jsonError(
      "Server manuscript snapshots need a configured Studio database.",
      503,
    );
  }

  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return jsonError("Sign in to use manuscript live snapshots.", 401);
  }

  if (!access.canAccess) {
    return jsonError("This account cannot access Studio snapshots.", 403);
  }

  try {
    const snapshot = await getLatestStudioManuscriptSnapshotForLiveSlug({
      slug: slug ?? "",
    });

    return NextResponse.json({ ok: true, slug, snapshot });
  } catch (error) {
    console.error("Studio live manuscript snapshot request failed.", error);

    return jsonError(
      "Live manuscript snapshot is not available in this environment.",
      503,
    );
  }
}
