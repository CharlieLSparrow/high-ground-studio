-- An output packet may now belong to the canonical Episode production rather
-- than relying on a mutable slug inside packet JSON.
ALTER TABLE "StudioOutputPacket"
ADD COLUMN "episodeProductionId" TEXT;

CREATE INDEX "StudioOutputPacket_episodeProductionId_kind_status_idx"
ON "StudioOutputPacket"("episodeProductionId", "kind", "status");

ALTER TABLE "StudioOutputPacket"
ADD CONSTRAINT "StudioOutputPacket_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Current Episode package selection is projected from this append-only ledger.
-- Withdrawal preserves the packet, encoded bytes, listening evidence, and any
-- publication attempts that may already reference the packet.
CREATE TYPE "StudioEpisodeOutputSelectionOperation" AS ENUM ('SELECT', 'WITHDRAW');

CREATE TABLE "StudioEpisodeOutputSelectionReceipt" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "episodeProductionId" TEXT NOT NULL,
  "outputPacketId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "operation" "StudioEpisodeOutputSelectionOperation" NOT NULL,
  "outputKind" TEXT NOT NULL,
  "packetDigestSha256" TEXT NOT NULL,
  "artifactSha256" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "reason" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StudioEpisodeOutputSelectionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudioEpisodeOutputSelection_project_actor_request_key"
ON "StudioEpisodeOutputSelectionReceipt"("projectId", "actorEmail", "clientRequestId");

CREATE INDEX "StudioEpisodeOutputSelection_episode_kind_time_idx"
ON "StudioEpisodeOutputSelectionReceipt"("episodeProductionId", "outputKind", "occurredAt");

CREATE INDEX "StudioEpisodeOutputSelection_packet_time_idx"
ON "StudioEpisodeOutputSelectionReceipt"("outputPacketId", "occurredAt");

ALTER TABLE "StudioEpisodeOutputSelectionReceipt"
ADD CONSTRAINT "StudioEpisodeOutputSelectionReceipt_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "StudioProject"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeOutputSelectionReceipt"
ADD CONSTRAINT "StudioEpisodeOutputSelectionReceipt_episodeProductionId_fkey"
FOREIGN KEY ("episodeProductionId") REFERENCES "StudioEpisodeProduction"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudioEpisodeOutputSelectionReceipt"
ADD CONSTRAINT "StudioEpisodeOutputSelectionReceipt_outputPacketId_fkey"
FOREIGN KEY ("outputPacketId") REFERENCES "StudioOutputPacket"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
