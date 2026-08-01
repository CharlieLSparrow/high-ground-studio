# Google Calendar conflict review

Date: 2026-08-01
Status: production implementation complete locally; dedicated real-provider QA remains operator-gated

## Outcome

Quipsly's Google reconciliation no longer stops at a conflict count. Schedule
shows each affected canonical Session, explains the provider observation without
importing provider content, and offers the smallest safe human decisions:

1. prepare the current Quipsly Session for the existing preview-before-write
   flow when Google has a newer event version; or
2. stop projecting that Session while leaving the Google event unchanged.

Neither decision calls Google. There is no automatic winner and no content
merge masquerading as synchronization.

## Architecture and safety boundary

`GET /api/calendar/connections/google/conflicts` is private, no-store, and
requires the actor's own verified Google connection. It joins the projection to
canonical Session and collection context, filters Session visibility through
the shared access predicate, and independently computes mutation authority.
The client receives:

- canonical Session ID, title, purpose, status, schedule, timezone, and Nest;
- selected collection ID, label, and purpose;
- a bounded conflict reason and observation time;
- an opaque, cryptographic conflict version; and
- allowed local intents.

It never receives the provider event ID, etag, event content, calendar
credential, refresh token, or sync cursor.

`POST /api/calendar/connections/google/conflicts` uses the production conflict
review helper. The helper:

- proves connection ownership and verified state;
- takes a projection advisory lock in a serializable transaction;
- re-reads the exact conflict and verifies its opaque version;
- rechecks canonical Session mutation authority inside the transaction;
- validates the Session/collection Nest relationship;
- limits update preparation to etag/version conflicts on an active provider
  event and non-canceled Session;
- makes exact retries reuse the prior `VERIFY` receipt; and
- returns no provider identity or credential.

**Prepare Quipsly preview** changes only local projection state to
`PLANNED / NONE`. The UI retains even an older Session that is outside the
ordinary upcoming-session query and preselects its exact calendar lane. The
person must still inspect the public event snapshot and use the existing
explicit update action. That action is etag-conditional, so a new Google edit
cannot be overwritten silently.

**Stop linking** changes only local projection state to `REVOKED / NONE`.
Reconciliation excludes revoked projections and the preview builder treats them
as blocked. Provider identity/version evidence stays on the projection for
audit, while receipts continue to omit it.

## Operated proof

The disposable PostgreSQL operation used the exact production persistence and
conflict-review helpers. It proved:

- initial full synchronization and encrypted cursor persistence;
- incremental provider-version conflict;
- stale concurrent result rejection;
- version-bound local prepare and exact idempotent replay;
- provider cancellation conflict;
- denial for an actor who did not own the Google connection;
- local stop with `externalMutated=false`;
- exclusion of the stopped projection from a later provider observation;
- eight append-only, provider-identity-free receipts;
- preservation of existing projection metadata; and
- complete zero-row fixture cleanup.

The rendered component journey began with no upcoming Session choices, loaded
an older conflicted Podcast Session, operated **Prepare Quipsly preview**,
received the conflict-free refresh, and still showed the exact Session and
calendar selection ready for preview. This closes the reachability regression
that a count-only or refresh-only implementation would have left behind.

The authenticated local Calendar surface was operated with a retained QA
identity. Its lack of configured Calendar OAuth remained visible and no provider
state was fabricated. No Google account, calendar, or event was read or changed.

## Remaining real-provider acceptance

Use a dedicated QA Google calendar and a human-approved OAuth connection to:

1. project one test Session;
2. edit that event in Google and run **Check Google changes**;
3. prepare, inspect, and explicitly update from the Quipsly preview;
4. edit the provider event again before confirmation and verify conditional
   update rejection;
5. delete another provider event, then stop linking it in Quipsly; and
6. inspect Google, responses, database evidence, and logs for content, identity,
   credential, and cursor leakage.

That future operation is the real-provider acceptance gate. It is not required
to prove the local state machine, authorization, UX reachability, or no-provider-
mutation receipt boundary implemented here.

## Verification

- conflict/reconciliation/Session projection/rendered UX: 6 suites / 37 tests;
- complete Nest regression: 218 suites / 1,118 runnable tests passed, with 35
  suites / 105 tests explicitly opt-in and skipped;
- strict Quipsly TypeScript: pass;
- optimized production build: pass, 157 generated pages and the new API route;
- shared iPhone/Nest source contract: pass;
- Capture App Store static contract: 949/949;
- App Store Connect listing/readback operator contracts: 11/11; and
- `git diff --check`: pass.
