import "server-only";

import {
  countLiveRoomTextStats,
  createLiveRoomStateUpdateFromText,
  decodeLiveRoomUpdateBase64,
  encodeLiveRoomUpdateBase64,
  getLiveRoomTextFromUpdate,
  mergeLiveRoomUpdates,
  STUDIO_MANUSCRIPT_LIVE_ROOM_SCHEMA_VERSION,
} from "@/app/manuscript/live/studio-manuscript-live-room-model";
import { getPrismaClient } from "@/lib/prisma";
import { normalizeStudioAuthEmail } from "@/lib/server/studio-auth-mode";

const MAX_LIVE_ROOM_TITLE_LENGTH = 140;
const MAX_LIVE_ROOM_INITIAL_TEXT_LENGTH = 500_000;
const MAX_LIVE_ROOM_UPDATE_BYTES = 750_000;
const MAX_LIVE_ROOM_LIST_LIMIT = 20;
const MAX_LIVE_ROOM_UPDATE_LIMIT = 200;
const PRESENCE_ACTIVE_WINDOW_MS = 1000 * 60 * 2;

export type StudioManuscriptLivePresenceSummary = {
  actorEmail: string;
  displayName: string | null;
  clientId: string | null;
  mode: string | null;
  lastSeenAt: string;
};

export type StudioManuscriptLiveRoomSummary = {
  id: string;
  manuscriptId: string | null;
  ownerEmail: string;
  title: string;
  schemaVersion: number;
  clock: number;
  wordCount: number;
  characterCount: number;
  updatedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  activePresence: StudioManuscriptLivePresenceSummary[];
};

export type StudioManuscriptLiveRoomDetail =
  StudioManuscriptLiveRoomSummary & {
    ydocUpdateBase64: string;
    plainText: string;
  };

export type StudioManuscriptLiveRoomUpdateSummary = {
  id: string;
  actorEmail: string;
  clientId: string | null;
  clock: number;
  updateBase64: string;
  createdAt: string;
};

function normalizeOwnerEmail(email: string) {
  return normalizeStudioAuthEmail(email);
}

function normalizeLiveRoomTitle(title: unknown) {
  const normalized = String(title ?? "").trim();

  return (normalized || "Live manuscript room").slice(
    0,
    MAX_LIVE_ROOM_TITLE_LENGTH,
  );
}

function normalizeClientId(clientId: unknown) {
  const normalized = String(clientId ?? "").trim();

  return normalized ? normalized.slice(0, 120) : null;
}

function normalizeMode(mode: unknown) {
  const normalized = String(mode ?? "").trim();

  return normalized ? normalized.slice(0, 80) : null;
}

function normalizeInitialText(text: unknown) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .slice(0, MAX_LIVE_ROOM_INITIAL_TEXT_LENGTH);
}

function mapPresenceSummary(
  presence: {
    actorEmail: string;
    displayName: string | null;
    clientId: string | null;
    mode: string | null;
    lastSeenAt: Date;
  },
): StudioManuscriptLivePresenceSummary {
  return {
    actorEmail: presence.actorEmail,
    displayName: presence.displayName,
    clientId: presence.clientId,
    mode: presence.mode,
    lastSeenAt: presence.lastSeenAt.toISOString(),
  };
}

function mapRoomSummary(room: {
  id: string;
  manuscriptId: string | null;
  ownerEmail: string;
  title: string;
  schemaVersion: number;
  clock: number;
  wordCount: number;
  characterCount: number;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  presences?: Array<{
    actorEmail: string;
    displayName: string | null;
    clientId: string | null;
    mode: string | null;
    lastSeenAt: Date;
  }>;
}): StudioManuscriptLiveRoomSummary {
  return {
    id: room.id,
    manuscriptId: room.manuscriptId,
    ownerEmail: room.ownerEmail,
    title: room.title,
    schemaVersion: room.schemaVersion,
    clock: room.clock,
    wordCount: room.wordCount,
    characterCount: room.characterCount,
    updatedByEmail: room.updatedByEmail,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    activePresence: (room.presences ?? []).map(mapPresenceSummary),
  };
}

