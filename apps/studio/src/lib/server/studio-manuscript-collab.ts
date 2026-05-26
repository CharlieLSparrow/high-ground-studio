import "server-only";

import type { StudioManuscriptCollaborationRoom } from "@prisma/client";

import { getPrismaClient } from "@/lib/prisma";

export const STUDIO_MANUSCRIPT_LIVE_ROOM_NAME =
  "studio-manuscript-live-latest";

function normalizeRoomTitle(title: string | null | undefined) {
  const normalized = String(title ?? "").trim();

  return (normalized || "Untitled manuscript").slice(0, 140);
}

export type StudioManuscriptCollaborationRoomSummary = {
  id: string;
  roomName: string;
  title: string;
  seedSnapshotId: string | null;
  seededAt: string | null;
  seededByEmail: string | null;
  lastCheckpointSnapshotId: string | null;
  hasPersistedState: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapRoomSummary(
  room: StudioManuscriptCollaborationRoom,
): StudioManuscriptCollaborationRoomSummary {
  return {
    id: room.id,
    roomName: room.roomName,
    title: room.title,
    seedSnapshotId: room.seedSnapshotId,
    seededAt: room.seededAt?.toISOString() ?? null,
    seededByEmail: room.seededByEmail,
    lastCheckpointSnapshotId: room.lastCheckpointSnapshotId,
    hasPersistedState: Boolean(room.ydocState?.length),
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

export async function getOrCreateStudioManuscriptLiveRoom(input: {
  title?: string | null;
  seedSnapshotId?: string | null;
}) {
  const prisma = getPrismaClient();
  const title = normalizeRoomTitle(input.title);

  const room = await prisma.studioManuscriptCollaborationRoom.upsert({
    where: { roomName: STUDIO_MANUSCRIPT_LIVE_ROOM_NAME },
    create: {
      roomName: STUDIO_MANUSCRIPT_LIVE_ROOM_NAME,
      title,
      seedSnapshotId: input.seedSnapshotId ?? null,
    },
    update: {
      title,
      seedSnapshotId: input.seedSnapshotId ?? undefined,
    },
  });

  return mapRoomSummary(room);
}

export async function claimStudioManuscriptLiveRoomSeed(input: {
  email: string;
}) {
  const prisma = getPrismaClient();

  const result = await prisma.studioManuscriptCollaborationRoom.updateMany({
    where: {
      roomName: STUDIO_MANUSCRIPT_LIVE_ROOM_NAME,
      seededAt: null,
      ydocState: null,
    },
    data: {
      seededAt: new Date(),
      seededByEmail: input.email.trim().toLowerCase(),
    },
  });

  const room = await prisma.studioManuscriptCollaborationRoom.findUnique({
    where: { roomName: STUDIO_MANUSCRIPT_LIVE_ROOM_NAME },
  });

  return {
    claimed: result.count === 1,
    room: room ? mapRoomSummary(room) : null,
  };
}

export async function markStudioManuscriptLiveRoomCheckpoint(input: {
  snapshotId: string;
}) {
  const prisma = getPrismaClient();

  const room = await prisma.studioManuscriptCollaborationRoom.update({
    where: { roomName: STUDIO_MANUSCRIPT_LIVE_ROOM_NAME },
    data: {
      lastCheckpointSnapshotId: input.snapshotId,
    },
  });

  return mapRoomSummary(room);
}
