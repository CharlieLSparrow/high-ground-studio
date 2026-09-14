import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { SessionFollowThrough } from "../session-after-call";
import { sessionAccessWhere, type SessionAccessActor } from "./session-access";
import { mobileSessionNoteVisibilityWhere } from "./session-note-access";
import { loadSessionWork } from "./session-work";

const finished = new Set(["DONE", "ACHIEVED", "CANCELED", "CANCELLED", "ARCHIVED"]);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A recap must cover this take's selected audio lanes, not an earlier call or
 * just the first participant to finish uploading. Edited recaps retain source
 * identity; the preview reads the actual note, never its generated snapshot. */
export function recapCoversTake(sourceJson: unknown, roomId: string, sourceIds: string[]) {
  const source = record(sourceJson);
  if (!sourceIds.length || source.roomId !== roomId || source.origin !== "quipsly-session-follow-through") return false;
  const sources = new Set(Array.isArray(source.transcriptSources)
    ? source.transcriptSources.flatMap(value => typeof record(value).recordingAssetId === "string" ? [record(value).recordingAssetId] : []) : []);
  if (typeof source.recordingAssetId === "string") sources.add(source.recordingAssetId);
  return sources.size === new Set(sourceIds).size && sourceIds.every(id => sources.has(id));
}

export async function loadSessionAfterCallWork(input: {
  prisma: PrismaClient; roomId: string; actor: SessionAccessActor; sourceIds: string[];
}): Promise<SessionFollowThrough | null> {
  const { prisma, roomId, actor, sourceIds } = input;
  // Recheck membership alongside note visibility: the first availability read
  // does not grant durable access if somebody is removed during this request.
  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(roomId, actor),
    select: { notes: {
      where: { kind: "SUMMARY", ...mobileSessionNoteVisibilityWhere({ actorUserId: actor.id,
        actorEmail: String(actor.primaryEmail || actor.email || "").trim().toLowerCase(), isStaff: actor.isStaff === true }) },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100,
      select: { id: true, title: true, body: true, visibility: true, sourceJson: true },
    } },
  });
  if (!room) return null;
  const entries = await loadSessionWork({ prisma, roomId, actor });
  const open = entries.filter(entry => !finished.has(entry.status));
  const recap = room.notes.find(note => recapCoversTake(note.sourceJson, roomId, sourceIds));
  return {
    recap: recap ? { id: recap.id, title: recap.title || "Session recap", excerpt: recap.body.slice(0, 700), visibility: recap.visibility } : null,
    openTasks: open.filter(entry => entry.kind === "TASK").length,
    openGoals: open.filter(entry => entry.kind === "GOAL").length,
    nextSteps: open.slice(0, 4).map(entry => ({ id: entry.id, title: (entry.title || entry.body || "Untitled").slice(0, 240),
      kind: entry.kind, ownerLabel: entry.ownerLabel, visibility: entry.visibility })),
  };
}
