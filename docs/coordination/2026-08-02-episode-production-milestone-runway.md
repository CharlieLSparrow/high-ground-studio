# Episode production milestone runway

Date: 2026-08-02
Status: canonical local implementation and operated acceptance complete; production schema release and provider projection remain held

## Outcome

Episode Room now owns one revisioned production runway for research, recording,
source verification, editorial work, approval, and release. The same canonical
records appear on Nest Calendar and in a revocable podcast iCalendar feed.
Personal focus blocks remain separate, and a milestone mutation cannot silently
write Google Calendar or another provider.

This closes the local product gap between an episode's manuscript, recording,
watch receipts, and the dates required to carry it through production. It does
not claim a production migration, Google Calendar projection, or physical-iPhone
operation.

## Canonical model

Migration `20260802170000_add_episode_production_milestones` adds:

- `StudioEpisodeMilestone`, with one stable ID, typed production kind, exact
  timezone, optional explicit time window, assignment, dependency, lifecycle,
  and optimistic revision;
- `StudioEpisodeMilestoneRevision`, with an append-only operation identity,
  actor, immutable JSON snapshot, and unique milestone/revision pair; and
- database checks for positive revisions, valid time windows, nonempty
  timezones, and no direct self-dependency.

The service boundary runs create and update operations serializably and takes
an episode-scoped advisory lock before evaluating dependencies. It rejects
stale revisions, changed idempotency intent, cross-episode dependencies,
incomplete prerequisites, and dependency cycles.
Every accepted write appends a snapshot with
`externalCalendarMutated: false`.

The authenticated Nest route verifies project access before accepting JSON,
requires a request identity for every mutation, and returns non-enumerable
authorization failures. Google milestone projection remains explicitly held;
Calendar and iCalendar are read projections over Quipsly truth.

## Product surface

Episode Room renders the production runway above the manuscript and Watch
workspace. A producer can add or edit a typed milestone, assign an accessible
collaborator, link one prerequisite, and deliberately start, complete, reopen,
cancel, or restore it. Blocked completion is disabled with an explanation;
successful state changes state that no external calendar changed. Editing
preserves the milestone's explicit IANA timezone and wall clock, including
across browser-zone and daylight-saving changes.

Calendar projects accessible episode milestones with:

- local timezone and status;
- point-event versus explicit-window semantics;
- assignment and prerequisite context; and
- a direct return to the exact Episode Room.

The podcast-production feed uses the existing private capability boundary.
It includes scheduled podcast rooms and explicit episode milestones while
excluding private focus blocks, manuscripts, chat, transcript text, recordings,
participant addresses, and provider credentials. Point milestones are emitted
as transparent events.

## Operated High Ground Odyssey acceptance

The rendered local product was operated as a dedicated `.test` editor against
the canonical local PostgreSQL and Firebase Auth Emulator:

1. Created `Homer source upload verified` as a `SOURCE_UPLOAD_VERIFIED`
   milestone assigned to the editor in `America/Denver`.
2. Created dependent `Rough cut ready for review` as `ROUGH_CUT` and verified
   that completion was unavailable while the source milestone was incomplete.
3. Started and completed the source milestone, producing revisions 2 and 3.
4. Verified the dependent action became available, then started and completed
   the rough cut, also producing revisions 2 and 3.
5. Read both completed records in Calendar with the correct local times,
   transparent point-milestone language, prerequisite text, and exact Episode
   Room links.
6. Created one local revocable High Ground Odyssey podcast feed and fetched it
   through the real bearer route.

The feed returned HTTP 200 as `text/calendar`, exactly two `VEVENT` records,
stable Quipsly UIDs, `TRANSP:TRANSPARENT`, one-hour refresh hints, and unfolded
URLs back to the exact Episode Room. It contained no transcript or manuscript
payload. The only address-like values were the non-personal stable UIDs under
`calendar.quipsly.com`.

Independent PostgreSQL readback found exactly two milestones, both
`COMPLETED` at revision 3, with six revision rows total. Every snapshot retained
`externalCalendarMutated=false`. The active podcast feed stores only its token
digest, reports `rawTokenStored=false`, and recorded two generated events.

## Defect found by real operation

The first rendered read failed because the long-running local Nest process had
an older generated Prisma client and therefore no milestone delegate. Local
startup previously migrated the database without regenerating that client.
`quipsly-local-up.sh` now runs `pnpm db:generate` before migration and before
Nest starts, and the lifecycle contract enforces that order. Restarting through
the owned local lifecycle then rendered the real data successfully.

The full Jest run also exposed two pure Episode Room projection tests that
loaded Firebase Admin and its ESM `jose` dependency through `@/auth`. Those tests
now mock authentication at their server-unit boundary, matching the repository's
other isolated server tests.

A final source review found that milestone editing had formatted an existing
instant in the browser's timezone and then labeled it with that zone. The form
now carries the stored IANA zone explicitly, formats the stored wall clock in
that zone, and resolves edits through the shared DST-safe Temporal policy.

## Verification

- focused Episode Room, runway, route, service, Schedule, and feed tests:
  32/32;
- local lifecycle contract: 8/8;
- empty disposable PostgreSQL: all 41 migrations applied;
- real service integration: idempotent create, dependency denial and release,
  revision conflict, append-only snapshots, and no external mutation passed;
- Prisma migration-to-schema diff: `No difference detected`;
- complete Quipsly Jest run: 228 suites and 1,194 tests passed, with 36
  intentionally opt-in suites skipped;
- strict Quipsly TypeScript and Prisma validation: pass;
- optimized Next 16.2.7 webpack build: pass with the release 8 GB heap,
  including all 158 static pages and `/api/nests/[slug]/episode-milestones`;
- `git diff --check`: pass.

The default 4 GB local Node heap compiled successfully but exhausted memory in
Next's TypeScript worker. The bounded release configuration already uses 8 GB;
the same limit completed this validation without changing source configuration.

## Release and loop-back

No Cloud Build, Cloud Run revision, production migration, provider-calendar
write, invitation, message, delivery, publication, TestFlight build, or iPhone
mutation was created for this checkpoint. This respects the exact-image reuse
and spaced-release contract.

Before production use:

1. release the additive schema from one committed source and prove zero drift;
2. deploy that same source to a zero-traffic Nest preview and operate the
   authenticated Episode Room, Calendar, and feed before promotion;
3. retain the prior application revision as the rollback boundary;
4. add Google milestone projection only behind preview, field-level conflict
   review, idempotent receipts, and explicit human confirmation; and
5. repeat the runway with a second genuine High Ground Odyssey episode and a
   physical Capture recording so source-upload verification is backed by the
   actual device/media ledger.