function mapRoomDetail(room: {
  id: string;
  manuscriptId: string | null;
  ownerEmail: string;
  title: string;
  schemaVersion: number;
  ydocUpdate: Uint8Array;
  plainText: string;
  clock: number;
  wordCount: number;
  characterCount: number;
  updatedByEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
  presences?: Array<{
    actorEmail: string;
    displayName: string | null;
    clientId: string | null;
    mode: string | null;
    lastSeenAt: Date;
  }>;
}): StudioManuscriptLiveRoomDetail {
  return {
    ...mapRoomSummary(room),
    ydocUpdateBase64: encodeLiveRoomUpdateBase64(room.ydocUpdate),
    plainText: room.plainText,
  };
}

function mapUpdateSummary(update: {
  id: string;
  actorEmail: string;
  clientId: string | null;
  clock: number;
  update: Uint8Array;
  createdAt: Date;
}): StudioManuscriptLiveRoomUpdateSummary {
  return {
    id: update.id,
    actorEmail: update.actorEmail,
    clientId: update.clientId,
    clock: update.clock,
    updateBase64: encodeLiveRoomUpdateBase64(update.update),
    createdAt: update.createdAt.toISOString(),
  };
}

function createActivePresenceWhere() {
  return {
    lastSeenAt: {
      gte: new Date(Date.now() - PRESENCE_ACTIVE_WINDOW_MS),
    },
  };
}

