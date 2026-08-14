import { NextRequest, NextResponse } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  sessionConversationAccessWhere,
  sessionMutationAccessWhere,
} from "@/lib/server/session-access";
import { coachingEngagementAccessWhere } from "@/lib/server/coaching-engagement";

import {
  findStudioProjectForAccess,
  normalizeAccessEmail,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

const DEFAULT_THREAD_KEY = "default";
const BELIEVE_GIF_PAGE_URL = "https://giphy.com/gifs/AppleTV-apple-tv-app-DEZA7FlHbMesUF1jm9";
const BELIEVE_GIF_URL = "https://media.giphy.com/media/DEZA7FlHbMesUF1jm9/giphy.gif";
const LEGACY_BELIEVE_GIF_ID = "5B925WaCAIWojy3KMG";
const MAX_MESSAGE_LENGTH = 4_000;
const MAX_THREAD_KEY_LENGTH = 120;
const CLIENT_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_SURFACES = new Set([
  "capture-ios",
  "episode-room-web",
  "session-room-web",
  "engagement-room-web",
  "nest-chat-web",
]);

type ChatMessageRow = {
  id: string;
  projectId: string;
  threadId: string;
  authorEmail: string | null;
  authorName: string | null;
  body: string;
  gifUrl: string | null;
  metadataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  linkedGoalId: string | null;
};

function cleanMessage(input: unknown) {
  return String(input ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeProjectSlug(input: string | null) {
  return String(input ?? "").trim().toLowerCase();
}

function normalizeThreadKey(input: unknown) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return DEFAULT_THREAD_KEY;
  const safe = raw
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_THREAD_KEY_LENGTH);
  return safe || DEFAULT_THREAD_KEY;
}

function normalizeEpisodeSlug(input: unknown) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) return "";
  return raw
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_THREAD_KEY_LENGTH - "episode:".length);
}

function normalizeSessionRoomId(input: unknown) {
  const raw = String(input ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,119}$/.test(raw) ? raw : "";
}

function normalizeEngagementId(input: unknown) {
  const raw = String(input ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,119}$/.test(raw) ? raw : "";
}

