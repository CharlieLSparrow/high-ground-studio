-- Session notes need a database-persisted audience boundary. Existing rows
-- become author-private so a shared Session cannot retroactively broaden
-- access. Text, kind, and visibility changes receive append-only revisions.
ALTER TYPE "CoachingNoteKind" ADD VALUE IF NOT EXISTS 'DECISION';
ALTER TYPE "CoachingNoteKind" ADD VALUE IF NOT EXISTS 'PRODUCTION';

CREATE TYPE "CoachingNoteVisibility" AS ENUM (
    'AUTHOR_PRIVATE',
    'SESSION_SHARED',
    'CLIENT_SAFE',
    'PROJECT_TEAM'
);

ALTER TABLE "CoachingNote"
  ADD COLUMN "visibility" "CoachingNoteVisibility" NOT NULL DEFAULT 'AUTHOR_PRIVATE';

CREATE TABLE "CoachingNoteRevision" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "actorUserId" TEXT,
    "snapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingNoteRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CoachingNoteRevision" (
    "id",
    "noteId",
    "revision",
    "operation",
    "actorUserId",
    "snapshotJson",
    "createdAt"
)
SELECT
    'note-revision-' || md5("id"),
    "id",
    1,
    'visibility-baseline',
    "authorUserId",
    jsonb_build_object(
        'title', "title",
        'body', "body",
        'kind', "kind"::text,
        'visibility', 'AUTHOR_PRIVATE',
        'sourceJson', "sourceJson",
        'migration', '20260724160000_add_session_note_visibility'
    ),
    "updatedAt"
FROM "CoachingNote";

CREATE INDEX "CoachingNote_roomId_visibility_updatedAt_idx"
  ON "CoachingNote"("roomId", "visibility", "updatedAt");
CREATE UNIQUE INDEX "CoachingNoteRevision_noteId_revision_key"
  ON "CoachingNoteRevision"("noteId", "revision");
CREATE INDEX "CoachingNoteRevision_actorUserId_createdAt_idx"
  ON "CoachingNoteRevision"("actorUserId", "createdAt");

ALTER TABLE "CoachingNoteRevision"
  ADD CONSTRAINT "CoachingNoteRevision_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "CoachingNote"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingNoteRevision"
  ADD CONSTRAINT "CoachingNoteRevision_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
