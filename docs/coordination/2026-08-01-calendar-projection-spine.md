# Calendar projection spine delivery

Date: 2026-08-01

Status: implementation and local acceptance complete; provider delivery and
production release pending

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

1. Backfill legacy `CalendarEventLink` data through an idempotent, reversible
   operation with before/after counts.
2. Grant the deployed runtime identity edit access to the selected managed
   Google calendar, then pass read-only verification before enabling writes.
3. Implement explicit collection setup, narrow Google OAuth, hashed and
   revocable iCalendar subscriptions, reconciliation, and conflict review.
4. Prove create/reschedule/cancel against a real calendar with stable identity,
   timezone/DST handling, no duplicate, and append-only receipts.

## Verification record

- Prisma format, validation, and client generation pass.
- Focused Jest suites pass 11/11, including the managed-vs-personal Google
  separation regression.
- Quipsly TypeScript passes.
- The complete active Quipsly Jest suite passes 199 suites / 1,003 tests, with
  34 suites / 100 tests explicitly skipped by their existing environment gates.
- The optimized Next.js 16.2.7 production build compiles all 151 routes,
  including `/schedule` and `/api/calendar/overview`.
- Exact implementation source `64294dc2a7162b757fed0bb91e0fddac35c9bc30`
  replayed all 34 migrations from an empty disposable PostgreSQL database. A
  second deploy was idempotent, Prisma reported zero schema difference, the
  transcript fixture contract remained verified, and the exact disposable
  database was removed after success.
- The same source migration was applied to the loopback development database.
  The retained Keychain-backed `.test` media operator signed in through the
  rendered login and opened Schedule. Desktop and `390x844` phone-width checks
  proved all three purpose cards, the explicit external-write hold, no
  horizontal overflow, no browser exception, no server failure, and a clean
  session clear.
- The rendered operation independently read six calendar tables and both
  exact-one-owner constraints, then called the authenticated overview API and
  proved `private, no-store`, identity-sensitive `Vary`, three exact purposes,
  `providerSecretsExposed=false`, and no credential, provider calendar ID,
  sync/feed token, scope, or attendee field.
- Private mode-`0600` receipt and screenshots are retained at
  `/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/calendar-projection-spine-64294dc2-e/`.
  The operation performed no database mutation beyond the already-deployed
  additive migration, no provider write, no invitation, and no external side
  effect.
