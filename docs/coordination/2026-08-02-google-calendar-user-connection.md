# Google Calendar user connection — production architecture and first slice

Date: 2026-08-02
Status: implemented locally; provider registration and Google OAuth verification remain operator gates

## Outcome

Quipsly now has a dedicated user-initiated Google Calendar connection boundary.
It is intentionally separate from:

- Firebase/Google sign-in, which proves identity only;
- the organization-managed coaching calendar adapter;
- revocable read-only iCalendar subscriptions; and
- future Apple EventKit device access.

Connecting Google does not create, update, delete, import, or invite anything.
After consent, a person must explicitly bind one owned Google calendar to one
Quipsly lane. Event projection remains held until each write workflow has its
own canonical source revision, preview, idempotency contract, conflict policy,
and append-only effect receipt.

## User experience

`/schedule` now explains the three calendar boundaries in ordinary language:

1. **Quipsly Calendar** remains source of truth for Sessions, accepted work,
   production milestones, and focus plans.
2. **Read-only subscriptions** let Apple Calendar, Google Calendar, or Outlook
   display a revocable projection without account access.
3. **Google Calendar connection** is optional two-way authorization for a
   calendar the person owns and deliberately selects.

The connection surface:

- explains that Google sign-in and Calendar access are different;
- requests permission only after the user presses Connect;
- lists owned calendars only;
- requires an explicit Coaching, Podcast Production, or My Commitments lane;
- requires an accessible Nest for a production selection;
- truthfully says that selection performs no provider write;
- shows verified selections without exposing tokens or credential references;
- supports refresh and an explicit, confirmed disconnect.

## Authorization contract

Requested scopes are limited to:

- `calendar.calendarlist.readonly`, to list subscribed calendars; and
- `calendar.events.owned`, to manage events only on calendars the person owns.

Google recommends choosing the narrowest scope that supports the feature.
The scope descriptions are documented in [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth).

The web-server flow uses:

- `access_type=offline` for a refresh token;
- incremental authorization;
- explicit consent in the feature context;
- a cryptographically random `state` value bound to the signed-in Quipsly user;
- PKCE S256;
- a ten-minute, HttpOnly, Secure, SameSite=Lax verifier cookie scoped only to
  the callback route; and
- an exact callback URI derived from the canonical Quipsly origin.

These decisions follow Google's [OAuth web-server guidance](https://developers.google.com/identity/protocols/oauth2/web-server) and [OAuth security best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices).

The callback rejects:

- missing, malformed, tampered, expired, replayed, or cross-user state;
- missing durable refresh access;
- partially denied Calendar scopes;
- accounts without an owned primary calendar; and
- a Google provider account already bound to another Quipsly user.

## Credential lifecycle

Quipsly never persists Google access tokens. The refresh token is encrypted
with AES-256-GCM before the database write. The database stores:

- authenticated ciphertext in `CalendarOAuthCredential`;
- a non-secret credential reference on `CalendarConnection`;
- the granted scope list;
- a digest-derived provider account key rather than using the provider email as
  the unique database key; and
- safe account/calendar labels only for private UI.

The encryption key, OAuth client secret, and state-signing secret must be
mounted from Secret Manager. They must never use a `NEXT_PUBLIC_*` variable.
Google explicitly requires secure token-at-rest handling, revocation, and
deletion when access is no longer needed.

Disconnect first asks Google to revoke the grant. A provider response that the
token is already invalid is treated as successful revocation truth. Quipsly
then deletes the encrypted credential, marks the connection and selections
revoked, and appends a receipt. Unexpected provider failures fail closed and
do not pretend local cleanup completed.

## Persistence and authorization

The additive migration creates `CalendarOAuthCredential` with a unique,
cascade-owned relation to `CalendarConnection`. Existing exact-one-owner
constraints remain intact.

A Google account connection is user-owned. A selected collection is:

- user-owned and private for Coaching or My Commitments; or
- Nest-owned and team-visible for Podcast Production, but only after the
  signed-in actor's current OWNER or EDITOR authority is proven before any
  Google request. VIEWER access remains read-only and cannot select or replace
  the shared production-calendar lane.

Provider calendar IDs are accepted only after a fresh provider read confirms
the calendar still exists and the actor has the `owner` role. Request bodies
cannot smuggle an arbitrary calendar ID or inaccessible Nest into persistence.

## Release configuration

Google does not permit OAuth clients to be created or modified
programmatically. Google also documents that revoking one token removes every
OAuth grant for every client in the same Cloud project ([Google token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)). The Calendar OAuth
client therefore **must not** live in `quipsly-reef`, where it could make
Disconnect Calendar disrupt Firebase Google sign-in.

