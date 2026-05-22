# Database Migrations

## Current Repo Reality
This repo uses Prisma 7 and generates the Prisma client directly from `prisma/schema.prisma`.

Current root scripts:

```bash
pnpm db:generate   # prisma generate
pnpm db:push       # prisma db push
pnpm db:migrate    # prisma migrate dev
```

### What exists today
- Prisma schema file:
  - `prisma/schema.prisma`
- Prisma config:
  - `prisma.config.ts`
- Prisma client generation:
  - root `postinstall`
  - `pnpm db:generate`

### What does not exist today
- No checked-in `prisma/migrations/` history exists in the repo at this time.
- That means the repo is **not currently operating as a committed-migrations-first Prisma project**.

## What This Means Operationally
For schema changes like the coaching request intake work, the safe current workflow is:

1. update `prisma/schema.prisma`
2. generate Prisma client locally
3. validate the app build
4. apply the schema change to the target database explicitly

Because there is no checked-in migration history, do **not** assume production will pick up schema changes just because app code was deployed.

## Coaching Request Change
The coaching request intake feature added:
- `ContactPreference` enum
- `CoachingRequestStatus` enum
- `CoachingRequest` model
- `User` relations for coaching requests
- optional `Appointment` back-reference for future conversion

App code now expects the database to contain the new `CoachingRequest` table and related enum types.

If production does not have the schema update, the new `/coaching` form submit path and `/team/coaching-requests` queue can fail at runtime when Prisma touches the missing table.

## Local Development Flow
From repo root:

```bash
pnpm db:generate
pnpm db:push
pnpm --filter web build
```

Use this when your local database needs to match the current schema.

## If You Decide To Start Using Real Prisma Migrations Later
This repo has a `db:migrate` script:

```bash
pnpm db:migrate
```

That currently maps to:

```bash
prisma migrate dev
```

Use that only if you are intentionally switching the repo toward committed Prisma migrations and are prepared to add `prisma/migrations/...` to version control.

For the coaching request rollout documented here, no migration file was created because the repo does not currently maintain checked-in migration history.

## Production Apply Strategy For The CoachingRequest Change
### Recommended current command
Run this against the production database before or during deployment of the coaching request feature:

```bash
pnpm db:push
```

That command requires `DATABASE_URL` to point at the production database.

### Example operator pattern
From a shell or deployment environment with the correct production `DATABASE_URL`:

```bash
pnpm db:generate
pnpm db:push
pnpm --filter web build
```

If the deployment environment already runs install hooks, Prisma client generation may already happen via `postinstall`, but running `pnpm db:generate` explicitly is still the cleanest manual verification step.

## How To Verify The CoachingRequest Table Exists
Any one of these is acceptable.

### Prisma Studio
```bash
pnpm db:studio
```
Then confirm `CoachingRequest` appears in the model list.

### SQL verification
If you have direct SQL access, verify the table exists:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'CoachingRequest';
```

Expected result:
- one row for `CoachingRequest`

You can also verify the new enums exist:

```sql
select typname
from pg_type
where typname in ('ContactPreference', 'CoachingRequestStatus');
```

## Production Rollback Caution
Because this repo does not currently carry checked-in migration history, rollback is not a tidy “run the down migration” story.

That means:
- do not casually apply schema changes to production without knowing which app version is live
- do not drop the new table as a first reflex if app behavior changes
- prefer rolling app code forward with compatible schema rather than trying to improvise destructive rollback SQL under pressure

In practice:
- the `CoachingRequest` addition is additive and low-risk
- additive schema changes are safer than destructive ones
- keep them additive while the workflow stabilizes

## What Not To Do
- Do **not** use fake `Appointment` rows with invented dates to represent unscheduled coaching interest.
- Do **not** assume deploy-only means schema-ready.
- Do **not** introduce ad hoc production SQL that diverges from `prisma/schema.prisma` unless you are explicitly repairing drift.
- Do **not** treat `db push` as a substitute for a real migration history forever; it is the repo’s current reality, not its ideal final form.

## Live Story Drafts Change
The Live Story Drafts Phase 1 rollout added:

- `StoryDraftStatus` enum
- `StoryDraft` model
- `User` relations for created, updated, and reviewed Story Drafts

App code now expects the database to contain the `StoryDraft` table and `StoryDraftStatus` enum.

Because the repo still has no checked-in Prisma migration history, `prisma migrate dev --name live_story_drafts` detected drift against the existing database and asked to reset the public schema. That reset was not run.

The current repo-documented apply command remains:

```bash
pnpm db:push
```

Run it only in an environment where `DATABASE_URL` points at the intended target database.

### How To Verify The StoryDraft Table Exists

SQL verification:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'StoryDraft';
```

Expected result:

- one row for `StoryDraft`

Enum verification:

```sql
select typname
from pg_type
where typname = 'StoryDraftStatus';
```

## Studio Persistence Slice Change
The Studio persistence slice added private authoring tables:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`
- `StudioTag`
- `StudioTaggedSpan`
- `StudioKnowledgeNode`

It also added these Studio-only enums:

- `StudioProjectionStatus`
- `StudioTagCategory`
- `StudioKnowledgeNodeType`

These tables are private Studio authoring state. Public routes should not read
from them directly. Future public output should come through approved projection
tables or checked-in public content.

The development seed helper writes only when `DATABASE_URL` points at a local
database and `NODE_ENV` is not `production`. It should not be treated as a
production seeding path.

The Studio Writing Desk block-management slice later added archive metadata to
`StudioDocumentBlock`:

- `archivedAt`
- `archivedByLabel`

Those fields support private draft block archive behavior. They are not public
content publication controls or public projection state and should not be
interpreted as manuscript deletion.

If a target environment should run the Studio persistence slice, apply the
schema deliberately:

```bash
pnpm db:generate
pnpm db:push
```

Do not run `pnpm db:push` against remote Neon or production data unless that
target has been explicitly confirmed safe.

SQL verification:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'StudioWorkspace',
    'StudioProject',
    'StudioDocument',
    'StudioDocumentBlock',
    'StudioTag',
    'StudioTaggedSpan',
    'StudioKnowledgeNode'
  );
```

Expected result:

- one row for each Studio table above

## Studio Manuscript Library Change

The Studio Manuscript Library MVP added:

- `StudioManuscriptKind` enum
- `StudioManuscript` model
- optional `StudioManuscriptSnapshot.manuscriptId`
- relation from `StudioManuscriptSnapshot` to `StudioManuscript`
- indexes for owner/manuscript snapshot lookup

This is an additive private Studio schema change. Existing snapshots with a
null `manuscriptId` remain valid legacy/orphan snapshots.

As with the earlier Studio persistence changes, this repo still has no
checked-in Prisma migration history. Apply the schema to a target database only
through the approved operator path for that environment:

```bash
pnpm db:generate
pnpm db:push
```

Do not run this as part of ordinary local UI smoke testing unless the database
target and rollback path are deliberate.

SQL verification:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'StudioManuscript',
    'StudioManuscriptSnapshot'
  );
```

Expected result:

- one row for each Studio manuscript table above

Enum verification:

```sql
select typname
from pg_type
where typname = 'StudioManuscriptKind';
```

## Exact Command For This CoachingRequest Rollout
If production has not yet received the schema change, the next manual operator command should be:

```bash
pnpm db:push
```

Run it in an environment where `DATABASE_URL` points at the production database that backs `highgroundodyssey.com`.
