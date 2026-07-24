-- Add structured intake/capture metadata to coaching requests.
-- This lets public coaching requests carry session intent, recording preference,
-- and request-to-booking handoff hints without stuffing system state into prose.
ALTER TABLE "CoachingRequest"
ADD COLUMN "metadataJson" JSONB NOT NULL DEFAULT '{}';
