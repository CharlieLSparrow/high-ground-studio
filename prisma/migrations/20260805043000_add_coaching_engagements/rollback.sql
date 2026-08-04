-- Emergency rollback for the additive Coaching Engagement boundary. It drops
-- only the new projections and relations; historical bookings, Sessions,
-- tasks, goals, notes, recordings, and transcript evidence remain untouched.
ALTER TABLE "Goal" DROP CONSTRAINT IF EXISTS "Goal_engagementId_fkey";
ALTER TABLE "ActionItem" DROP CONSTRAINT IF EXISTS "ActionItem_engagementId_fkey";
ALTER TABLE "CallRoom" DROP CONSTRAINT IF EXISTS "CallRoom_coachingEngagementId_fkey";
ALTER TABLE "CoachingBooking" DROP CONSTRAINT IF EXISTS "CoachingBooking_engagementId_fkey";
ALTER TABLE "Goal" DROP COLUMN IF EXISTS "engagementId";
ALTER TABLE "ActionItem" DROP COLUMN IF EXISTS "engagementId";
ALTER TABLE "CallRoom" DROP COLUMN IF EXISTS "coachingEngagementId";
ALTER TABLE "CoachingBooking" DROP COLUMN IF EXISTS "engagementId";
DROP TABLE IF EXISTS "CoachingEngagementMember";
DROP TABLE IF EXISTS "CoachingEngagement";
DROP TYPE IF EXISTS "CoachingEngagementMemberStatus";
DROP TYPE IF EXISTS "CoachingEngagementMemberRole";
DROP TYPE IF EXISTS "CoachingEngagementStatus";
