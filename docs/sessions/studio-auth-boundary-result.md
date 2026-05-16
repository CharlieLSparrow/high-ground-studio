# Studio Auth Boundary Result

Date: 2026-05-16

## Summary

This pass added the first private access boundary for `apps/studio` without
changing Prisma schema, remote infrastructure, OAuth secrets, DNS, deployment,
editor complexity, embeddings, or public projections.

Studio is no longer just a public dev workbench. The route now requires a
signed-in Google account that resolves to a local `User` with one of the
existing trusted roles:

- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

## What Changed

- `apps/studio` now has its own NextAuth route and config.
- Studio sign-in uses the same env-backed Google OAuth settings as the web app.
- Studio identity provisioning resolves or creates canonical `User` records and
  bootstraps roles from the existing role env lists.
- The Studio page renders a sign-in screen when signed out.
- The Studio page renders an access-restricted screen when signed in without an
  approved role.
- The tag creation server action repeats the Studio role check before writing.
- Created `StudioTaggedSpan` and `StudioKnowledgeNode` rows now use the
  signed-in primary email as `createdByLabel`.

## Ownership Boundary

This is a first ownership boundary, not the final ownership model.

The durable Studio rows still do not have `createdByUserId`, `ownerUserId`, or
reviewer relations. That is intentional for this reversible pass. The current
database slice keeps label-based creator provenance while the route and server
action enforce that only approved signed-in humans can reach the private
workbench and create new tag applications.

## Database Mutation Status

No remote database mutation was performed.

Docker was not running in this environment, so the local Compose-backed
bootstrap path was skipped. No `db:push` was run.

The guarded smoke script was run against the current environment and refused
before opening a write path because `DATABASE_URL` did not point at a local
database host.

## Remaining Deferred Work

- explicit Studio roles such as editor, researcher, reviewer, or agent runner
- real `User` relations on Studio owner/creator/reviewer fields
- per-workspace or per-project permissions
- audit history for grants and Studio writes
- public projection approval gates
- richer editor, collaboration, search, embeddings, and ingestion workflows

## Next Recommended Slice

Add explicit Studio creator/owner/reviewer relations once the role names are
settled. That pass should be a Prisma design pass first, then a small schema
change, then local-only `db:push` and smoke validation against disposable
Postgres.
