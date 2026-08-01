import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import {
  revokeCalendarFeeds,
  rotateCalendarFeed,
  type SupportedCalendarFeedPurpose,
} from "@/lib/server/calendar-feed";
import { resolveCalendarPublicOrigin } from "@/lib/server/calendar-public-origin";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const PURPOSES = new Set<SupportedCalendarFeedPurpose>([
  "COACHING",
  "PODCAST_PRODUCTION",
  "PERSONAL_COMMITMENTS",
]);

function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Authorization, Cookie",
    },
  });
}

function purpose(value: unknown) {
  return typeof value === "string" &&
    PURPOSES.has(value as SupportedCalendarFeedPurpose)
    ? (value as SupportedCalendarFeedPurpose)
    : null;
}

function timezone(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(
      new Date(),
    );
    return candidate;
  } catch {
    return null;
  }
}

async function authorizedProjectId(input: {
  projectId: unknown;
  email: string;
  prisma: ReturnType<typeof getPrismaClient>;
}) {
  const projectId =
    typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!projectId) return null;
  const visible = await listProjectsVisibleToEmail(input.email, input.prisma);
  return visible.some((project) => project.id === projectId) ? projectId : null;
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson({ ok: false, error: "Authentication required." }, 401);
  const prisma = getPrismaClient();
  const rows = await prisma.calendarFeed.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      revokedAt: true,
      lastGeneratedAt: true,
      collection: {
        select: { purpose: true, displayName: true, nestId: true },
      },
    },
  });
  return privateJson({
    ok: true,
    feeds: rows.map((row) => ({
      id: row.id,
      purpose: row.collection.purpose,
      displayName: row.collection.displayName,
      projectId: row.collection.nestId,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      lastGeneratedAt: row.lastGeneratedAt?.toISOString() ?? null,
      subscriptionUrlRecoverable: false,
    })),
  });
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson({ ok: false, error: "Authentication required." }, 401);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const requestedPurpose = purpose(body?.purpose);
  const requestedTimezone = timezone(body?.timezone);
  if (!requestedPurpose || !requestedTimezone) {
    return privateJson(
      { ok: false, error: "Choose a supported calendar and timezone." },
      400,
    );
  }
  const prisma = getPrismaClient();
  const projectId =
    requestedPurpose === "PODCAST_PRODUCTION"
      ? await authorizedProjectId({
          projectId: body?.projectId,
          email: session.user.primaryEmail,
          prisma,
        })
      : null;
  if (requestedPurpose === "PODCAST_PRODUCTION" && !projectId) {
    return privateJson(
      { ok: false, error: "Choose a podcast project you can access." },
      403,
    );
  }
  try {
    // Resolve and validate the externally returned URL before rotating the
    // capability. A configuration failure must not revoke the last usable
    // link and then strand the replacement token in an error response.
    const publicOrigin = resolveCalendarPublicOrigin(request.url);
    const rotated = await rotateCalendarFeed({
      prisma,
      actorUserId: session.user.id,
      purpose: requestedPurpose,
      timezone: requestedTimezone,
      projectId,
      displayName:
        typeof body?.displayName === "string"
          ? body.displayName.slice(0, 120)
          : null,
    });
    const url = new URL(`/api/calendar/feeds/${rotated.token}`, publicOrigin);
    const webcalUrl = url.toString().replace(/^https?:/, "webcal:");
    return privateJson(
      {
        ok: true,
        feed: {
          id: rotated.feed.id,
          purpose: rotated.collection.purpose,
          displayName: rotated.collection.displayName,
          subscriptionUrl: url.toString(),
          webcalUrl,
          shownOnce: true,
          priorFeedRevoked: true,
        },
      },
      201,
    );
  } catch (error) {
    console.error("[calendar-feed] Failed to rotate subscription", error);
    return privateJson(
      { ok: false, error: "The calendar subscription could not be created." },
      503,
    );
  }
}

export async function DELETE(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user?.id)
    return privateJson({ ok: false, error: "Authentication required." }, 401);
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const requestedPurpose = purpose(body?.purpose);
  if (!requestedPurpose)
    return privateJson(
      { ok: false, error: "Choose a calendar to revoke." },
      400,
    );
  const prisma = getPrismaClient();
  const projectId =
    requestedPurpose === "PODCAST_PRODUCTION"
      ? await authorizedProjectId({
          projectId: body?.projectId,
          email: session.user.primaryEmail,
          prisma,
        })
      : null;
  if (requestedPurpose === "PODCAST_PRODUCTION" && !projectId) {
    return privateJson(
      { ok: false, error: "Choose a podcast project you can access." },
      403,
    );
  }
  const result = await revokeCalendarFeeds({
    prisma,
    actorUserId: session.user.id,
    purpose: requestedPurpose,
    projectId,
  });
  return privateJson({ ok: true, revoked: result.revoked });
}
