-- Session chat has one write store across Capture and Nest. Historical labels
-- remain labels: only an unambiguous account match receives author privileges.
ALTER TABLE "SessionConversationMessage" ALTER COLUMN "authorUserId" DROP NOT NULL;
ALTER TABLE "SessionConversationMessage"
  ADD COLUMN "authorNameSnapshot" TEXT,
  ADD COLUMN "authorEmailSnapshot" TEXT,
  ADD COLUMN "gifUrl" TEXT;

INSERT INTO "SessionConversationMessage"
  ("id", "roomId", "authorUserId", "authorNameSnapshot", "authorEmailSnapshot",
   "clientRequestId", "body", "gifUrl", "revision", "createdAt", "updatedAt")
SELECT m."id", r."id", actor.id, m."authorName", m."authorEmail",
       'legacy-nest-chat:' || m."id", m."body", m."gifUrl", 1, m."createdAt", m."updatedAt"
FROM "StudioNestChatMessage" m
JOIN "StudioNestChatThread" t ON t."id" = m."threadId" AND t."projectId" = m."projectId"
JOIN "CallRoom" r ON t."key" = 'session:' || r."id" AND r."projectId" = t."projectId"
LEFT JOIN LATERAL (
  SELECT CASE WHEN count(*) = 1 THEN min(u."id") END AS id
  FROM "User" u
  WHERE lower(trim(u."primaryEmail")) = lower(trim(m."authorEmail"))
    AND trim(coalesce(m."authorEmail", '')) <> ''
) actor ON true
ON CONFLICT ("id") DO NOTHING;

-- Keep the legacy rows as migration provenance. Application session reads and
-- writes no longer use them; other kinds of Nest thread are unchanged.
