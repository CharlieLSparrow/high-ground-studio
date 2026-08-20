-- PostgreSQL truncates identifiers at 63 bytes. The original generated index
-- name lost Prisma's `_idx` suffix, so fresh migration chains reported drift.
-- Preserve the already-applied migration and repair the physical identifier in
-- an additive follow-up that is safe for both new and existing databases.
DO $$
BEGIN
  IF to_regclass('"CallRoomInvitationDeliveryReceipt_recipientEmail_status_created"') IS NOT NULL
    AND to_regclass('"CallRoomInvitationDeliveryReceipt_recipientEmail_status_cre_idx"') IS NULL
  THEN
    ALTER INDEX "CallRoomInvitationDeliveryReceipt_recipientEmail_status_created"
      RENAME TO "CallRoomInvitationDeliveryReceipt_recipientEmail_status_cre_idx";
  END IF;
END $$;
