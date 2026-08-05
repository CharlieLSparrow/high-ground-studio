ALTER INDEX "ProviderRecordingCommand_expectedStorageBucket_expectedStor_idx"
RENAME TO "ProviderRecordingCommand_expectedStorageBucket_expectedStorageO";

ALTER TABLE "CallRoom"
ALTER COLUMN "captureGroupId" SET DEFAULT gen_random_uuid();
