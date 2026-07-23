CREATE TABLE "CoachingNoteTagLink" (
  "noteId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "sourceJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CoachingNoteTagLink_pkey" PRIMARY KEY ("noteId", "tagId")
);

CREATE INDEX "CoachingNoteTagLink_tagId_createdAt_idx"
  ON "CoachingNoteTagLink"("tagId", "createdAt");

CREATE INDEX "CoachingNoteTagLink_createdByUserId_createdAt_idx"
  ON "CoachingNoteTagLink"("createdByUserId", "createdAt");

ALTER TABLE "CoachingNoteTagLink"
  ADD CONSTRAINT "CoachingNoteTagLink_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "CoachingNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachingNoteTagLink"
  ADD CONSTRAINT "CoachingNoteTagLink_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "StudioTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachingNoteTagLink"
  ADD CONSTRAINT "CoachingNoteTagLink_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
