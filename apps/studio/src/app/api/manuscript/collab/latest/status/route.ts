import { NextResponse } from "next/server";

import { getStudioAccessState } from "@/lib/server/studio-access";
import { getStudioManuscriptLiveRoom } from "@/lib/server/studio-manuscript-collab";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { getLatestStudioManuscriptSnapshotForLiveSlug } from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getStatusAccess() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to check live manuscript editing.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot check live manuscript editing.", 403),
    };
  }

  return { ok: true as const };
}

function summarizeSnapshot(
  snapshot: Awaited<
    ReturnType<typeof getLatestStudioManuscriptSnapshotForLiveSlug>
  >,
) {
  return snapshot
    ? {
        id: snapshot.id,
        title: snapshot.title,
        updatedAt: snapshot.updatedAt,
        wordCount: snapshot.wordCount,
        blockCount: snapshot.blockCount,
      }
    : null;
}

export async function GET() {
  if (!getStudioDatabaseUrl()) {
    return jsonError("Live manuscript editing needs the Studio database.", 503);
  }

  const access = await getStatusAccess();

  if (!access.ok) {
    return access.response;
  }

  try {
    const [room, latestSnapshot] = await Promise.all([
      getStudioManuscriptLiveRoom(),
      getLatestStudioManuscriptSnapshotForLiveSlug({ slug: "latest" }),
    ]);
    const latestSnapshotSummary = summarizeSnapshot(latestSnapshot);
    const roomBaselineSnapshotId =
      room?.lastCheckpointSnapshotId ?? room?.seedSnapshotId ?? null;
    const freshnessState = !latestSnapshotSummary
      ? "no-backup"
      : !room
        ? "no-room"
        : roomBaselineSnapshotId === latestSnapshotSummary.id
          ? "current"
          : "outside-changes";

    return NextResponse.json({
      ok: true,
      room,
      latestSnapshot: latestSnapshotSummary,
      freshness: {
        state: freshnessState,
        latestSnapshotId: latestSnapshotSummary?.id ?? null,
        roomBaselineSnapshotId,
        seedSnapshotId: room?.seedSnapshotId ?? null,
        lastCheckpointSnapshotId: room?.lastCheckpointSnapshotId ?? null,
      },
    });
  } catch (error) {
    console.error("Studio manuscript collab status failed.", error);

    return jsonError("Could not check live manuscript editing right now.", 503);
  }
}
