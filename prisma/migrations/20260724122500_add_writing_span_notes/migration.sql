-- Writing-margin notes are durable private overlays on exact tagged spans.
-- Keeping the note beside its verified offsets lets portable document
-- backup/restore preserve the annotation without mutating source text.
ALTER TABLE "StudioTaggedSpan"
  ADD COLUMN "noteBody" TEXT;
