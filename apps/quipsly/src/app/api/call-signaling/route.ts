import { NextResponse } from "next/server";
import { getPrismaClient } from "@/lib/prisma";
import { DEFAULT_PROJECT_SLUG, ensureStudioProjectDocument, projectConfig } from "../../(app)/create/projectConfig";

const MAX_SIGNAL_MESSAGES = 240;
const STALE_PARTICIPANT_MS = 45_000;
const STALE_SIGNAL_MS = 10 * 60_000;

type CallRoom = {
  roomId: string;
  projectSlug: string;
  episodeSlug: string;
  createdAt: string;
  updatedAt: string;
  participants: Record<string, unknown>;
  messages: unknown[];
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRoomId(value: unknown) {
  return safeString(value, "main")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 80) || "main";
}

async function parseRequestBody(request: Request) {
  const text = await request.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function ensureProjectAndDocument(prisma: ReturnType<typeof getPrismaClient>, projectSlug: string) {
  return ensureStudioProjectDocument(prisma, projectConfig(projectSlug).slug);
}

async function ensureProduction(prisma: ReturnType<typeof getPrismaClient>, body: Record<string, unknown>) {
  const projectSlug = safeString(body.projectSlug, DEFAULT_PROJECT_SLUG);
  const episodeSlug = safeString(body.episodeSlug, "current-episode");
  const title = safeString(body.title, humanizeSlug(episodeSlug));
  const { project, document } = await ensureProjectAndDocument(prisma, projectSlug);
  const where = { projectId_slug: { projectId: project.id, slug: episodeSlug } };

  const production = await prisma.studioEpisodeProduction.upsert({
    where,
    update: {},
    create: {
      projectId: project.id,
      documentId: document.id,
      slug: episodeSlug,
      title,
      boundaryLabel: title,
      boundaryKind: "episode",
      productionJson: {
        source: "quipsly-call-signaling.create",
        projectSlug,
        episodeSlug,
      },
    },
  });

  return { production, projectSlug, episodeSlug };
}

function cleanupRoom(room: Record<string, unknown>): Partial<CallRoom> {
  const cutoffParticipant = Date.now() - STALE_PARTICIPANT_MS;
  const cutoffSignal = Date.now() - STALE_SIGNAL_MS;
  const participants = asRecord(room.participants);
  const nextParticipants = Object.fromEntries(
    Object.entries(participants).filter(([, participant]) => {
      const lastSeenAt = Date.parse(safeString(asRecord(participant).lastSeenAt));
      return Number.isFinite(lastSeenAt) && lastSeenAt >= cutoffParticipant;
    }),
  );

  const messages = Array.isArray(room.messages) ? room.messages : [];
  const nextMessages = messages
    .filter((message) => {
      const createdAt = Date.parse(safeString(asRecord(message).createdAt));
      return Number.isFinite(createdAt) && createdAt >= cutoffSignal;
    })
    .slice(-MAX_SIGNAL_MESSAGES);

  return {
    ...room,
    participants: nextParticipants,
    messages: nextMessages,
  };
}

function upsertParticipant(room: CallRoom, body: Record<string, unknown>): CallRoom {
  const peerId = safeString(body.peerId, makeId("peer"));
  const name = safeString(body.name, "Quipsly Guest");
  const role = safeString(body.role, "guest");
  const participants = asRecord(room.participants);

  return {
    ...room,
    participants: {
      ...participants,
      [peerId]: {
        ...(asRecord(participants[peerId])),
        peerId,
        name,
        role,
        joinedAt: safeString(asRecord(participants[peerId]).joinedAt, nowIso()),
        lastSeenAt: nowIso(),
      },
    },
  };
}

function appendSignal(room: CallRoom, body: Record<string, unknown>): CallRoom {
  const message = {
    id: makeId("signal"),
    from: safeString(body.peerId),
    to: safeString(body.toPeerId),
    type: safeString(body.signalType),
    payload: body.payload ?? null,
    createdAt: nowIso(),
  };
  const messages = Array.isArray(room.messages) ? room.messages : [];

  return {
    ...room,
    messages: [...messages, message].slice(-MAX_SIGNAL_MESSAGES),
  };
}

function leaveRoom(room: CallRoom, body: Record<string, unknown>): CallRoom {
  const peerId = safeString(body.peerId);
  const participants = asRecord(room.participants);
  const { [peerId]: _removed, ...nextParticipants } = participants;
  return {
    ...room,
    participants: nextParticipants,
    messages: [
      ...(Array.isArray(room.messages) ? room.messages : []),
      {
        id: makeId("signal"),
        from: peerId,
        type: "bye",
        payload: null,
        createdAt: nowIso(),
      },
    ].slice(-MAX_SIGNAL_MESSAGES),
  };
}

export async function POST(request: Request) {
  const body = await parseRequestBody(request);
  const action = safeString(body.action, "poll");
  const roomId = normalizeRoomId(body.roomId);
  const prisma = getPrismaClient();
  const { production, projectSlug, episodeSlug } = await ensureProduction(prisma, body);
  const productionJson = asRecord(production.productionJson);
  const callRooms = asRecord(productionJson.callRooms);
  const existingRoom = cleanupRoom(asRecord(callRooms[roomId]));

  let room: CallRoom = {
    roomId,
    projectSlug,
    episodeSlug,
    createdAt: safeString(existingRoom.createdAt, nowIso()),
    updatedAt: nowIso(),
    participants: asRecord(existingRoom.participants),
    messages: Array.isArray(existingRoom.messages) ? existingRoom.messages : [],
  };

  if (action === "join" || action === "poll" || action === "signal") {
    room = upsertParticipant(room, body);
  }

  if (action === "signal") {
    room = appendSignal(room, body);
  }

  if (action === "leave") {
    room = leaveRoom(room, body);
  }

  if (action === "reset") {
    room = {
      roomId,
      projectSlug,
      episodeSlug,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      participants: {},
      messages: [],
    };
  }

  const updated = await prisma.studioEpisodeProduction.update({
    where: { id: production.id },
    data: {
      productionJson: {
        ...productionJson,
        callRooms: {
          ...callRooms,
          [roomId]: room,
        },
      } as any,
    },
  });

  const since = Date.parse(safeString(body.since));
  const messages = Array.isArray(room.messages) ? room.messages : [];
  const visibleMessages = messages.filter((message) => {
    const record = asRecord(message);
    const createdAt = Date.parse(safeString(record.createdAt));
    const to = safeString(record.to);
    const peerId = safeString(body.peerId);
    if (record.from === peerId) return false;
    if (to && to !== peerId) return false;
    return !Number.isFinite(since) || createdAt > since;
  });

  return NextResponse.json({
    ok: true,
    mode: "database",
    projectSlug,
    episodeSlug,
    roomId,
    productionId: production.id,
    updatedAt: updated.updatedAt.toISOString(),
    participants: Object.values(asRecord(room.participants)),
    messages: visibleMessages,
    serverTime: nowIso(),
  });
}
