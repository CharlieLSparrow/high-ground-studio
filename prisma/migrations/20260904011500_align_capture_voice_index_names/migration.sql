-- PostgreSQL truncates identifiers to 63 bytes. The original explicit names
-- for these two indexes were longer than that boundary, while Prisma's schema
-- engine derives different stable shortened names. Align the physical names
-- so a fresh migration replay and the retained database both converge without
-- rebuilding either index or touching source data.
ALTER INDEX IF EXISTS "CaptureSourceImportAuthorization_recordingConsentId_createdAt_i"
RENAME TO "CaptureSourceImportAuthorization_recordingConsentId_created_idx";

ALTER INDEX IF EXISTS "VoiceRecognitionTerm_preferenceUserId_isActive_count_updatedAt_"
RENAME TO "VoiceRecognitionTerm_preferenceUserId_isActive_count_update_idx";
