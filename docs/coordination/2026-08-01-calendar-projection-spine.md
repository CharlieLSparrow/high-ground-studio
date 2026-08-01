# Calendar projection spine delivery

Date: 2026-08-01

Status: implementation complete; isolated migration and rendered-operation
evidence pending

## Product outcome

Quipsly now has one calendar architecture rather than unrelated coaching,
episode, work-plan, Google, and iCalendar features. Coaching appointments,
podcast milestones, and personal commitments remain independent collections
over Quipsly-owned truth. Provider calendars are projections, and provider
effects are receipts.

The Schedule experience communicates three separate promises:

1. Coaching projects confirmed appointments and a Session-room link, never
   private notes, transcripts, goals, or action details.
2. Podcast production projects explicit recording, edit, review, and publish
   milestones, never manuscript or chat contents.
3. Personal planning remains useful without a provider; future busy-time reads
   will exclude private titles, attendees, and descriptions.

## Implemented boundary

- additive Prisma models and migration for connection, collection, projection,
  sync cursor, receipt, and hashed subscription-feed capability;
- exact-one-owner database checks for connection and collection scopes;
- authenticated, no-store calendar overview API;
- access filtered through the existing person and Nest authorization model;
- redacted client contract with no credential, token, external calendar ID,
  attendee, or raw provider-error fields;
- provider status derived from successful verification, not configuration;
- Schedule cards for each calendar purpose, its privacy boundary, fallback,
  current state, and latest safe receipt;
- focused tests for anonymous denial, authorized projection, failure redaction,
  managed-vs-personal Google separation, provider-effect truth, and existing
  Schedule persistence states.

## Deliberately not enabled

- no Google provider write was made;
- no attendee invitation was sent;
- no OAuth scope was requested;
- no iCalendar capability token was issued;
- no feed or provider identifiers are exposed to the browser;
- no calendar collection is silently created by a GET request;
- no production migration or deployment is part of this source checkpoint.

## Remaining release gates

1. Replay every committed migration into an isolated local PostgreSQL database
   twice and require zero schema drift.
2. Operate the rendered Schedule page with separate coaching, podcast, and
   personal states and retain a screenshot/readback.
3. Backfill legacy `CalendarEventLink` data through an idempotent, reversible
   operation with before/after counts.
4. Grant the deployed runtime identity edit access to the selected managed
   Google calendar, then pass read-only verification before enabling writes.
5. Implement explicit collection setup, narrow Google OAuth, hashed and
   revocable iCalendar subscriptions, reconciliation, and conflict review.
6. Prove create/reschedule/cancel against a real calendar with stable identity,
   timezone/DST handling, no duplicate, and append-only receipts.

## Verification recorded before commit

- Prisma format, validation, and client generation pass.
- Focused Jest suites pass 11/11, including the managed-vs-personal Google
  separation regression.
- Quipsly TypeScript passes.
- The complete active Quipsly Jest suite passes 199 suites / 1,003 tests, with
  34 suites / 100 tests explicitly skipped by their existing environment gates.
- The optimized Next.js 16.2.7 production build compiles all 151 routes,
  including `/schedule` and `/api/calendar/overview`.
