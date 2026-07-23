import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";

import { buildInboxSnapshot } from "./inbox-model";

function accessibleRooms(userId: string, isStaff: boolean) {
  return isStaff ? {} : {
    OR: [
      { createdByUserId: userId },
      { participants: { some: { userId } } },
      { booking: { clientUserId: userId } },
      { booking: { coachUserId: userId } },
    ],
  };
}

export async function loadInbox(userId: string, actorEmail: string, isStaff: boolean) {
  const prisma = getPrismaClient() as any;
  const visibleProjects = actorEmail ? await listProjectsVisibleToEmail(actorEmail, prisma) : [];
  const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));
  const [rooms, snippets, bookmarks] = await Promise.all([
    prisma.callRoom.findMany({
      where: {
        ...accessibleRooms(userId, isStaff),
        notes: { some: { kind: "SUMMARY" } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        purpose: true,
        updatedAt: true,
        project: { select: { id: true, name: true, slug: true } },
        notes: {
          where: { kind: { in: ["SUMMARY", "HIGHLIGHT"] } },
          orderBy: [{ createdAt: "desc" }, { updatedAt: "desc" }],
          take: 100,
          select: { id: true, kind: true, title: true, body: true, sourceJson: true, createdAt: true, updatedAt: true },
        },
        actionItems: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { id: true, roomId: true, title: true, detail: true, sourceJson: true },
        },
      },
    }),
    prisma.snippet.findMany({
      where: { userId, collectionId: null, researchFilings: { none: {} } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        sourceTitle: true,
        highlightedText: true,
        updatedAt: true,
        _count: { select: { captureReceipts: true } },
        captureReceipts: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
    }),
    prisma.bookmark.findMany({
      where: { userId, collectionId: null, researchFilings: { none: {} } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        url: true,
        metadataJson: true,
        updatedAt: true,
        _count: { select: { captureReceipts: true } },
        captureReceipts: { orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } },
      },
    }),
  ]);

  return buildInboxSnapshot(rooms.map((room: any) => ({
    ...room,
    project: room.project && visibleProjectIds.has(room.project.id) ? room.project : null,
  })), [
    ...snippets.map((snippet: any) => ({
      id: snippet.id,
      captureType: "SNIPPET" as const,
      title: snippet.sourceTitle || "Saved passage",
      excerpt: snippet.highlightedText,
      updatedAt: snippet.updatedAt,
      captureCount: snippet._count.captureReceipts || 1,
      lastCapturedAt: snippet.captureReceipts[0]?.capturedAt || snippet.updatedAt,
    })),
    ...bookmarks.map((bookmark: any) => ({
      id: bookmark.id,
      captureType: "BOOKMARK" as const,
      title: bookmark.title || "Saved link",
      excerpt: bookmark.url,
      updatedAt: bookmark.updatedAt,
      captureCount: bookmark._count.captureReceipts || 1,
      lastCapturedAt: bookmark.captureReceipts[0]?.capturedAt || bookmark.updatedAt,
    })),
  ]);
}
