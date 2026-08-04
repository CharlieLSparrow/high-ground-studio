-- Emergency rollback preserves engagement membership itself while removing the
-- new invitation capability and governance history. Export receipts first if
-- they are needed for a compliance record.
ALTER TABLE "CoachingEngagementMemberReceipt" DROP CONSTRAINT IF EXISTS "CoachingEngagementMemberReceipt_actorUserId_fkey";
ALTER TABLE "CoachingEngagementMemberReceipt" DROP CONSTRAINT IF EXISTS "CoachingEngagementMemberReceipt_subjectUserId_fkey";
ALTER TABLE "CoachingEngagementMemberReceipt" DROP CONSTRAINT IF EXISTS "CoachingEngagementMemberReceipt_invitationId_fkey";
ALTER TABLE "CoachingEngagementMemberReceipt" DROP CONSTRAINT IF EXISTS "CoachingEngagementMemberReceipt_memberId_fkey";
ALTER TABLE "CoachingEngagementMemberReceipt" DROP CONSTRAINT IF EXISTS "CoachingEngagementMemberReceipt_engagementId_fkey";
ALTER TABLE "CoachingEngagementInvitation" DROP CONSTRAINT IF EXISTS "CoachingEngagementInvitation_acceptedByUserId_fkey";
ALTER TABLE "CoachingEngagementInvitation" DROP CONSTRAINT IF EXISTS "CoachingEngagementInvitation_invitedByUserId_fkey";
ALTER TABLE "CoachingEngagementInvitation" DROP CONSTRAINT IF EXISTS "CoachingEngagementInvitation_invitedUserId_fkey";
ALTER TABLE "CoachingEngagementInvitation" DROP CONSTRAINT IF EXISTS "CoachingEngagementInvitation_engagementId_fkey";
ALTER TABLE "CoachingEngagementMember" DROP CONSTRAINT IF EXISTS "CoachingEngagementMember_accessChangedByUserId_fkey";
DROP TABLE IF EXISTS "CoachingEngagementMemberReceipt";
DROP TABLE IF EXISTS "CoachingEngagementInvitation";
ALTER TABLE "CoachingEngagementMember" DROP COLUMN IF EXISTS "accessRevision";
ALTER TABLE "CoachingEngagementMember" DROP COLUMN IF EXISTS "accessChangedAt";
ALTER TABLE "CoachingEngagementMember" DROP COLUMN IF EXISTS "accessChangedByUserId";
DROP TYPE IF EXISTS "CoachingEngagementInvitationStatus";
DROP TYPE IF EXISTS "CoachingEngagementMemberAction";
