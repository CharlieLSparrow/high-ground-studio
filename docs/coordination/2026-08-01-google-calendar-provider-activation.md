# Google Calendar provider activation checkpoint

Date: 2026-08-01 (America/Denver)

## Outcome

Quipsly's existing per-user Google Calendar connection now has a dedicated
provider boundary instead of sharing the Firebase Authentication project.
This protects Quipsly sign-in from Calendar consent, verification, or token
revocation changes.

The provider project is:

- project ID: `quipsly-calendar-integrations`
- display name: `Quipsly Calendar Integrations`
- project number: `36662205404`
- organization: `66855463609`
- labels: `app=quipsly`, `purpose=calendar-integrations`,
  `managed-by=codex`
- billing: not attached
- product API: Google Calendar API enabled

The project remains owned by `charlie@highgroundodyssey.com`. The organization
correctly refused an attempted project grant to the external personal Gmail
identity under `constraints/iam.allowedPolicyMemberDomains`; that policy was
not weakened.

## Runtime credential boundary

The deploy project remains `high-ground-odyssey`. Two generated application
secrets now exist there with one enabled version each:

- `quipsly-google-calendar-oauth-state-secret`
- `quipsly-google-calendar-oauth-token-encryption-key`

Their values were generated directly into Secret Manager and were never
printed. `studio-cloud-run` has secret-accessor permission. The GitHub deployer
has the same accessor and viewer pattern used by the existing Quipsly release
secrets.

The provider-created values remain intentionally absent until the OAuth client
is created:

- `quipsly-google-calendar-oauth-client-id`
- `quipsly-google-calendar-oauth-client-secret`

Production deployment must continue to fail closed unless all four values have
enabled versions and `ENABLE_GOOGLE_CALENDAR_OAUTH=1` is deliberately selected.

## OAuth registration contract

The user type is External so a Quipsly user can connect any Google account. The
initial publishing state should be Testing while the consent screen and
end-to-end behavior are verified. The exact scopes are:

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.owned`

The first scope lists available calendars so the user can make an explicit
selection. The second can view and manage events only on calendars the user
owns. Broader `calendar`, `calendar.events`, and account-identity scopes are
not required for this integration.

The Web OAuth client must use exactly these redirect URIs:

- `https://nest.quipsly.com/api/calendar/connections/google/callback`
- `http://127.0.0.1:3012/api/calendar/connections/google/callback`

The production homepage and privacy policy both return HTTP 200. The public
privacy policy now explicitly discloses Calendar access, purpose, encrypted
credential storage, collaboration boundaries, Limited Use adherence,
disconnection, and Google-side revocation.

## Verification expectations

Google's current documentation says public applications using sensitive or
restricted scopes must complete OAuth verification. Until approval, an app in
Testing is limited to listed test users; an unverified application can also be
subject to a lifetime 100-new-user cap. The verification package must include:

- a homepage on a verified Quipsly domain that describes the product and links
  to the same privacy policy used by the consent screen;
- Search Console ownership for every authorized domain by an owner or editor of
  the Cloud project;
- current project contact and user-support email;
- scope-specific justification for both narrow Calendar scopes;
- an end-to-end demonstration video showing the English consent screen and the
  exact in-product Calendar workflow;
- a production publishing state before submitting verification.

Sources:

- [Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [OAuth app verification](https://support.google.com/cloud/answer/13463073)
- [Verification requirements](https://support.google.com/cloud/answer/13464321)
- [Manage app audience](https://support.google.com/cloud/answer/15549945)
- [OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)

## Verification evidence

- Calendar OAuth and synchronization suites: 10 suites, 63 tests passed.
- The callback boundary now has direct coverage for signed-out handling,
  provider denial, expired requests, encrypted credential persistence,
  cross-account collision denial, and missing-primary-calendar failure.
- Quipsly TypeScript passed.
- Capture/App Store static smoke passed 954 checks.
- No Calendar event, attendee invitation, production traffic, or release build
  was created by this checkpoint.

## Remaining operator sequence

1. Reauthenticate `charlie@highgroundodyssey.com` in Chrome.
2. Configure Quipsly branding, External/Testing audience, test users, authorized
   domain, and the two exact scopes.
3. Create the Web client with the two exact callbacks.
4. Write the client ID and client secret to Secret Manager without printing
   either value.
5. Run the full release contract and one batched 0%-traffic preview deployment.
6. Connect a disposable Quipsly test user, select a dedicated QA calendar, and
   prove create, update, conflict, cancellation, reconciliation, disconnect,
   credential deletion, and outsider denial. Attendee notifications remain off.
7. Submit brand/scope verification only after the production UX and disclosure
   video are stable.