Create a dedicated Calendar integrations Google Cloud project under the same
Quipsly organization and administrator account. This keeps ownership and
billing governance together while isolating OAuth consent, verification,
credentials, quotas, and revocation blast radius. In that project, an operator
must:

1. enable Google Calendar API;
2. configure the OAuth consent screen and User Data Policy acknowledgement;
3. create a dedicated **Web application** OAuth client for Quipsly Calendar;
4. add exact redirect URIs:
   - `https://nest.quipsly.com/api/calendar/connections/google/callback`
   - `http://127.0.0.1:3012/api/calendar/connections/google/callback`
5. add the two Calendar scopes and complete Google's production OAuth
   verification before general availability.

Configure these private environment values:

- `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`
- `GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET`
- `GOOGLE_CALENDAR_OAUTH_STATE_SECRET` (at least 32 random bytes)
- `GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY` (exactly 32 random bytes,
  base64url encoded)
- `GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT` (the dedicated Scheduler
  identity)
- `GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE` (the exact Cloud Run `run.app` service
  URL, without a path)

The secret seeder maps them to dedicated `quipsly-google-calendar-oauth-*`
Secret Manager resources. The preview deploy mounts them only when
`ENABLE_GOOGLE_CALENDAR_OAUTH=1`; enabling the feature fails closed unless all
four secrets have an enabled version. The two push-worker values are
non-secret identity bindings. The deploy helper derives the audience from the
deployed service, and the separate scheduler activation helper creates an OIDC
job without embedding a bearer secret.

```bash
pnpm quipsly:calendar:push-scheduler:test
pnpm quipsly:calendar:push-scheduler
```

## iPhone connection continuity (August 3, 2026)

Quipsly Capture now makes the managed Google projection reachable from Today
without pretending Google Calendar is the canonical scheduler and without
requesting EventKit read access:

- the existing authenticated connection route accepts `?view=summary` and
  returns only the actor's stored connection label/status, explicit lane
  selections, reconciliation timestamps, and live-update state;
- the summary query does not select the encrypted OAuth credential or provider
  calendar ID, decrypt a token, refresh a token, or contact Google;
- Capture loads that summary with its Firebase bearer credential alongside its
  revocable iCalendar subscriptions;
- the phone distinguishes optional managed Google projections from private,
  read-only subscription URLs and reiterates that Quipsly owns scheduling
  truth;
- connection and lane changes open the Nest Schedule surface in the external
  browser. Google consent is never embedded in a web view;
- when Capture returns to the foreground, it refreshes the credential-free
  summary so a completed browser flow appears without relaunching the app;
- deterministic preview mode exposes the UX but cannot open the external OAuth
  flow or create, rotate, or revoke a private subscription.

This is intentionally a status-and-handoff surface. The phone never receives a
Google access token, refresh token, client secret, provider calendar ID, or
calendar event body.

### Live activation audit

The dedicated project now exists as `quipsly-calendar-integrations` under the
Quipsly organization. The production deploy project `high-ground-odyssey`
currently has enabled state-signing and token-encryption secrets, but it does
not yet have the dedicated Calendar OAuth client ID/client secret, and the
deployed `studio` service does not mount any `GOOGLE_CALENDAR_OAUTH_*` values.
The existing `GOOGLE_CALENDAR_ID` deployment belongs to the older service
calendar path and is not a substitute for user consent.

The remaining activation is therefore a deliberate one-time operator gate:

1. finish Google account re-verification on the OAuth Clients page for
   `quipsly-calendar-integrations`;
2. create a **Web application** client named `Quipsly Calendar` with the two
   exact callback URLs listed above;
3. store its ID and secret as enabled versions of
   `quipsly-google-calendar-oauth-client-id` and
   `quipsly-google-calendar-oauth-client-secret` in `high-ground-odyssey`;
4. use the bounded preview release with `ENABLE_GOOGLE_CALENDAR_OAUTH=1`, prove
   one real QA account's connect/select/reconcile/disconnect lifecycle, then
   promote that exact image only if the contract passes.

