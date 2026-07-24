import { NextResponse } from "next/server";
import { z } from "zod";

import { getPrismaClient } from "@/lib/prisma";
import {
  parseQuipslyNoteToBlocks,
  QUIPSLY_NATIVE_NOTE_SOURCE_LABEL,
} from "@/lib/server/bi-directional-sync";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

export const runtime = "nodejs";

const MAX_NOTES_PER_SYNC = 500;
const MAX_NOTE_TITLE_LENGTH = 500;
const MAX_NOTE_CONTENT_LENGTH = 2_000_000;

const noteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(MAX_NOTE_TITLE_LENGTH),
  content: z.string().max(MAX_NOTE_CONTENT_LENGTH),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const syncPayloadSchema = z.object({
  lastSyncAt: z.string().datetime().nullable(),
  clientNotes: z.array(noteSchema).max(MAX_NOTES_PER_SYNC),
});

type ExistingNote = {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  folderName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {},
) {
  return NextResponse.json({ ok: false, code, error, ...extra }, { status });
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

async function readPayload(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      response: errorResponse(400, "INVALID_JSON", "Send a valid JSON sync payload."),
    };
  }

  const result = syncPayloadSchema.safeParse(body);
  if (!result.success) {
    return {
      response: errorResponse(
        400,
        "INVALID_SYNC_PAYLOAD",
        "The note sync payload is invalid.",
        { issues: result.error.issues },
      ),
    };
  }

  const ids = result.data.clientNotes.map((note) => note.id);
  if (new Set(ids).size !== ids.length) {
    return {
      response: errorResponse(
        400,
        "DUPLICATE_NOTE_ID",
        "Each note may appear only once in a sync request.",
      ),
    };
  }

  return { payload: result.data };
}

