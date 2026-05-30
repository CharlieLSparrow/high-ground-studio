import { NextResponse } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import { markStudioManuscriptLiveRoomResetBaseline } from "@/lib/server/studio-manuscript-collab";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { getLatestStudioManuscriptSnapshotForLiveSlug } from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getResetOwnerEmail() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to reset the live edit room.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot reset the live edit room.", 403),
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

export async function POST() {
  if (!getStudioDatabaseUrl()) {
    return jsonError("Live edit resets need the Studio database.", 503);
  }

  const owner = await getResetOwnerEmail();

  if (!owner.ok) {
    return owner.response;
  }

  try {
    const snapshot = await getLatestStudioManuscriptSnapshotForLiveSlug({
      slug: "latest",
    });

    if (!snapshot) {
      return jsonError("No latest manuscript backup is available to load.", 404);
    }

    const room = await markStudioManuscriptLiveRoomResetBaseline({
      snapshotId: snapshot.id,
      title: snapshot.title,
      email: owner.ownerEmail,
    });

    return NextResponse.json({ ok: true, snapshot, room });
  } catch (error) {
    console.error("Studio live edit room reset failed.", error);

    return jsonError("The live edit room could not load the latest backup.", 503);
  }
}
