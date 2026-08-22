CREATE TABLE "CallRecordingDirective" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "roomId" TEXT NOT NULL,
  "captureGroupId" UUID NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorParticipantId" TEXT,
  "action" TEXT NOT NULL,
  "allPartyConsentVersion" TEXT,
  "requestSha256" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL,
  "metadataJson" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallRecordingDirective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallRecordingEndpointReceipt" (
  "id" UUID NOT NULL,
  "directiveId" UUID NOT NULL,
  "roomId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "clientInstanceId" TEXT NOT NULL,
  "clientKind" TEXT NOT NULL,
  "deviceLabel" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "captureId" UUID,
  "detail" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "evidenceJson" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "CallRecordingEndpointReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallRecordingDirective_requestId_key" ON "CallRecordingDirective"("requestId");
CREATE UNIQUE INDEX "CallRecordingDirective_sequence_key" ON "CallRecordingDirective"("sequence");
CREATE INDEX "CallRecordingDirective_roomId_sequence_idx" ON "CallRecordingDirective"("roomId", "sequence");
CREATE INDEX "CallRecordingDirective_roomId_action_createdAt_idx" ON "CallRecordingDirective"("roomId", "action", "createdAt");
CREATE INDEX "CallRecordingDirective_actorUserId_createdAt_idx" ON "CallRecordingDirective"("actorUserId", "createdAt");
CREATE INDEX "CallRecordingEndpointReceipt_directiveId_receivedAt_idx" ON "CallRecordingEndpointReceipt"("directiveId", "receivedAt");
CREATE INDEX "CallRecordingEndpointReceipt_roomId_participantId_receivedAt_idx" ON "CallRecordingEndpointReceipt"("roomId", "participantId", "receivedAt");
CREATE INDEX "CallRecordingEndpointReceipt_roomId_clientInstanceId_receivedAt_idx" ON "CallRecordingEndpointReceipt"("roomId", "clientInstanceId", "receivedAt");
CREATE INDEX "CallRecordingEndpointReceipt_captureId_receivedAt_idx" ON "CallRecordingEndpointReceipt"("captureId", "receivedAt");

ALTER TABLE "CallRecordingDirective" ADD CONSTRAINT "CallRecordingDirective_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRecordingEndpointReceipt" ADD CONSTRAINT "CallRecordingEndpointReceipt_directiveId_fkey" FOREIGN KEY ("directiveId") REFERENCES "CallRecordingDirective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallRecordingEndpointReceipt" ADD CONSTRAINT "CallRecordingEndpointReceipt_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
