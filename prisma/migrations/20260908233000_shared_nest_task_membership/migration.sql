-- Bind the existing membership records to people; email remains the invitation
-- address. Never guess between conflicting historical identity records.
ALTER TABLE "StudioProjectAccessGrant" ADD COLUMN "memberUserId" TEXT;
ALTER TABLE "ActionItem" ADD COLUMN "isNestShared" BOOLEAN NOT NULL DEFAULT false;

WITH identities AS (
  SELECT lower(trim("primaryEmail")) AS email, id AS "userId" FROM "User"
  UNION
  SELECT lower(trim(email)), "userId" FROM "UserEmail"
), unambiguous AS (
  SELECT email, min("userId") AS "userId" FROM identities
  GROUP BY email HAVING count(DISTINCT "userId") = 1
)
UPDATE "StudioProjectAccessGrant" g SET "memberUserId" = i."userId"
FROM unambiguous i WHERE lower(trim(g.email)) = i.email;

-- Materialize only already-recognized workspace ownership into the existing
-- grant table. Do not reactivate or replace an existing grant.
WITH identities AS (
  SELECT lower(trim("primaryEmail")) AS email, id AS "userId" FROM "User"
  UNION
  SELECT lower(trim(email)), "userId" FROM "UserEmail"
), unambiguous AS (
  SELECT email, min("userId") AS "userId" FROM identities
  GROUP BY email HAVING count(DISTINCT "userId") = 1
)
INSERT INTO "StudioProjectAccessGrant"
  (id, "projectId", email, "memberUserId", role, status, "createdAt", "updatedAt")
SELECT 'nest-owner-' || md5(p.id || ':' || i."userId"), p.id, i.email,
  i."userId", 'OWNER', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudioProject" p JOIN "StudioWorkspace" w ON w.id = p."workspaceId"
JOIN unambiguous i ON i.email = lower(trim(w."ownerLabel"))
WHERE NOT EXISTS (
  SELECT 1 FROM "StudioProjectAccessGrant" g
  WHERE g."projectId" = p.id AND lower(trim(g.email)) = i.email
)
ON CONFLICT DO NOTHING;

CREATE INDEX "StudioProjectAccessGrant_memberUserId_status_projectId_idx"
  ON "StudioProjectAccessGrant"("memberUserId", status, "projectId");
ALTER TABLE "StudioProjectAccessGrant" ADD CONSTRAINT "StudioProjectAccessGrant_memberUserId_fkey"
  FOREIGN KEY ("memberUserId") REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
