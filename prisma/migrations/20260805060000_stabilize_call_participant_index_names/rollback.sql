ALTER INDEX IF EXISTS "CallAccessReceipt_participant_revision_created_idx"
  RENAME TO "CallParticipantAccessReceipt_participantId_accessRevision_creat";

ALTER INDEX IF EXISTS "CallProviderGrant_room_identity_expires_idx"
  RENAME TO "CallParticipantProviderGrantReceipt_roomId_providerIdentity_exp";

ALTER INDEX IF EXISTS "CallProviderGrant_provider_room_expires_idx"
  RENAME TO "CallParticipantProviderGrantReceipt_providerRoomId_expiresAt_id";
