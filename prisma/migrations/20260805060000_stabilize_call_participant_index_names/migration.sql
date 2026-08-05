-- PostgreSQL silently truncates identifiers longer than 63 bytes. Give the
-- access-ledger indexes explicit stable names so Prisma's committed schema and
-- every deployed database agree instead of repeatedly proposing renames.
ALTER INDEX IF EXISTS "CallParticipantAccessReceipt_participantId_accessRevision_creat"
  RENAME TO "CallAccessReceipt_participant_revision_created_idx";

ALTER INDEX IF EXISTS "CallParticipantProviderGrantReceipt_roomId_providerIdentity_exp"
  RENAME TO "CallProviderGrant_room_identity_expires_idx";

ALTER INDEX IF EXISTS "CallParticipantProviderGrantReceipt_providerRoomId_expiresAt_id"
  RENAME TO "CallProviderGrant_provider_room_expires_idx";
