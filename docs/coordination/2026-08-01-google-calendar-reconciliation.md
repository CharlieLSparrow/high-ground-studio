# Privacy-safe Google Calendar reconciliation

Date: 2026-08-01
Status: implemented and operated locally; real-provider QA remains operator-gated

## Outcome

Quipsly can now check a deliberately selected Google calendar for changes to
Session projections without importing calendar content or changing Google. The
person explicitly presses **Check Google changes** on Schedule. Quipsly then
performs an initial full read or a persisted incremental read, advances an
encrypted cursor, and records conflict truth on the existing canonical
projection.

Quipsly Calendar remains source of truth. Reconciliation never overwrites a
Session, schedule, title, description, participant, recording, transcript,
note, goal, task, or tag from provider data.

## Provider read and privacy contract

Google's incremental synchronization contract requires clients to:

- complete every page of the initial full read before persisting the final
  `nextSyncToken`;
- replay the same query parameters with that token on later reads;
- consume returned deletions; and
- discard the expired provider cursor and perform a new full read after HTTP
  410. See [Synchronize resources efficiently](https://developers.google.com/workspace/calendar/api/guides/sync),
  [Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list),
  and [Handle API errors](https://developers.google.com/workspace/calendar/api/guides/errors).

The stable Quipsly query uses `showDeleted=true`, `singleEvents=false`, a
bounded 2,500-item page size, and this partial response only:

`items(id,etag,status,updated,extendedProperties/private),nextPageToken,nextSyncToken`

The adapter parses only provider identity, version, status, update time, and
Quipsly-owned private linkage fields. It neither requests nor parses summary,
description, location, attendees, conference data, attachments, reminders, or
other provider content. This is deliberately a collection-wide identity read:
Google does not allow `syncToken` to be combined with time, text, or extended
property filters. Unlinked event identities are counted and discarded without
escaping the adapter, response, or receipt.

The cursor uses AES-256-GCM with a distinct `sync-v1` envelope and associated
data `quipsly-google-calendar-sync-token-v1`. It cannot be swapped with the
refresh-token ciphertext. Neither plaintext cursor nor encrypted cursor is
returned by the connection API; the UI receives only last-full and
last-incremental check timestamps.

## Reconciliation truth

Provider observations produce these internal outcomes:

- same identity and etag: no projection write;
- changed etag: `CONFLICT / EXTERNAL_CHANGED`;
- provider `cancelled` while Quipsly remains active: `MISSING /
  EXTERNAL_CHANGED`;
- provider `cancelled` after Quipsly recorded cancellation: verified
  `CANCELED / NONE`;
- active provider event after Quipsly cancellation: restored-event conflict;
- Quipsly private linkage does not match the canonical projection: identity
  conflict; and
- a full read does not contain a stored active projection: missing-event
  conflict.

Incremental absence never implies deletion; only a returned tombstone does.
On 410, Quipsly discards the provider-derived cursor and obtains a fresh full
snapshot. It preserves canonical Sessions and projections, marking discrepancies
for human review rather than deleting either side.

## Authority, concurrency, and receipts

The route authenticates the actor and proves that the Google connection is
verified and owned by that actor before decrypting credentials. A Nest-owned
production calendar requires current OWNER or EDITOR authority before any
provider request. The exact same team-write policy is re-evaluated inside the
serializable persistence transaction after its collection advisory lock. A
mid-read grant revocation therefore allows the already-started provider read
to finish but cannot advance shared Quipsly state.

The transaction re-reads the selected collection, connection status, cursor,
and projections. A result based on a cursor another request has already
advanced is returned as superseded with HTTP 409. It creates no cursor,
projection, or receipt write. Retrying begins from the newer cursor, so
concurrency cannot duplicate an external effect; reconciliation performs no
external mutation at all.

Append-only `READ_EVENT`, `FULL_SYNC`, and `INCREMENTAL_SYNC` receipts retain
digests and safe counts—not event identities, event content, tokens, or
credentials. Existing projection metadata is preserved.

## Operated evidence

`scripts/quipsly-local-calendar-reconciliation-dogfood.mjs` invoked the exact
production persistence helper against loopback PostgreSQL with disposable
owner/editor identities, an active Nest editor grant, a planned Podcast
Session, a verified credential-free Google connection, a team collection, and
one projected event.

Observed readback:

- initial two-page full result: zero conflicts and an encrypted cursor;
- incremental provider etag change: exactly one conflict;
- stale concurrent retry: superseded with no extra receipt;
- durable projection: `CONFLICT / EXTERNAL_CHANGED` with new provider etag;
- receipt count: three (full, event conflict, incremental);
- plaintext cursor stored: false;
- provider event identity present in receipts: false;
- existing projection provenance preserved: true;
- provider calls performed: false; and
- cleanup: zero connections, cursors, receipts, Sessions, projects,
  workspaces, or people remained.

No real Google account, event, or calendar was read or changed.

## Verification

- focused OAuth, reconciliation, connection, Session projection, and shared
  project-access coverage: 7 suites / 49 tests pass;
- complete Nest regression: 215 suites / 1,106 tests pass; 35 suites / 105
  tests remain explicitly skipped by existing repository contracts;
- strict Quipsly TypeScript: pass;
- shared iPhone/Nest source contract: 81/81 pass;
- operated PostgreSQL reconciliation and cleanup: pass;
- optimized Next.js production build: pass, with 156 static pages generated and
  the reconciliation route collected;
- Capture App Store static contract: 949/949 pass; and
- App Store Connect operator/readback contracts: 11/11 pass.

## Next provider acceptance

Use a dedicated QA calendar after the separate Calendar OAuth client is
verified:

1. connect through real human consent and perform an initial full read;
2. create a Quipsly Session projection, edit it in Google, and observe an etag
   conflict without overwriting either side;
3. delete it in Google and observe a tombstone/missing conflict;
4. force or simulate an expired cursor and verify the 410 full-resync path;
5. run two checks concurrently and verify one durable cursor advance; and
6. inspect provider, database, response, and logs for content/token leakage.

Push notifications are deliberately deferred. Google's notification payload
contains no changed event body and channels expire, so a future webhook should
be a verified, renewable wake-up for this same reconciliation path—not a
second sync implementation. See [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push).
