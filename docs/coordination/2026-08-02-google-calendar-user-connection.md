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
  signed-in actor's current project visibility is proven.

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

The secret seeder maps them to dedicated `quipsly-google-calendar-oauth-*`
Secret Manager resources. The preview deploy mounts them only when
`ENABLE_GOOGLE_CALENDAR_OAUTH=1`; enabling the feature fails closed unless all
four secrets have an enabled version.

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

1. Complete the dedicated Google OAuth client and real-account consent
   readback.
2. Add a write-preview contract for one canonical Quipsly Session projection.
3. Create events idempotently with source revision, provider etag, and receipt.
4. Reconcile external changes and conflicts without overwriting either side.
5. Add podcast milestones and coach availability/free-busy as separate,
   least-privilege capabilities.
6. Add EventKit device-local access in Quipsly Capture only after the shared
   projection and conflict contracts are stable.