Google documents that OAuth client creation is a Cloud Console operation rather
than a programmatic credential-management API ([OAuth 2.0 best
practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices),
[Create access
credentials](https://developers.google.com/workspace/guides/create-credentials))
and recommends separate clients for distinct platforms. The current Calendar
grant is a [web-server OAuth
flow](https://developers.google.com/identity/protocols/oauth2/web-server); the
native app delegates it to the web surface instead of sharing the Firebase
Google Sign-In client.

### Focused verification

- Quipsly TypeScript: pass.
- Google Calendar regression: 11 suites and 66 tests pass.
- connection route: 5 tests pass, including a bearer-shaped mobile summary
  proving zero token decrypt, token refresh, provider list call, provider
  calendar ID, or credential material.
- Capture release static audit: 1,015 checks pass.
- compiled iPhone 17 Pro simulator operation: the focused Calendar continuity
  journey passes on iOS 26.3.1; result bundle:
  `/private/tmp/quipsly-google-calendar-mobile-20260803-02.xcresult`.
- no Cloud Build, Artifact Registry upload, Cloud Run revision, Google Calendar
  write, or user OAuth grant was created by this batch.

## Verification evidence

- Prisma Client generation: pass.
- Quipsly TypeScript: pass.
- focused OAuth/route suites: 3 suites, 10 tests, pass.
- complete Nest regression: 208 suites and 1,057 tests passed; 34 suites and
  100 tests remain explicitly skipped by the existing repository contract.
- fresh PostgreSQL replay: all 39 migrations applied and status current.
- retained local database: additive OAuth credential migration applied.
- optimized Next.js production build: pass with the repository's 8 GB Node
  heap; 155 static pages generated and all dynamic routes collected.
- release deploy/pipeline tests: 17 tests, pass.
- retained rendered operation: authenticated desktop and 390-point phone
  layouts pass without overflow, browser exceptions, server failures, leaked
  credential fields, database mutation, or provider side effects; private
  screenshots and receipt are mode `0600`.

No real Google account was connected, no token was fabricated, and no calendar
event was created during this slice. Provider registration and a real human
consent/readback remain explicit external gates.

## Next calendar slices

### Session event projection checkpoint

The next local slice now implements explicit Session-to-Google event projection:

- only scheduled Podcast and Coaching Sessions are eligible;
- the chosen calendar collection must belong to the signed-in user's verified
  OAuth connection and match the Session lane/Nest;
- preview is read-only and returns the exact privacy-safe event snapshot;
- deterministic provider event IDs allow retry recovery after an ambiguous
  create response without creating duplicates;
- the event contains title, time, timezone, Quipsly return URL, and a generic
  privacy notice—never attendees, participant identity, consent, recordings,
  transcript text, notes, goals, or tasks;
- `sendUpdates=none` is forced for create and update;
- team production selections keep the shared calendar's normal event visibility,
  while private selections stay private at the provider;
- confirmation is bound to the preview's exact source-revision digest;
- changed Quipsly state invalidates the preview before token decryption;
- updates use `If-Match` with the last provider etag so a Google-side edit
  produces `EXTERNAL_CHANGED` conflict truth instead of a lost update;
- successful create/update/no-op writes the canonical `CalendarProjection` and
  an append-only `CalendarSyncReceipt`;
- cancellation is isolated behind its own exact-revision preview and explicit
  removal confirmation;
- an uncertain network/provider outcome is reported as unknown and instructs
  retry of the same deterministic preview instead of claiming no side effect.

Google recommends client-supplied event IDs to keep local records synchronized
and prevent duplicate creation after ambiguous failures ([Create events](https://developers.google.com/workspace/calendar/api/guides/create-events)). Google etags and `If-Match` provide the lost-update boundary ([Resource versions](https://developers.google.com/workspace/calendar/api/guides/version-resources)). Collection-wide incremental sync and 410 full-resync recovery remain the next reconciliation layer ([Incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync)).

Focused Session projection provider/route tests pass 13/13. The retained
authenticated browser operation temporarily scheduled an actor-owned real
Session, previewed `CREATE`, rejected a stale confirmation, verified zero
projection/effect rows, restored the exact prior Session schedule/metadata/
revision timestamp, and removed all temporary connection and collection rows.
No Google request or external side effect occurred.

1. Complete the dedicated Google OAuth client and real-account consent
   readback.
2. Exercise create, deterministic retry recovery, etag conflict, and no-op
   against a dedicated QA calendar with notifications visibly off.
3. Exercise explicit cancellation against a dedicated QA event and verify the
   provider-absence recovery receipt.
4. Operate the implemented privacy-safe full/incremental reconciliation,
   deletion handling, stale-cursor rejection, and 410-triggered full resync
   against the dedicated QA calendar. Local PostgreSQL proof is complete; see
   `docs/coordination/2026-08-01-google-calendar-reconciliation.md`.
5. Add a verified, renewable push-notification wake-up for that same
   reconciliation path; notification payloads must never become an alternate
   event-import path.
6. Add podcast milestones and coach availability/free-busy as separate,
   least-privilege capabilities.
7. Add EventKit device-local access in Quipsly Capture only after the shared
   projection and conflict contracts are stable.
