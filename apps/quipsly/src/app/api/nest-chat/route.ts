import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { resolveMacSessionActor } from "@/lib/server/mac-session-token";
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
};

function cleanMessage(input: unknown) {
  return String(input ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeProjectSlug(input: string | null) {
  return String(input ?? "").trim().toLowerCase();
}

function firstConfiguredOwnerEmail() {
  const raw = [
    process.env.QUIPSLY_OWNER_EMAIL,
    process.env.HGO_OWNER_EMAIL,
    process.env.OWNER_EMAIL,
    process.env.QUIPSLY_ADMIN_EMAILS,
    process.env.HGO_ADMIN_EMAILS,
    process.env.ADMIN_EMAILS,
  ]
    .filter(Boolean)
    .join(",");

  return normalizeAccessEmail(raw.split(",").find((entry) => entry.trim().includes("@")));
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

async function resolveActor(request: NextRequest) {
  const session = await auth();
  const macActor = session?.user?.id ? null : resolveMacSessionActor(request);
  const overrideEmail = process.env.QUIPSLY_OWNER_OVERRIDE === "true"
    ? firstConfiguredOwnerEmail() || "owner-override@quipsly.local"
    : "";
  const email = normalizeAccessEmail(
    session?.user?.primaryEmail
      || session?.user?.email
      || macActor?.primaryEmail
      || macActor?.email
      || overrideEmail,
  );
  const name = session?.user?.name || macActor?.name || email || "Quipsly Friend";
  return { session, macActor, email, name };
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

async function ensureDefaultThread(projectId: string, projectName: string) {
  const prisma = getPrismaClient();
  const thread = await prisma.studioNestChatThread.upsert({
    where: { projectId_key: { projectId, key: DEFAULT_THREAD_KEY } },
    update: {},
    create: {
      projectId,
      key: DEFAULT_THREAD_KEY,
      title: `${projectName} Chat`,
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

async function loadThread(projectSlug: string, actorEmail: string) {
  const prisma = getPrismaClient();
  const access = await resolveStudioProjectAccess({
    projectSlug,
    email: actorEmail,
    action: "read",
    prisma,
  });

  if (!access.allowed || !access.projectId) {
    return { ok: false as const, status: 404, error: "Nest chat is not available for this project." };
  }

  const project = await findStudioProjectForAccess(projectSlug, prisma);
  if (!project) {
    return { ok: false as const, status: 404, error: "Nest not found." };
  }

  const thread = await ensureDefaultThread(project.id, project.name);
  return { ok: true as const, project, thread, access };
}

export async function GET(request: NextRequest) {
  const projectSlug = normalizeProjectSlug(request.nextUrl.searchParams.get("projectSlug"));
  const actor = await resolveActor(request);

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }

  if (!actor.email && process.env.QUIPSLY_OWNER_OVERRIDE !== "true") {
    return NextResponse.json({ ok: false, error: "Sign in to read Nest chat." }, { status: 401 });
  }

  try {
    const loaded = await loadThread(projectSlug, actor.email);
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
    }

    const prisma = getPrismaClient();
    const messages = await prisma.studioNestChatMessage.findMany({
      where: { threadId: loaded.thread.id },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return NextResponse.json({
      ok: true,
      project: {
        id: loaded.project.id,
        slug: loaded.project.slug,
        name: loaded.project.name,
      },
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
      messages: messages.map(serializeMessage),
    });
  } catch (error) {
    if (isPrismaConnectionPressure(error)) return chatUnavailableResponse();
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const projectSlug = normalizeProjectSlug(String(body.projectSlug || request.nextUrl.searchParams.get("projectSlug") || ""));
  const message = cleanMessage(body.body);
  const explicitGifUrl = normalizeGifUrl(body.gifUrl);
  const gifUrl = explicitGifUrl || firstGifUrlFromText(message);
  const actor = await resolveActor(request);

  if (!projectSlug) {
    return NextResponse.json({ ok: false, error: "projectSlug is required." }, { status: 400 });
  }

  if (!message && !gifUrl) {
    return NextResponse.json({ ok: false, error: "Message or GIF URL is required." }, { status: 400 });
  }

  if (!actor.email && process.env.QUIPSLY_OWNER_OVERRIDE !== "true") {
    return NextResponse.json({ ok: false, error: "Sign in to send Nest chat messages." }, { status: 401 });
  }

  try {
    const loaded = await loadThread(projectSlug, actor.email);
    if (!loaded.ok) {
      return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
    }

    const prisma = getPrismaClient();
    const created = await prisma.studioNestChatMessage.create({
      data: {
        projectId: loaded.project.id,
        threadId: loaded.thread.id,
        authorEmail: actor.email || "owner-override@quipsly.local",
        authorName: actor.name,
        body: message || gifUrl || "",
        gifUrl,
        metadataJson: {
          source: "nest-chat-panel",
          pastedGif: Boolean(gifUrl),
        },
      },
    });

    return NextResponse.json({ ok: true, message: serializeMessage(created) });
  } catch (error) {
    if (isPrismaConnectionPressure(error)) return chatUnavailableResponse();
    throw error;
  }
}
