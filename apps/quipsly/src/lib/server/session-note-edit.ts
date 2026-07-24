import { createHash, randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  EDITABLE_SESSION_NOTE_KINDS,
  type EditableSessionNoteKind,
  type SessionNoteVisibility,
} from "@/lib/session-note-contract";
import { sessionAccessWhere } from "@/lib/server/session-access";
import { canUseProjectTeamNotes } from "@/lib/server/session-note-access";

type SessionActor = {
  id: string;
  primaryEmail?: string | null;
  email?: string | null;
  isStaff?: boolean;
};

export type EditSessionNoteInput = {
  prisma: PrismaClient;
  actor: SessionActor;
  noteId: string;
  title: string;
  body: string;
  kind: EditableSessionNoteKind | null;
  visibility: SessionNoteVisibility | null;
  tagIds: string[] | null;
  expectedUpdatedAt: Date;
  clientRequestId: string | null;
  surface: "nest-session-notes" | "ios-capture-session-notes";
};

export type SerializedEditedSessionNote = {
  id: string;
  title: string | null;
  body: string;
  kind: string;
  visibility: string;
  updatedAt: string;
  revisionCount: number;
  tags: Array<{ id: string; label: string; slug: string }>;
};

export type EditSessionNoteResult =
  | {
      ok: true;
      note: SerializedEditedSessionNote;
      receiptId: string;
      idempotentReplay: boolean;
      appliedRevision: number;
    }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "CONFLICT"
        | "REQUEST_ID_CONFLICT"
        | "PROJECT_ROLE_REQUIRED"
        | "TAGS_UNAVAILABLE";
      error: string;
      current?: SerializedEditedSessionNote;
    };

const NOTE_SELECT = {
  id: true,
  roomId: true,
  authorUserId: true,
  title: true,
  body: true,
  kind: true,
  visibility: true,
  sourceJson: true,
  updatedAt: true,
  tagLinks: {
    orderBy: { createdAt: "asc" as const },
    select: { tag: { select: { id: true, label: true, slug: true } } },
  },
  _count: { select: { revisions: true } },
};

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function serialized(row: any): SerializedEditedSessionNote {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: String(row.kind),
    visibility: String(row.visibility),
    updatedAt: row.updatedAt.toISOString(),
    revisionCount: row._count?.revisions ?? 0,
    tags: (row.tagLinks || []).map((link: any) => link.tag),
  };
}

