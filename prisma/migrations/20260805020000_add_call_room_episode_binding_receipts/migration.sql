-- Episode relationship repair is a user-visible canonical operation. Preserve
-- one append-only receipt for the exact actor, request, prior binding, chosen
-- episode, optimistic room version, and no-side-effect boundary.
CREATE TYPE "CallRoomEpisodeBindingAction" AS ENUM ('BIND', 'REBIND', 'NOOP');

CREATE TABLE "CallRoomEpisodeBindingReceipt" (
  "id" TEXT NOT NULL,
  "requestId" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "action" "CallRoomEpisodeBindingAction" NOT NULL,
  "previousEpisodeProductionId" TEXT,
  "previousEpisodeSlug" TEXT,
  "nextEpisodeProductionId" TEXT NOT NULL,
  "nextEpisodeSlug" TEXT NOT NULL,
  "reason" TEXT,
  "expectedRoomUpdatedAt" TIMESTAMP(3) NOT NULL,
  "roomUpdatedAtBefore" TIMESTAMP(3) NOT NULL,
  "roomUpdatedAtAfter" TIMESTAMP(3) NOT NULL,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CallRoomEpisodeBindingReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallRoomEpisodeBindingReceipt_requestId_key"
  ON "CallRoomEpisodeBindingReceipt"("requestId");
CREATE INDEX "CallRoomEpisodeBindingReceipt_roomId_createdAt_idx"
  ON "CallRoomEpisodeBindingReceipt"("roomId", "createdAt");
CREATE INDEX "CallRoomEpisodeBindingReceipt_projectId_createdAt_idx"
  ON "CallRoomEpisodeBindingReceipt"("projectId", "createdAt");
CREATE INDEX "CallRoomEpisodeBindingReceipt_actorUserId_createdAt_idx"
  ON "CallRoomEpisodeBindingReceipt"("actorUserId", "createdAt");

ALTER TABLE "CallRoomEpisodeBindingReceipt"
  ADD CONSTRAINT "CallRoomEpisodeBindingReceipt_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
