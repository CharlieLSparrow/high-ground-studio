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

## Human conflict review

Schedule now exposes each unresolved provider-version conflict as a bounded,
canonical Session decision. The response includes the Session and selected
calendar lane, a safe reason, observation time, opaque conflict version, and
the intents the current actor may use. It never returns the Google event ID,
etag, event body, attendee list, or credential.

There are deliberately only two decisions:

- **Prepare Quipsly preview** is available only for an active projected event
  whose Google etag changed. It clears the local conflict to `PLANNED`, leaves
  Google unchanged, and places that exact Session and calendar lane into the
  existing preview-before-write surface. The later update remains a separate,
  explicit action using Google's stored etag as `If-Match`; a second provider
  edit therefore fails closed as another conflict.
- **Stop linking · leave Google unchanged** is available for every conflict.
  It changes the local projection to `REVOKED / NONE`, preserves provider
  identity/version evidence for audit, and excludes the projection from future
  reconciliation. It neither deletes nor updates the Google event.

Quipsly does not offer an “accept Google” decision because provider content is
intentionally outside the adapter. A person may inspect or edit the canonical
Session separately. Read-only collaborators can inspect a conflict but cannot
resolve it. Decisions are actor-owned, permission-rechecked inside a serializable
transaction, version-bound, idempotent, advisory-locked, and append a local-only
`VERIFY` receipt with `externalMutated=false`.

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
- provider-version review: local `PLANNED`, with an exact retry reusing the
  same receipt;
- provider cancellation review: unrelated connection owner denied, then local
  `REVOKED` with Google unchanged;
- a later provider read ignored the stopped projection;
- receipt count: eight across reconciliation and human review;
- plaintext cursor stored: false;
- provider event identity present in receipts: false;
- existing projection provenance preserved: true;
- provider calls performed: false; and
- cleanup: zero connections, cursors, receipts, Sessions, projects,
  workspaces, or people remained.

A rendered client-component journey supplied a connected/conflicted provider
response, operated **Prepare Quipsly preview**, and proved that an older Session
remains selected and reachable after the conflict list refreshes. The real
authenticated local Calendar page was also operated under a retained QA account;
because no Calendar OAuth configuration was present, it correctly rendered the
unconfigured boundary rather than manufacturing provider state.

No real Google account, event, or calendar was read or changed.

## Verification

- focused conflict review, reconciliation route, Session projection, and
  rendered UX coverage: 6 suites / 37 tests pass;
- complete Nest regression: 218 suites / 1,118 tests pass; 35 suites / 105
  tests remain explicitly skipped by existing repository contracts;
- strict Quipsly TypeScript: pass;
- shared iPhone/Nest source contract: 81/81 pass;
- operated PostgreSQL reconciliation and cleanup: pass;
- optimized Next.js production build: pass, with 157 static pages generated and
  both reconciliation and conflict-review routes collected;
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
