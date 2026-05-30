import { NextResponse } from "next/server";

import { signStudioCollabToken, getStudioCollabActorForEmail } from "@/lib/studio-collab-token";
import { getStudioAccessState } from "@/lib/server/studio-access";
import {
  getOrCreateStudioManuscriptLiveRoom,
  claimStudioManuscriptLiveRoomSeed,
} from "@/lib/server/studio-manuscript-collab";
import { getStudioDatabaseUrl } from "@/lib/server/studio-persistence-guard";
import { getLatestStudioManuscriptSnapshotForLiveSlug } from "@/lib/server/studio-manuscript-snapshots";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, message }, { status });
}

async function getCollabAccess() {
  const access = await getStudioAccessState();

  if (!access.isSignedIn) {
    return {
      ok: false as const,
      response: jsonError("Sign in to use live manuscript editing.", 401),
    };
  }

  if (!access.canAccess) {
    return {
      ok: false as const,
      response: jsonError("This account cannot access live manuscript editing.", 403),
    };
  }

  const email =
    access.session?.user?.primaryEmail || access.session?.user?.email || "";

  if (!email) {
    return {
      ok: false as const,
      response: jsonError("Studio session is missing an email.", 400),
    };
  }

  return {
    ok: true as const,
    email: email.trim().toLowerCase(),
  };
}

function getCollabSecret() {
  return process.env.STUDIO_COLLAB_TOKEN_SECRET || process.env.AUTH_SECRET || "";
}

function getCollabUrl() {
  const configured = (
    process.env.NEXT_PUBLIC_STUDIO_COLLAB_URL ||
    process.env.STUDIO_COLLAB_URL ||
    ""
  ).trim();

  if (configured) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "" : "ws://localhost:8789";
}

export async function GET() {
  if (!getStudioDatabaseUrl()) {
    return jsonError("Live manuscript editing needs the Studio database.", 503);
  }

  const secret = getCollabSecret();

  if (!secret) {
    return jsonError("Live manuscript editing needs a token secret.", 503);
  }

  const url = getCollabUrl();

  if (!url) {
    return jsonError("Live manuscript editing needs a collab service URL.", 503);
  }

  const access = await getCollabAccess();

  if (!access.ok) {
    return access.response;
  }

  try {
    const snapshot = await getLatestStudioManuscriptSnapshotForLiveSlug({
      slug: "latest",
    });
    const room = await getOrCreateStudioManuscriptLiveRoom({
      title: snapshot?.title ?? "Untitled manuscript",
      seedSnapshotId: snapshot?.id ?? null,
    });
    const actor = getStudioCollabActorForEmail(access.email);
    const now = Math.floor(Date.now() / 1000);
    const token = signStudioCollabToken(
      {
        roomName: room.roomName,
        email: access.email,
        actorId: actor.actorId,
        displayName: actor.displayName,
        role: "editor",
        iat: now,
        exp: now + 60 * 60 * 8,
      },
      secret,
    );

    return NextResponse.json({
      ok: true,
      room,
      token,
      url,
      actor,
      initialSnapshot: snapshot,
    });
  } catch (error) {
    console.error("Studio manuscript collab setup failed.", error);

    return jsonError("Live manuscript editing is not available right now.", 503);
  }
}

export async function POST() {
  if (!getStudioDatabaseUrl()) {
    return jsonError("Live manuscript editing needs the Studio database.", 503);
  }

  const access = await getCollabAccess();

  if (!access.ok) {
    return access.response;
  }

  try {
    const claimed = await claimStudioManuscriptLiveRoomSeed({
      email: access.email,
    });

    return NextResponse.json({ ok: true, ...claimed });
  } catch (error) {
    console.error("Studio manuscript collab seed claim failed.", error);

    return jsonError("Could not initialize the live edit room.", 503);
  }
}