function editReceiptId(actorUserId: string, clientRequestId: string | null) {
  if (!clientRequestId) return randomUUID();
  const digest = createHash("sha256")
    .update(`${actorUserId}|${clientRequestId}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `session-note-edit-${digest}`;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return [...value].sort();
}

function replayMatches(snapshotJson: unknown, input: {
  clientRequestId: string;
  noteId: string;
  expectedUpdatedAt: string;
  title: string | null;
  body: string;
  kind: EditableSessionNoteKind;
  visibility: SessionNoteVisibility;
  tagIds: string[];
}) {
  const snapshot = record(snapshotJson);
  return snapshot.clientRequestId === input.clientRequestId
    && snapshot.noteId === input.noteId
    && snapshot.expectedUpdatedAt === input.expectedUpdatedAt
    && (snapshot.title ?? null) === input.title
    && snapshot.body === input.body
    && snapshot.kind === input.kind
    && snapshot.visibility === input.visibility
    && JSON.stringify(stringArray(snapshot.tagIds)) === JSON.stringify([...input.tagIds].sort());
}

async function replayResult(input: {
  prisma: any;
  revisionId: string;
  note: any;
  intent: {
    clientRequestId: string;
    noteId: string;
    expectedUpdatedAt: string;
    title: string | null;
    body: string;
    kind: EditableSessionNoteKind;
    visibility: SessionNoteVisibility;
    tagIds: string[];
  };
}): Promise<EditSessionNoteResult | null> {
  const revision = await input.prisma.coachingNoteRevision.findUnique({
    where: { id: input.revisionId },
    select: { noteId: true, revision: true, snapshotJson: true },
  });
  if (!revision) return null;
  if (revision.noteId !== input.note.id || !replayMatches(revision.snapshotJson, input.intent)) {
    return {
      ok: false,
      code: "REQUEST_ID_CONFLICT",
      error: "This protected phone request identity already belongs to a different Session note edit.",
    };
  }
  const current = await input.prisma.coachingNote.findUnique({
    where: { id: input.note.id },
    select: NOTE_SELECT,
  });
  if (!current) {
    return { ok: false, code: "NOT_FOUND", error: "This actor-owned Session note is no longer available." };
  }
  return {
    ok: true,
    note: serialized(current),
    receiptId: input.revisionId,
    idempotentReplay: true,
    appliedRevision: revision.revision,
  };
}

export async function editSessionNote(input: EditSessionNoteInput): Promise<EditSessionNoteResult> {
  const prisma = input.prisma as any;
  const actorEmail = (input.actor.primaryEmail || input.actor.email || "").trim().toLowerCase();
  if (
    !input.actor.id
    || !input.noteId
    || !input.body
    || !Number.isFinite(input.expectedUpdatedAt.getTime())
    || (input.clientRequestId && (!input.kind || !input.visibility || input.tagIds === null))
  ) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "Keep some note text and refresh before saving an invalid or incomplete protected draft.",
    };
  }

  const note = await prisma.coachingNote.findFirst({
    where: {
      id: input.noteId,
      authorUserId: input.actor.id,
      kind: { in: [...EDITABLE_SESSION_NOTE_KINDS] },
    },
    select: NOTE_SELECT,
  });
  if (!note?.roomId) {
    return { ok: false, code: "NOT_FOUND", error: "This actor-owned Session note is no longer available." };
  }

  const room = await prisma.callRoom.findFirst({
    where: sessionAccessWhere(note.roomId, input.actor as any),
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          accessGrants: actorEmail ? {
            where: { email: actorEmail, status: "ACTIVE" },
            take: 1,
            select: { role: true },
          } : undefined,
        },
      },
    },
  });
  if (!room) {
    return { ok: false, code: "NOT_FOUND", error: "You no longer have access to this note's Session." };
  }

  const nextKind = input.kind ?? note.kind as EditableSessionNoteKind;
  const nextVisibility = input.visibility ?? note.visibility as SessionNoteVisibility;
  const currentTagIds: string[] = note.tagLinks
    .map((link: any) => String(link.tag.id))
    .sort();
  const nextTagIds = input.tagIds === null ? currentTagIds : [...input.tagIds].sort();
  const tagsChanged = JSON.stringify(nextTagIds) !== JSON.stringify(currentTagIds);
  const addedTagIds = nextTagIds.filter((tagId) => !currentTagIds.includes(tagId));
  const canUseProjectTeam = canUseProjectTeamNotes(
    room.project?.accessGrants?.[0]?.role,
    input.actor.isStaff === true,
  );
  if ((nextVisibility === "PROJECT_TEAM" || nextKind === "PRODUCTION") && !canUseProjectTeam) {
    return {
      ok: false,
      code: "PROJECT_ROLE_REQUIRED",
      error: "Only a Nest owner, editor, or authorized staff member can save production-team notes.",
    };
  }
  if (tagsChanged && (!room.projectId || !canUseProjectTeam)) {
    return {
      ok: false,
      code: "TAGS_UNAVAILABLE",
      error: "Owner, editor, or authorized staff access to this Session's Nest is required to change its tags.",
    };
  }

  const revisionId = editReceiptId(input.actor.id, input.clientRequestId);
  const intent = input.clientRequestId ? {
    clientRequestId: input.clientRequestId,
    noteId: note.id,
    expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
    title: input.title || null,
    body: input.body,
    kind: nextKind,
    visibility: nextVisibility,
    tagIds: nextTagIds,
  } : null;
  if (intent) {
    const replay = await replayResult({ prisma, revisionId, note, intent });
    if (replay) return replay;
  }

  if (note.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
    return {
      ok: false,
      code: "CONFLICT",
      error: "This note changed elsewhere. Nest kept the newer version; review it beside the protected iPhone draft.",
      current: serialized(note),
    };
  }
  if (tagsChanged && addedTagIds.length) {
    const validTagCount = await prisma.studioTag.count({
      where: { id: { in: addedTagIds }, projectId: room.projectId, isActive: true },
    });
    if (validTagCount !== addedTagIds.length) {
      return {
        ok: false,
        code: "TAGS_UNAVAILABLE",
        error: "Every selected tag must still be active and belong to this Session's Nest.",
      };
    }
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      const currentRoom = await tx.callRoom.findFirst({
        where: sessionAccessWhere(note.roomId, input.actor as any),
        select: {
          id: true,
          projectId: true,
          project: {
            select: {
              accessGrants: actorEmail ? {
                where: { email: actorEmail, status: "ACTIVE" },
                take: 1,
                select: { role: true },
              } : undefined,
            },
          },
        },
      });
      if (!currentRoom) return { kind: "not-found" as const };
      if (intent) {
        const replay = await replayResult({ prisma: tx, revisionId, note, intent });
        if (replay) return { kind: "replay" as const, replay };
      }
      const stillCanUseProjectTeam = canUseProjectTeamNotes(
        currentRoom.project?.accessGrants?.[0]?.role,
        input.actor.isStaff === true,
      );
      if ((nextVisibility === "PROJECT_TEAM" || nextKind === "PRODUCTION") && !stillCanUseProjectTeam) {
        return { kind: "project-role-required" as const };
      }
      const current = await tx.coachingNote.findFirst({
        where: {
          id: note.id,
          roomId: currentRoom.id,
          authorUserId: input.actor.id,
          kind: { in: [...EDITABLE_SESSION_NOTE_KINDS] },
          updatedAt: input.expectedUpdatedAt,
        },
        select: NOTE_SELECT,
      });
      if (!current) return { kind: "conflict" as const };
      const currentTransactionTagIds: string[] = current.tagLinks
        .map((link: any) => String(link.tag.id))
        .sort();
      const tagsChangedInTransaction = JSON.stringify(nextTagIds) !== JSON.stringify(currentTransactionTagIds);
      const addedTagIdsInTransaction = nextTagIds.filter(
        (tagId) => !currentTransactionTagIds.includes(tagId),
      );
      if (tagsChangedInTransaction && (!currentRoom.projectId || !stillCanUseProjectTeam)) {
        return { kind: "tags-unavailable" as const };
      }
      if (tagsChangedInTransaction && addedTagIdsInTransaction.length) {
        const validTagCount = await tx.studioTag.count({
          where: {
            id: { in: addedTagIdsInTransaction },
            projectId: currentRoom.projectId,
            isActive: true,
          },
        });
        if (validTagCount !== addedTagIdsInTransaction.length) {
          return { kind: "tags-unavailable" as const };
        }
      }

      const latestRevision = await tx.coachingNoteRevision.findFirst({
        where: { noteId: note.id },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      const revision = (latestRevision?.revision ?? 0) + 1;
      const now = new Date();
      const receipt = {
        id: revisionId,
        kind: "quipsly-session-note-edit-v2",
        clientRequestId: input.clientRequestId,
        surface: input.surface,
        changedAt: now.toISOString(),
        changedByUserId: input.actor.id,
        expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
        tagIds: nextTagIds,
        previousContentRetainedInRevision: true,
        externalSideEffects: false,
      };
      const updated = await tx.coachingNote.updateMany({
        where: {
          id: note.id,
          roomId: currentRoom.id,
          authorUserId: input.actor.id,
          kind: { in: [...EDITABLE_SESSION_NOTE_KINDS] },
          updatedAt: input.expectedUpdatedAt,
        },
        data: {
          title: input.title || null,
          body: input.body,
          kind: nextKind,
          visibility: nextVisibility,
          sourceJson: {
            ...record(current.sourceJson),
            lastEditReceipt: {
              ...receipt,
              previous: {
                title: current.title,
                body: current.body,
                kind: current.kind,
                visibility: current.visibility,
                tagIds: current.tagLinks.map((link: any) => link.tag.id).sort(),
              },
            },
          },
        },
      });
      if (updated.count !== 1) return { kind: "conflict" as const };

      if (tagsChangedInTransaction) {
        await tx.coachingNoteTagLink.deleteMany({ where: { noteId: note.id } });
        if (nextTagIds.length) {
          await tx.coachingNoteTagLink.createMany({
            data: nextTagIds.map((tagId: string) => ({
              noteId: note.id,
              tagId,
              createdByUserId: input.actor.id,
              sourceJson: {
                source: "quipsly-session-note-edit-v2",
                receiptId: revisionId,
                externalSideEffects: false,
              },
            })),
          });
        }
      }
      await tx.coachingNoteRevision.create({
        data: {
          id: revisionId,
          noteId: note.id,
          revision,
          operation: input.surface === "ios-capture-session-notes"
            ? "updated-from-ios-capture"
            : "content-or-visibility-updated",
          actorUserId: input.actor.id,
          snapshotJson: {
            noteId: note.id,
            clientRequestId: input.clientRequestId,
            expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
            title: input.title || null,
            body: input.body,
            kind: nextKind,
            visibility: nextVisibility,
            tagIds: nextTagIds,
            previous: {
              title: current.title,
              body: current.body,
              kind: current.kind,
              visibility: current.visibility,
              tagIds: current.tagLinks.map((link: any) => link.tag.id).sort(),
            },
            receiptId: revisionId,
            surface: input.surface,
            externalSideEffects: false,
          },
        },
      });
      const saved = await tx.coachingNote.findUnique({
        where: { id: note.id },
        select: NOTE_SELECT,
      });
      return { kind: "saved" as const, saved, revision };
    }, { isolationLevel: "Serializable" });

    if (result.kind === "replay") return result.replay;
    if (result.kind === "not-found") {
      return { ok: false, code: "NOT_FOUND", error: "You no longer have access to this note's Session." };
    }
    if (result.kind === "project-role-required") {
      return {
        ok: false,
        code: "PROJECT_ROLE_REQUIRED",
        error: "Only a Nest owner, editor, or authorized staff member can save production-team notes.",
      };
    }
    if (result.kind === "tags-unavailable") {
      return {
        ok: false,
        code: "TAGS_UNAVAILABLE",
        error: "Every selected tag must remain active in a Nest this account can edit.",
      };
    }
    if (result.kind === "conflict" || !result.saved) {
      const current = await prisma.coachingNote.findUnique({ where: { id: note.id }, select: NOTE_SELECT });
      return {
        ok: false,
        code: "CONFLICT",
        error: "This note changed elsewhere. Nest kept the newer version; review it beside the protected iPhone draft.",
        current: current ? serialized(current) : undefined,
      };
    }
    return {
      ok: true,
      note: serialized(result.saved),
      receiptId: revisionId,
      idempotentReplay: false,
      appliedRevision: result.revision,
    };
  } catch (error) {
    if (record(error).code !== "P2002" || !intent) throw error;
    const replay = await replayResult({ prisma, revisionId, note, intent });
    return replay ?? {
      ok: false,
      code: "CONFLICT",
      error: "A concurrent edit changed this note. Review the canonical version before retrying.",
    };
  }
}
