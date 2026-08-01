-- Organization-managed calendars belong to the Quipsly workspace, not to an
-- arbitrary person or Nest. Retain exact-one-owner enforcement across all
-- three supported scopes.

ALTER TABLE "CalendarConnection" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CalendarCollection" ADD COLUMN "workspaceId" TEXT;

ALTER TABLE "CalendarConnection" DROP CONSTRAINT "CalendarConnection_scope_exactly_one";
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_scope_exactly_one"
CHECK (
  (CASE WHEN "workspaceId" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "nestId" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "userId" IS NULL THEN 0 ELSE 1 END)
  = 1
);

ALTER TABLE "CalendarCollection" DROP CONSTRAINT "CalendarCollection_scope_exactly_one";
ALTER TABLE "CalendarCollection" ADD CONSTRAINT "CalendarCollection_scope_exactly_one"
CHECK (
  (CASE WHEN "workspaceId" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "nestId" IS NULL THEN 0 ELSE 1 END)
  + (CASE WHEN "ownerUserId" IS NULL THEN 0 ELSE 1 END)
  = 1
);

CREATE INDEX "CalendarConnection_workspaceId_provider_status_idx"
ON "CalendarConnection"("workspaceId", "provider", "status");

CREATE INDEX "CalendarCollection_workspaceId_purpose_status_idx"
ON "CalendarCollection"("workspaceId", "purpose", "status");

ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "StudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarCollection" ADD CONSTRAINT "CalendarCollection_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "StudioWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