export async function POST(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  if (!session?.user) {
    return errorResponse(401, "UNAUTHORIZED", "Sign in before syncing notes.");
  }

  const parsed = await readPayload(request);
  if (parsed.response) return parsed.response;

  const { payload } = parsed;
  const userId = session.user.id;
  const prisma = getPrismaClient();

  try {
    const noteIds = payload.clientNotes.map((note) => note.id);
    let existingNotes: ExistingNote[] = [];

    if (noteIds.length > 0) {
      existingNotes = await prisma.quipslyNote.findMany({
        where: { id: { in: noteIds } },
        select: {
          id: true,
          userId: true,
          title: true,
          content: true,
          tags: true,
          folderName: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // UUIDs are supplied by clients. Check every globally matching row before
      // making any mutation, then keep the mutation itself scoped by userId.
      // This prevents a guessed or copied UUID from becoming a cross-owner upsert.
      if (existingNotes.some((note) => note.userId !== userId)) {
        return errorResponse(
          404,
          "NOTE_NOT_FOUND",
          "One or more notes are unavailable for this account.",
        );
      }

      // Reject obvious projection collisions before saving. The projection
      // helper repeats this check against the canonical Home Nest ID so this
      // route is not the only authorization boundary.
      const ownerEmail = session.user.primaryEmail.trim().toLowerCase();
      const projectedDocuments = await prisma.studioDocument.findMany({
        where: { stableId: { in: noteIds } },
        select: {
          stableId: true,
          sourceLabel: true,
          project: {
            select: {
              accessGrants: {
                where: {
                  email: ownerEmail,
                  role: "OWNER",
                  status: "ACTIVE",
                },
                select: { id: true },
              },
            },
          },
        },
      });
      if (
        projectedDocuments.some(
          (document) =>
            document.sourceLabel !== QUIPSLY_NATIVE_NOTE_SOURCE_LABEL ||
            document.project.accessGrants.length !== 1,
        )
      ) {
        return errorResponse(
          409,
          "NOTE_ID_UNAVAILABLE",
          "One or more note identifiers cannot be used by this account.",
        );
      }

      // lastSyncAt is a server-issued cursor, but this protocol does not carry
      // the common base revision needed for a lossless three-way merge. If the
      // server and offline client both changed, stop the entire batch before
      // any write and return both versions for explicit review. A two-way diff
      // would only turn the current server text into the client text and silently
      // discard the server edit while looking like a successful merge.
      const lastSyncDate = payload.lastSyncAt
        ? new Date(payload.lastSyncAt)
        : new Date(0);
      const clientNotesById = new Map(
        payload.clientNotes.map((note) => [note.id, note]),
      );
      const conflicts = existingNotes.flatMap((existingNote) => {
        const clientNote = clientNotesById.get(existingNote.id);
        if (
          !clientNote ||
          existingNote.updatedAt <= lastSyncDate ||
          (existingNote.title === clientNote.title &&
            existingNote.content === clientNote.content)
        ) {
          return [];
        }

        return [
          {
            noteId: existingNote.id,
            serverUpdatedAt: existingNote.updatedAt.toISOString(),
            clientUpdatedAt: clientNote.updatedAt,
            serverNote: {
              id: existingNote.id,
              title: existingNote.title,
              content: existingNote.content,
              tags: existingNote.tags,
              folderName: existingNote.folderName,
              createdAt: existingNote.createdAt.toISOString(),
              updatedAt: existingNote.updatedAt.toISOString(),
            },
          },
        ];
      });

      if (conflicts.length > 0) {
        return errorResponse(
          409,
          "SYNC_CONFLICT_REVIEW_REQUIRED",
          "A note changed here and on this device. Review both versions before syncing again; neither copy was overwritten.",
          {
            retryable: false,
            notesSaved: false,
            conflicts,
          },
        );
      }
    }

    const existingById = new Map(existingNotes.map((note) => [note.id, note]));
    const projectionFailures: string[] = [];
    const serverWriteTime = new Date();

    if (payload.clientNotes.length > 0) {
      for (const note of payload.clientNotes) {
        const existingNote = existingById.get(note.id);

        if (existingNote) {
          if (
            existingNote.title !== note.title ||
            existingNote.content !== note.content
          ) {
            const updated = await prisma.quipslyNote.updateMany({
              where: { id: note.id, userId },
              data: {
                title: note.title,
                content: note.content,
                // Server time is the conflict cursor. A device clock may be
                // offline or skewed, so never promote its timestamp to the
                // canonical revision boundary.
                updatedAt: serverWriteTime,
              },
            });
            if (updated.count !== 1) {
              return errorResponse(
                409,
                "NOTE_CHANGED_DURING_SYNC",
                "A note changed ownership or was removed during sync. No other account was updated.",
                { retryable: true },
              );
            }
          }
        } else {
          try {
            await prisma.quipslyNote.create({
              data: {
                id: note.id,
                userId,
                title: note.title,
                content: note.content,
                createdAt: new Date(note.createdAt),
                updatedAt: serverWriteTime,
              },
            });
          } catch (error) {
            if (isUniqueConstraintError(error)) {
              return errorResponse(
                409,
                "NOTE_ID_UNAVAILABLE",
                "A note identifier became unavailable during sync. No other account was updated.",
                { retryable: false },
              );
            }
            throw error;
          }
        }

        try {
          await parseQuipslyNoteToBlocks(note.id, userId);
        } catch (error) {
          projectionFailures.push(note.id);
          console.error(`[SYNC] Failed to project note ${note.id} into Nest blocks`, error);
        }
      }
    }

    const lastSyncDate = payload.lastSyncAt
      ? new Date(payload.lastSyncAt)
      : new Date(0);
    const serverNotes = await prisma.quipslyNote.findMany({
      where: {
        userId,
        updatedAt: { gt: lastSyncDate },
      },
    });
    const syncCompletedAt = new Date().toISOString();

    if (projectionFailures.length > 0) {
      return errorResponse(
        503,
        "NEST_PROJECTION_FAILED",
        "Your notes were saved, but one or more Nest projections failed. Retry sync to finish projecting them.",
        {
          retryable: true,
          notesSaved: true,
          failedProjectionNoteIds: projectionFailures,
          serverNotes,
          syncCompletedAt,
        },
      );
    }

    return NextResponse.json({
      ok: true,
      serverNotes,
      syncCompletedAt,
    });
  } catch (error) {
    console.error("[SYNC_ERROR]", error);
    return errorResponse(
      500,
      "SYNC_FAILED",
      "The server could not complete note sync. Your local notes were not deleted.",
      { retryable: true },
    );
  }
}
