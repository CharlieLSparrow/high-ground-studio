CREATE TYPE "SessionConversationRevisionOperation" AS ENUM ('CREATED', 'EDITED', 'DELETED');

CREATE TABLE "SessionConversationMessage" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "authorUserId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "replyToId" TEXT,
  "body" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionConversationMessageRevision" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "operation" "SessionConversationRevisionOperation" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "bodyBefore" TEXT,
  "bodyAfter" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionConversationMessageRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionConversationReadCursor" (
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadMessageId" TEXT,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SessionConversationReadCursor_pkey" PRIMARY KEY ("roomId", "userId")
);

CREATE UNIQUE INDEX "SessionConversationMessage_author_request_key" ON "SessionConversationMessage"("authorUserId", "clientRequestId");
CREATE INDEX "SessionConversationMessage_room_time_idx" ON "SessionConversationMessage"("roomId", "createdAt", "id");
CREATE INDEX "SessionConversationMessage_reply_time_idx" ON "SessionConversationMessage"("replyToId", "createdAt");
CREATE UNIQUE INDEX "SessionConversationRevision_message_revision_key" ON "SessionConversationMessageRevision"("messageId", "revision");
CREATE INDEX "SessionConversationRevision_actor_time_idx" ON "SessionConversationMessageRevision"("actorUserId", "createdAt");
CREATE INDEX "SessionConversationReadCursor_user_time_idx" ON "SessionConversationReadCursor"("userId", "updatedAt");

ALTER TABLE "SessionConversationMessage" ADD CONSTRAINT "SessionConversationMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionConversationMessage" ADD CONSTRAINT "SessionConversationMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionConversationMessage" ADD CONSTRAINT "SessionConversationMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "SessionConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionConversationMessageRevision" ADD CONSTRAINT "SessionConversationRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SessionConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionConversationMessageRevision" ADD CONSTRAINT "SessionConversationRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionConversationReadCursor" ADD CONSTRAINT "SessionConversationReadCursor_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "CallRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionConversationReadCursor" ADD CONSTRAINT "SessionConversationReadCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
