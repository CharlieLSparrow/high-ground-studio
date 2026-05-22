import { NextResponse, type NextRequest } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { getLatestStudioManuscriptSnapshot } from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

export async function GET(request: NextRequest) {
  if (!getStudioDatabaseUrl()) {
    return jsonError(
      "Server manuscript snapshots need a configured Studio database.",
      503,
    );
  }

  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return jsonError("Sign in to use manuscript snapshots.", 401);
  }

  if (!access.canAccess) {
    return jsonError("This account cannot access Studio snapshots.", 403);
  }

  const ownerEmail =
    access.session?.user?.primaryEmail || access.session?.user?.email || "";

  if (!ownerEmail) {
    return jsonError("Studio session is missing an owner email.", 400);
  }

  try {
    const snapshot = await getLatestStudioManuscriptSnapshot({
      ownerEmail,
      manuscriptId: request.nextUrl.searchParams.get("manuscriptId"),
    });

    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    console.error("Studio latest manuscript snapshot request failed.", error);

    return jsonError(
      "Latest manuscript snapshot is not available in this environment.",
      503,
    );
  }
}