export async function listStudioManuscriptLiveRooms(input: {
  ownerEmail: string;
  limit?: number;
}): Promise<StudioManuscriptLiveRoomSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? 10), 1),
    MAX_LIVE_ROOM_LIST_LIMIT,
  );
  const prisma = getPrismaClient();

  const rooms = await prisma.studioManuscriptLiveRoom.findMany({
    where: { ownerEmail, archivedAt: null },
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: {
      presences: {
        where: createActivePresenceWhere(),
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  return rooms.map(mapRoomSummary);
}

export async function createStudioManuscriptLiveRoom(input: {
  ownerEmail: string;
  title: unknown;
  initialText?: unknown;
  manuscriptId?: unknown;
}): Promise<StudioManuscriptLiveRoomDetail> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const title = normalizeLiveRoomTitle(input.title);
  const initialText = normalizeInitialText(input.initialText);
  const initialUpdate = createLiveRoomStateUpdateFromText(initialText);
  const stats = countLiveRoomTextStats(initialText);
  const manuscriptId =
    typeof input.manuscriptId === "string" && input.manuscriptId.trim()
      ? input.manuscriptId.trim()
      : null;
  const prisma = getPrismaClient();

  const room = await prisma.studioManuscriptLiveRoom.create({
    data: {
      ownerEmail,
      manuscriptId,
      title,
      schemaVersion: STUDIO_MANUSCRIPT_LIVE_ROOM_SCHEMA_VERSION,
      ydocUpdate: Buffer.from(initialUpdate),
      plainText: initialText,
      wordCount: stats.words,
      characterCount: stats.characters,
      updatedByEmail: ownerEmail,
    },
    include: {
      presences: {
        where: createActivePresenceWhere(),
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  return mapRoomDetail(room);
}

export async function getStudioManuscriptLiveRoom(input: {
  ownerEmail: string;
  roomId: string;
}): Promise<StudioManuscriptLiveRoomDetail | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();

  const room = await prisma.studioManuscriptLiveRoom.findFirst({
    where: {
      id: input.roomId,
      ownerEmail,
      archivedAt: null,
    },
    include: {
      presences: {
        where: createActivePresenceWhere(),
        orderBy: { lastSeenAt: "desc" },
      },
    },
  });

  return room ? mapRoomDetail(room) : null;
}

export async function listStudioManuscriptLiveRoomUpdates(input: {
  ownerEmail: string;
  roomId: string;
  afterClock: number;
  limit?: number;
}): Promise<StudioManuscriptLiveRoomUpdateSummary[]> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const afterClock = Math.max(Math.floor(input.afterClock), 0);
  const take = Math.min(
    Math.max(Math.floor(input.limit ?? MAX_LIVE_ROOM_UPDATE_LIMIT), 1),
    MAX_LIVE_ROOM_UPDATE_LIMIT,
  );
  const prisma = getPrismaClient();

  const room = await prisma.studioManuscriptLiveRoom.findFirst({
    where: { id: input.roomId, ownerEmail, archivedAt: null },
    select: { id: true },
  });

  if (!room) {
    return [];
  }

  const updates = await prisma.studioManuscriptLiveRoomUpdate.findMany({
    where: {
      roomId: room.id,
      clock: { gt: afterClock },
    },
    orderBy: { clock: "asc" },
    take,
  });

  return updates.map(mapUpdateSummary);
}

export async function appendStudioManuscriptLiveRoomUpdate(input: {
  ownerEmail: string;
  roomId: string;
  updateBase64: unknown;
  clientId?: unknown;
}): Promise<StudioManuscriptLiveRoomSummary | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const update =
    typeof input.updateBase64 === "string"
      ? decodeLiveRoomUpdateBase64(input.updateBase64)
      : null;

  if (!update || update.byteLength > MAX_LIVE_ROOM_UPDATE_BYTES) {
    throw new Error("Live manuscript update is missing or too large.");
  }

  const clientId = normalizeClientId(input.clientId);
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const room = await tx.studioManuscriptLiveRoom.findFirst({
      where: { id: input.roomId, ownerEmail, archivedAt: null },
      include: {
        presences: {
          where: createActivePresenceWhere(),
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });

    if (!room) {
      return null;
    }

    const nextClock = room.clock + 1;
    const mergedUpdate = mergeLiveRoomUpdates([room.ydocUpdate, update]);
    const plainText = getLiveRoomTextFromUpdate(mergedUpdate);
    const stats = countLiveRoomTextStats(plainText);

    await tx.studioManuscriptLiveRoomUpdate.create({
      data: {
        roomId: room.id,
        actorEmail: ownerEmail,
        clientId,
        clock: nextClock,
        update: Buffer.from(update),
      },
    });

    const updatedRoom = await tx.studioManuscriptLiveRoom.update({
      where: { id: room.id },
      data: {
        ydocUpdate: Buffer.from(mergedUpdate),
        plainText,
        clock: nextClock,
        wordCount: stats.words,
        characterCount: stats.characters,
        updatedByEmail: ownerEmail,
      },
      include: {
        presences: {
          where: createActivePresenceWhere(),
          orderBy: { lastSeenAt: "desc" },
        },
      },
    });

    return mapRoomSummary(updatedRoom);
  });
}

export async function heartbeatStudioManuscriptLivePresence(input: {
  ownerEmail: string;
  roomId: string;
  displayName?: unknown;
  clientId?: unknown;
  mode?: unknown;
}): Promise<StudioManuscriptLivePresenceSummary[] | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const displayName =
    typeof input.displayName === "string" && input.displayName.trim()
      ? input.displayName.trim().slice(0, 120)
      : null;
  const clientId = normalizeClientId(input.clientId);
  const mode = normalizeMode(input.mode);
  const prisma = getPrismaClient();

  return prisma.$transaction(async (tx) => {
    const room = await tx.studioManuscriptLiveRoom.findFirst({
      where: { id: input.roomId, ownerEmail, archivedAt: null },
      select: { id: true },
    });

    if (!room) {
      return null;
    }

    await tx.studioManuscriptLivePresence.upsert({
      where: {
        roomId_actorEmail: {
          roomId: room.id,
          actorEmail: ownerEmail,
        },
      },
      create: {
        roomId: room.id,
        actorEmail: ownerEmail,
        displayName,
        clientId,
        mode,
        lastSeenAt: new Date(),
      },
      update: {
        displayName,
        clientId,
        mode,
        lastSeenAt: new Date(),
      },
    });

    const presences = await tx.studioManuscriptLivePresence.findMany({
      where: { roomId: room.id, ...createActivePresenceWhere() },
      orderBy: { lastSeenAt: "desc" },
    });

    return presences.map(mapPresenceSummary);
  });
}

export async function listStudioManuscriptLivePresence(input: {
  ownerEmail: string;
  roomId: string;
}): Promise<StudioManuscriptLivePresenceSummary[] | null> {
  const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
  const prisma = getPrismaClient();

  const room = await prisma.studioManuscriptLiveRoom.findFirst({
    where: { id: input.roomId, ownerEmail, archivedAt: null },
    select: { id: true },
  });

  if (!room) {
    return null;
  }

  const presences = await prisma.studioManuscriptLivePresence.findMany({
    where: { roomId: room.id, ...createActivePresenceWhere() },
    orderBy: { lastSeenAt: "desc" },
  });

  return presences.map(mapPresenceSummary);
}
