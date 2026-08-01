# Session calendar cancellation authority

Date: 2026-08-01
Status: implemented, operated locally, and provider-safe; a real QA calendar remains an operator-gated acceptance lane

## Outcome

Quipsly can now converge a canceled Podcast or Coaching Session with its
selected Google Calendar projection without treating deletion as an automatic
side effect of changing the canonical Session. Cancellation has a dedicated
preview, authority check, explicit confirmation, provider-version condition,
and append-only receipt.

The shipped boundary is deliberately narrow:

- Quipsly remains source of truth for Session status and schedule.
- Preview performs no provider request.
- Create, update, and cancel use the canonical Session mutation boundary.
  Project-only VIEWER access can read the Session shell but cannot project it.
- Selecting a Nest-owned Podcast Production calendar requires current OWNER or
  EDITOR access before token decryption or any Google request. The chooser also
  omits read-only Nests.
- POST never converts a canceled Session into a normal `SYNCED` no-op. A
  cancellation requires `DELETE`, the exact preview revision, and
  `confirmCancellation: true`.

## Provider contract

A projected event is removed with Google Calendar's event-delete operation,
`sendUpdates=none`, and no request body. Quipsly sends `If-Match` with the last
verified provider etag. An HTTP 412 becomes `EXTERNAL_CHANGED` conflict truth;
Quipsly does not erase a Google-side edit it has not reviewed.

Google documents event deletion as a dedicated DELETE operation and resource
versions as the conditional-modification boundary:

- [Events: delete](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)
- [Get versioned resources](https://developers.google.com/workspace/calendar/api/guides/version-resources)

HTTP 404 and 410 converge as verified absence for this exact stored event
identity. That makes an ambiguous network failure recoverable: a retry may
discover that Google already removed the event and record the absence without
another external effect. Google documents those error semantics in
[Handle API errors](https://developers.google.com/workspace/calendar/api/guides/errors).

The durable projection retains the provider event ID for audit, clears the
etag, records `CANCELED`, and increments sequence only when a provider mutation
is observed. `CalendarSyncReceipt.operation=CANCEL_EVENT` records one of:

- `SUCCEEDED` when Google confirms deletion;
- `SKIPPED` when no event was projected or Google reports it already absent;
- `CONFLICT` when the provider etag changed or Quipsly changed after a provider
  effect; or
- no receipt yet when the outcome is genuinely unknown, with an exact-retry
  instruction returned to the person.

An exact retry of an already recorded source revision returns the original
receipt and performs no provider call or additional database write.
If Session authority disappears after Google has already answered, Quipsly
still records the provider outcome and marks the projection as a conflict
instead of losing effect truth at the authorization race.

## UX contract

The Schedule surface shows cancellation as a destructive, separate action:

- canceled, still-scheduled Sessions remain labeled and reachable in the
  projection chooser so this recovery path is not merely an API capability;
- **Confirm removal from Google** when an event identity and etag exist;
- **Record verified absence** when no provider event was ever projected;
- honest unknown-outcome copy when a network/provider response cannot prove
  whether deletion happened.

The interface never says invitations were sent or participants were notified.
Attendees remain absent from the event projection, and `sendUpdates=none` is
fixed server-side rather than trusted to the client.

## Operated evidence

`scripts/quipsly-local-calendar-cancellation-dogfood.mjs` used the loopback
Firebase Auth emulator, local Nest server, and local PostgreSQL with three
disposable people: owner, editor, and viewer.

Observed results:

- editor preview: `NOOP` for a canceled Session with no projected event;
- editor explicit cancellation: HTTP 200, projection `CANCELED`, receipt
  `SKIPPED`, `externalMutated=false`;
- exact editor retry: original receipt reused, no duplicate receipt;
- viewer shared production-calendar selection: HTTP 403;
- viewer Session cancellation: HTTP 404 at the mutation-scoped Session query;
- provider calls required: false;
- independent cleanup: zero connections, rooms, projects, workspaces, users,
  or prefix-matched fixtures remained.

Verification is complete:

- focused provider, route, and authority tests: 28/28 pass;
- complete Nest regression: 213 suites and 1,094 tests pass; 35 suites and 105
  tests remain explicitly skipped by existing repository contracts;
- strict Quipsly TypeScript: pass;
- optimized Next.js production build: pass, 155 static pages generated and all
  dynamic routes—including Session calendar projection—collected;
- shared mobile source contract: 80/80 pass, including the new Calendar
  cancellation authority invariant;
- Capture App Store static contract: 949/949 pass;
- App Store metadata field-limit check: pass; and
- diff integrity: pass.

## Remaining real-provider acceptance

When the dedicated Calendar integrations OAuth client is available, use a
disposable Quipsly QA calendar and event to prove:

1. confirmed deletion produces one `SUCCEEDED` receipt;
2. an intervening Google-side edit produces HTTP 412 and a conflict receipt;
3. retry after a simulated ambiguous response converges through 404/410;
4. no attendee notification is emitted; and
5. the exact stored event identity is absent by provider readback.

No production or personal Google event was touched by this local slice.