function normalizeStoryCardId(input: unknown) {
  const raw = String(input ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{0,127}$/.test(raw) ? raw : "";
}

function resolveThreadScope(threadKeyInput: unknown, episodeSlugInput: unknown) {
  const explicitEpisodeSlug = normalizeEpisodeSlug(episodeSlugInput);
  const key = explicitEpisodeSlug
    ? `episode:${explicitEpisodeSlug}`
    : normalizeThreadKey(threadKeyInput);
  const episodeSlug = key.startsWith("episode:")
    ? normalizeEpisodeSlug(key.slice("episode:".length))
    : "";
  const sessionRoomId = key.startsWith("session:")
    ? normalizeSessionRoomId(key.slice("session:".length))
    : "";
  const engagementId = key.startsWith("engagement:")
    ? normalizeEngagementId(key.slice("engagement:".length))
    : "";
  const storyCardId = key.startsWith("story-card:")
    ? normalizeStoryCardId(key.slice("story-card:".length))
    : "";
  const invalidScope = (key.startsWith("session:") && !sessionRoomId)
    || (key.startsWith("engagement:") && !engagementId)
    || (key.startsWith("episode:") && !episodeSlug)
    || (key.startsWith("story-card:") && !storyCardId);
  return {
    key: episodeSlug
      ? `episode:${episodeSlug}`
      : sessionRoomId
        ? `session:${sessionRoomId}`
        : engagementId
          ? `engagement:${engagementId}`
          : storyCardId
            ? `story-card:${storyCardId}`
            : key,
    episodeSlug: episodeSlug || null,
    sessionRoomId: sessionRoomId || null,
    engagementId: engagementId || null,
    storyCardId: storyCardId || null,
    invalidScope,
  };
}

function normalizeClientMessageId(input: unknown) {
  const value = String(input ?? "").trim().toLowerCase();
  return CLIENT_MESSAGE_ID.test(value) ? value : null;
}

function persistedMessageId(clientMessageId: string) {
  return `chat_${clientMessageId.replaceAll("-", "")}`;
}

function normalizeClientSurface(input: unknown, episodeSlug: string | null) {
  const value = String(input ?? "").trim().toLowerCase();
  if (CLIENT_SURFACES.has(value)) return value;
  return episodeSlug ? "episode-room-web" : "nest-chat-web";
}

function threadTitle(projectName: string, key: string) {
  if (key === DEFAULT_THREAD_KEY) return `${projectName} Chat`;
  if (key.startsWith("episode:")) {
    const episode = key
      .slice("episode:".length)
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return `${episode || "Episode"} Chat`;
  }
  return `${projectName} · ${key.replace(/[-_:]+/g, " ")}`;
}

function normalizeGifUrl(input: unknown) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (/\.gif($|[?#])/i.test(url.href)) return url.href;
    if (/\.(webp|png|jpe?g)($|[?#])/i.test(url.href) && /giphy|tenor|gifdb|media/i.test(url.hostname)) return url.href;

    const giphyMatch = url.href.match(/giphy\.com\/gifs\/(?:[^/]*-)?([A-Za-z0-9_-]+)(?:$|[/?#])/i);
    if (giphyMatch?.[1]) {
      return `https://media.giphy.com/media/${giphyMatch[1]}/giphy.gif`;
    }
  } catch {
    return null;
  }

  return null;
}

function firstGifUrlFromText(text: string) {
  const urls = text.match(/https?:\/\/[^\s<>()"']+/gi) ?? [];
  for (const candidate of urls) {
    const normalized = normalizeGifUrl(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function serializeMessage(message: ChatMessageRow) {
  return {
    id: message.id,
    authorEmail: message.authorEmail,
    authorName: message.authorName,
    body: message.body,
    gifUrl: message.gifUrl,
    metadataJson: message.metadataJson,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    linkedGoalId: message.linkedGoalId,
  };
}

function isPrismaConnectionPressure(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "P2037" || message.includes("TooManyConnections") || message.includes("Too many database connections");
}

function chatUnavailableResponse() {
  return NextResponse.json({
    ok: false,
    unavailable: true,
    error: "Nest Chat is temporarily resting because the database is busy. The page is safe to keep using.",
  });
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

async function resolveActor(request: NextRequest) {
  const session = await getQuipslySessionFromRequest(request);
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
      || session?.user?.email,
  );
  return {
    id: cleanString(session?.user?.id),
    email,
    name: cleanString(session?.user?.name, email),
    isStaff: session?.user?.isStaff === true,
  };
}

async function normalizeBelieveSeedMessages(projectId?: string) {
  const prisma = getPrismaClient();
  await prisma.studioNestChatMessage.updateMany({
    where: {
      authorEmail: "quipsly@nest.system",
      ...(projectId ? { projectId } : {}),
    },
    data: {
      body: `Believe. Every Nest thread starts here. ${BELIEVE_GIF_PAGE_URL}`,
      gifUrl: BELIEVE_GIF_URL,
      metadataJson: {
        seed: "ted-lasso-believe",
        source: "giphy",
        sourceUrl: BELIEVE_GIF_PAGE_URL,
        note: "Seeded as the first message for every Nest chat thread.",
      },
    },
  });

  await prisma.studioNestChatMessage.updateMany({
    where: {
      body: { startsWith: "Codex smoke test: Believe." },
      OR: [
        { body: { contains: LEGACY_BELIEVE_GIF_ID } },
        { gifUrl: { contains: LEGACY_BELIEVE_GIF_ID } },
      ],
      ...(projectId ? { projectId } : {}),
    },
    data: {
      body: `Codex smoke test: Believe. ${BELIEVE_GIF_URL}`,
      gifUrl: BELIEVE_GIF_URL,
      metadataJson: {
        seed: "codex-believe-smoke-test",
        source: "giphy",
        sourceUrl: BELIEVE_GIF_PAGE_URL,
        note: "Legacy smoke-test GIF corrected to the AppleTV Believe GIF.",
      },
    },
  });
}

async function ensureThread(projectId: string, projectName: string, key: string, titleOverride?: string) {
  const prisma = getPrismaClient();
  const thread = await prisma.studioNestChatThread.upsert({
    where: { projectId_key: { projectId, key } },
    update: titleOverride ? { title: titleOverride } : {},
    create: {
      projectId,
      key,
      title: titleOverride || threadTitle(projectName, key),
    },
    select: {
      id: true,
      key: true,
      title: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  await normalizeBelieveSeedMessages(projectId);

  const existingMessage = await prisma.studioNestChatMessage.findFirst({
    where: { threadId: thread.id },
    select: { id: true },
  });

  if (!existingMessage) {
    await prisma.studioNestChatMessage.create({
      data: {
        projectId,
        threadId: thread.id,
        authorEmail: "quipsly@nest.system",
        authorName: "Quipsly",
        body: `Believe. Every Nest thread starts here. ${BELIEVE_GIF_PAGE_URL}`,
        gifUrl: BELIEVE_GIF_URL,
        metadataJson: {
          seed: "ted-lasso-believe",
          source: "giphy",
          sourceUrl: BELIEVE_GIF_PAGE_URL,
          note: "Seeded as the first message for every Nest chat thread.",
        },
      },
    });
  }

  return thread;
}

async function loadThread(
  projectSlug: string,
  actor: Awaited<ReturnType<typeof resolveActor>>,
  scope: ReturnType<typeof resolveThreadScope>,
  action: "read" | "write",
) {
  const prisma = getPrismaClient();

  // Engagement membership is intentionally narrower than Nest membership.
  // A client can collaborate across their coaching series without learning
  // about private project notes, research, other clients, or production work.
  if (scope.engagementId) {
    const engagement = await prisma.coachingEngagement.findFirst({
      where: {
        ...coachingEngagementAccessWhere(scope.engagementId, actor, action),
        project: { is: { slug: projectSlug } },
      },
      select: {
        id: true,
        title: true,
        status: true,
        primaryClientUserId: true,
        primaryCoachUserId: true,
        members: {
          where: { userId: actor.id, status: "ACTIVE" },
          take: 1,
          select: { role: true },
        },
        project: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!engagement?.project) {
      return { ok: false as const, status: 404, error: "Coaching engagement thread is not available." };
    }
    const thread = await ensureThread(
      engagement.project.id,
      engagement.project.name,
      scope.key,
      `${engagement.title} · shared thread`,
    );
    return {
      ok: true as const,
      project: engagement.project,
      episode: null,
      sessionRoom: null,
      engagement,
      sourceCard: null,
      thread,
      access: {
        role: engagement.members[0]?.role
          || (engagement.primaryCoachUserId === actor.id ? "COACH" : engagement.primaryClientUserId === actor.id ? "CLIENT" : "COLLABORATOR"),
      },
    };
  }

  // A Session participant owns access to the meeting thread without receiving
  // access to the surrounding Nest. Resolve this scope at the CallRoom boundary
  // first; falling through to project access would make a Session-only invite
  // either useless or accidentally broader than intended.
  if (scope.sessionRoomId) {
    const sessionRoom = await prisma.callRoom.findFirst({
      where: {
        ...(action === "write"
          ? sessionMutationAccessWhere(scope.sessionRoomId, actor)
          : sessionConversationAccessWhere(scope.sessionRoomId, actor)),
        project: { is: { slug: projectSlug } },
      },
      select: {
        id: true,
        title: true,
        purpose: true,
        status: true,
        createdByUserId: true,
        participants: {
          where: { userId: actor.id, accessStatus: "ACTIVE" },
          take: 1,
          select: { role: true },
        },
        project: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!sessionRoom?.project) {
      return { ok: false as const, status: 404, error: "Session thread is not available." };
    }
    const thread = await ensureThread(sessionRoom.project.id, sessionRoom.project.name, scope.key);
    return {
      ok: true as const,
      project: sessionRoom.project,
      episode: null,
      sessionRoom,
      engagement: null,
      sourceCard: null,
      thread,
      access: {
        role: sessionRoom.participants[0]?.role
          || (sessionRoom.createdByUserId === actor.id ? "HOST" : "SESSION_PARTICIPANT"),
      },
    };
  }

  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actor.email,
    action,
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return { ok: false as const, status: 404, error: "Nest chat is not available for this project." };
  }

  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) {
    return { ok: false as const, status: 404, error: "Nest not found." };
  }

  const episode = scope.episodeSlug
    ? await prisma.studioEpisodeProduction.findUnique({
        where: {
          projectId_slug: {
            projectId: project.id,
            slug: scope.episodeSlug,
          },
        },
        select: {
          id: true,
          slug: true,
          title: true,
          status: true,
        },
      })
    : null;
  const sourceCard = scope.storyCardId
    ? await prisma.studioStoryCard.findFirst({
        where: { id: scope.storyCardId, projectId: project.id, archivedAt: null },
        select: { id: true, stableId: true, title: true, revision: true, sourceRangeId: true },
      })
    : null;
  if (scope.episodeSlug && !episode) {
    return { ok: false as const, status: 404, error: "Episode chat is not available." };
  }
  if (scope.storyCardId && !sourceCard) {
    return { ok: false as const, status: 404, error: "Source-card thread is not available." };
  }

  const thread = await ensureThread(project.id, project.name, scope.key, sourceCard ? `${sourceCard.title} · source card` : undefined);
  return { ok: true as const, project, episode, sessionRoom: null, engagement: null, sourceCard, thread, access };
}

export async function GET(request: NextRequest) {
  const projectSlug = normalizeProjectSlug(request.nextUrl.searchParams.get("projectSlug"));
  const scope = resolveThreadScope(
    request.nextUrl.searchParams.get("threadKey"),
    request.nextUrl.searchParams.get("episodeSlug"),
  );
  const actor = await resolveActor(request);

  if (scope.invalidScope) {
    return NextResponse.json({ ok: false, error: "The requested chat scope is invalid." }, { status: 400 });
  }

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }

  if (!actor.email) {
    return NextResponse.json({ ok: false, error: "Sign in to read Nest chat." }, { status: 401 });
  }

  try {
    const loaded = await loadThread(projectSlug, actor, scope, "read");
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
    }

    const cursor = request.nextUrl.searchParams.get("cursor");
    const filterMode = request.nextUrl.searchParams.get("filterMode") || "all";
    const limit = 50;

    const where: any = { threadId: loaded.thread.id };
    if (filterMode === "tasks") {
      where.linkedGoalId = { not: null };
    } else if (filterMode === "decisions") {
      where.body = { contains: "#decision", mode: "insensitive" };
    } else if (filterMode !== "all") {
      // Custom tag filter
      where.body = { contains: `#${filterMode}`, mode: "insensitive" };
    }

    const prisma = getPrismaClient();
    const rawMessages = await prisma.studioNestChatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rawMessages.length > limit;
    const messagesToReturn = rawMessages.slice(0, limit).reverse();

    return NextResponse.json({
      ok: true,
      hasMore,
      nextCursor: hasMore ? rawMessages[limit].id : null,
      project: {
        id: loaded.project.id,
        slug: loaded.project.slug,
        name: loaded.project.name,
      },
      episode: loaded.episode,
      session: loaded.sessionRoom,
      engagement: loaded.engagement,
      sourceCard: loaded.sourceCard,
      thread: {
        id: loaded.thread.id,
        key: loaded.thread.key,
        title: loaded.thread.title,
      },
      actor: {
        email: actor.email,
        name: actor.name,
        role: loaded.access.role,
      },
      messages: messagesToReturn.map(serializeMessage),
    });
  } catch (error) {
    if (isPrismaConnectionPressure(error)) return chatUnavailableResponse();
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectSlug = normalizeProjectSlug(String(body.projectSlug || request.nextUrl.searchParams.get("projectSlug") || ""));
  const scope = resolveThreadScope(
    body.threadKey || request.nextUrl.searchParams.get("threadKey"),
    body.episodeSlug || request.nextUrl.searchParams.get("episodeSlug"),
  );
  const message = cleanMessage(body.body);
  const explicitGifUrl = normalizeGifUrl(body.gifUrl);
  const gifUrl = explicitGifUrl || firstGifUrlFromText(message);
  const clientMessageId = normalizeClientMessageId(body.clientMessageId);
  const messageId = clientMessageId ? persistedMessageId(clientMessageId) : null;
  const clientSurface = normalizeClientSurface(body.clientSurface, scope.episodeSlug);
  const actor = await resolveActor(request);

  if (scope.invalidScope) {
    return NextResponse.json({ ok: false, error: "The requested chat scope is invalid." }, { status: 400 });
  }

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }

  if (!message && !gifUrl) {
    return NextResponse.json({ ok: false, error: "Message or GIF URL is required." }, { status: 400 });
  }

  if (!actor.email) {
    return NextResponse.json({ ok: false, error: "Sign in to send Nest chat messages." }, { status: 401 });
  }

  try {
    const loaded = await loadThread(projectSlug, actor, scope, "write");
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
    }

    const prisma = getPrismaClient();
    const data = {
      ...(messageId ? { id: messageId } : {}),
      projectId: loaded.project.id,
      threadId: loaded.thread.id,
      authorEmail: actor.email,
      authorName: actor.name,
      body: message || gifUrl || "",
      gifUrl,
      metadataJson: {
        source: clientSurface,
        pastedGif: Boolean(gifUrl),
        threadKey: scope.key,
        ...(scope.episodeSlug ? {
          episodeId: loaded.episode?.id,
          episodeSlug: scope.episodeSlug,
        } : {}),
        ...(scope.sessionRoomId ? {
          callRoomId: loaded.sessionRoom?.id,
          sessionTitle: loaded.sessionRoom?.title,
        } : {}),
        ...(scope.engagementId ? {
          coachingEngagementId: loaded.engagement?.id,
          coachingEngagementTitle: loaded.engagement?.title,
        } : {}),
        ...(scope.storyCardId ? {
          sourceCardId: loaded.sourceCard?.id,
          sourceCardStableId: loaded.sourceCard?.stableId,
          sourceRangeId: loaded.sourceCard?.sourceRangeId,
          sourceCardRevision: loaded.sourceCard?.revision,
        } : {}),
        ...(clientMessageId ? { clientMessageId } : {}),
      },
    };

    if (messageId) {
      const existing = await prisma.studioNestChatMessage.findUnique({
        where: { id: messageId },
      });
      if (existing) {
        const exactRetry = existing.projectId === data.projectId
          && existing.threadId === data.threadId
          && normalizeAccessEmail(existing.authorEmail) === actor.email
          && existing.body === data.body
          && existing.gifUrl === data.gifUrl;
        if (!exactRetry) {
          return NextResponse.json(
            { ok: false, error: "This message retry identity is already in use." },
            { status: 409 },
          );
        }
        return NextResponse.json({
          ok: true,
          idempotentReplay: true,
          message: serializeMessage(existing),
        });
      }
    }

    try {
      const created = await prisma.studioNestChatMessage.create({ data });
      return NextResponse.json({ ok: true, message: serializeMessage(created) });
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (messageId && code === "P2002") {
        const raced = await prisma.studioNestChatMessage.findUnique({
          where: { id: messageId },
        });
        const exactRetry = raced
          && raced.projectId === data.projectId
          && raced.threadId === data.threadId
          && normalizeAccessEmail(raced.authorEmail) === actor.email
          && raced.body === data.body
          && raced.gifUrl === data.gifUrl;
        if (raced && exactRetry) {
          return NextResponse.json({
            ok: true,
            idempotentReplay: true,
            message: serializeMessage(raced),
          });
        }
        return NextResponse.json(
          { ok: false, error: "This message retry identity is already in use." },
          { status: 409 },
        );
      }
      throw error;
    }
  } catch (error) {
    if (isPrismaConnectionPressure(error)) return chatUnavailableResponse();
    throw error;
  }
}
