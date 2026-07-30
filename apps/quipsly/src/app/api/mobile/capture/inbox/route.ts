import { NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { filePersonalSourceIntoResearch } from "@/lib/server/personal-source-filing";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function revision(value: unknown) {
  const date = new Date(text(value, 80));
  return Number.isFinite(date.getTime()) ? date : null;
}

async function body(request: Request) {
  try {
    return record(await request.json());
  } catch {
    return {};
  }
}

function boundaries() {
  return {
    actorOwnedPrivateInbox: true,
    writableResearchDestinationsOnly: true,
    stableFilingIdentityRequired: true,
    immutableResearchSourceCreated: true,
    privateCaptureMutated: false,
    sourcePageImportedForBookmarks: false,
    externalSideEffects: false,
  };
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before reviewing private Inbox sources." },
      { status: 401 },
    );
  }

  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  if (!actorEmail) {
    return NextResponse.json(
      { ok: false, error: "Verify an account email before reviewing private Inbox sources." },
      { status: 403 },
    );
  }

  const prisma = getPrismaClient() as any;
  const userId = session.user.id;
  try {
    const [projects, snippets, bookmarks] = await Promise.all([
      listProjectsVisibleToEmail(actorEmail, prisma),
      prisma.snippet.findMany({
        where: {
          userId,
          collectionId: null,
          researchFilings: { none: {} },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
        select: {
          id: true,
          sourceTitle: true,
          highlightedText: true,
          sourceUrl: true,
          updatedAt: true,
          _count: { select: { captureReceipts: true } },
          captureReceipts: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { capturedAt: true },
          },
        },
      }),
      prisma.bookmark.findMany({
        where: {
          userId,
          collectionId: null,
          researchFilings: { none: {} },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: 50,
        select: {
          id: true,
          title: true,
          url: true,
          updatedAt: true,
          _count: { select: { captureReceipts: true } },
          captureReceipts: {
            orderBy: { capturedAt: "desc" },
            take: 1,
            select: { capturedAt: true },
          },
        },
      }),
    ]);

    const sources = [
      ...snippets.map((snippet: any) => ({
        id: snippet.id,
        captureType: "SNIPPET",
        title: text(snippet.sourceTitle, 500) || "Saved passage",
        excerpt: text(snippet.highlightedText, 2_000),
        sourceUrl: text(snippet.sourceUrl, 2_000) || null,
        captureCount: Math.max(1, Number(snippet._count.captureReceipts || 0)),
        capturedAt: (snippet.captureReceipts[0]?.capturedAt || snippet.updatedAt).toISOString(),
        updatedAt: snippet.updatedAt.toISOString(),
      })),
      ...bookmarks.map((bookmark: any) => ({
        id: bookmark.id,
        captureType: "BOOKMARK",
        title: text(bookmark.title, 500) || "Saved link",
        excerpt: text(bookmark.url, 2_000),
        sourceUrl: text(bookmark.url, 2_000) || null,
        captureCount: Math.max(1, Number(bookmark._count.captureReceipts || 0)),
        capturedAt: (bookmark.captureReceipts[0]?.capturedAt || bookmark.updatedAt).toISOString(),
        updatedAt: bookmark.updatedAt.toISOString(),
      })),
    ].sort((left, right) => (
      right.capturedAt.localeCompare(left.capturedAt)
      || left.captureType.localeCompare(right.captureType)
      || left.id.localeCompare(right.id)
    )).slice(0, 50);

    return NextResponse.json({
      ok: true,
      inboxKind: "quipsly-mobile-source-inbox-v1",
      generatedAt: new Date().toISOString(),
      sources,
      destinations: projects
        .filter((project: any) => project.role === "OWNER" || project.role === "EDITOR")
        .map((project: any) => ({
          id: project.id,
          slug: project.slug,
          name: project.name,
          role: project.role,
        })),
      boundaries: boundaries(),
    });
  } catch (error) {
    console.error("[mobile-source-inbox] failed to load actor sources", error);
    return NextResponse.json(
      { ok: false, error: "Quipsly could not verify the private source Inbox." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, error: "Sign in before filing a private source." },
      { status: 401 },
    );
  }

  const actorEmail = text(session.user.primaryEmail || session.user.email, 320).toLowerCase();
  if (!actorEmail) {
    return NextResponse.json(
      { ok: false, error: "Verify an account email before filing a private source." },
      { status: 403 },
    );
  }

  const input = await body(request);
  const action = text(input.action, 40);
  const captureId = text(input.captureId);
  const captureType = text(input.captureType, 20).toUpperCase();
  const projectId = text(input.projectId);
  const clientRequestId = text(input.clientRequestId, 80).toLowerCase();
  const expectedCaptureUpdatedAt = revision(input.expectedCaptureUpdatedAt);
  if (action !== "file-source"
      || !captureId
      || !["SNIPPET", "BOOKMARK"].includes(captureType)
      || !projectId
      || !UUID_PATTERN.test(clientRequestId)
      || !expectedCaptureUpdatedAt) {
    return NextResponse.json(
      { ok: false, error: "Choose one current private source and one writable Research Nest." },
      { status: 400 },
    );
  }

  try {
    const result = await filePersonalSourceIntoResearch({
      prisma: getPrismaClient(),
      actorUserId: session.user.id,
      actorEmail,
      projectId,
      captureId,
      captureType,
      clientRequestId,
      expectedCaptureUpdatedAt,
    });
    if (!result.ok) {
      const status = result.code === "INVALID"
        ? 400
        : result.code === "FORBIDDEN"
          ? 403
          : result.code === "NOT_FOUND"
            ? 404
            : 409;
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      captureId: result.captureId,
      captureType: result.captureType,
      projectId: result.projectId,
      projectSlug: result.projectSlug,
      projectName: result.projectName,
      filingId: result.filingId,
      sourceUnitId: result.sourceUnitId,
      reused: result.reused,
      href: result.href,
      boundaries: boundaries(),
    });
  } catch (error) {
    console.error("[mobile-source-inbox] failed to file actor source", error);
    return NextResponse.json(
      { ok: false, error: "Nest could not safely file this private source. Retry keeps the same filing identity." },
      { status: 503 },
    );
  }
}
