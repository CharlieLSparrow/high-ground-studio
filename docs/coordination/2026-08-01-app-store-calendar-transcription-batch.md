# App Store, calendar, and transcription batch checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Release policy: committed Nest batch deployed as a no-traffic preview. Production
remains pinned to the prior revision. This intentionally spaces releases and
avoids promoting a new web manifest before the matching transcript worker is
released and read back.

Cadence decision: local checks remain continuous, but routine Nest previews now
receive a two-hour observation window before replacement, and routine TestFlight
candidates are limited to one materially testable workflow build per day.
Critical security, data-loss, authentication, or outage fixes may override the
window only with an explicit reason and immutable source/rollback evidence. The
calendar subscription and readiness batches are committed and pushed without
replacing the current preview.

## App Store Connect

The API-backed operator applied and read back:

- Quipsly Capture name and subtitle;
- privacy and privacy-choices URLs;
- Productivity and Photo & Video categories;
- en-US promotional text, description, keywords, support, and marketing URLs;
- copyright and manual release;
- validated Build 25 assignment to iOS Version 1.0;
- App Review contact, current review notes, and the synthetic reviewer account.

Build 25 remains valid and in external beta testing. The public TestFlight link
remains open. No API key, password, phone number, or email address was written
to Git or plaintext receipts.

External mode-0600 evidence:

- `Quipsly QA Artifacts/Retained Production/2026-08-01/app-store-listing-before-apply.json`
- `Quipsly QA Artifacts/Retained Production/2026-08-01/app-store-listing-after-apply.json`
- `Quipsly QA Artifacts/Retained Production/2026-08-01/app-store-connect-build25-after-listing.json`

Legal declarations, App Privacy publication, signed-candidate screenshots, and
physical-device acceptance remain open.

The checked-in packet now also machine-reconciles its proposed App Privacy data
types with the exact shipping `PrivacyInfo.xcprivacy` file and enumerates the
current Content Rights, age-rating/social-media, DSA, free-price, first-
territory, and iPhone-only compatibility decisions. These remain explicit
account-holder/provider gates; adding them to the packet is preparation, not a
legal attestation or provider save. The prior App Store Connect API key is no
longer present on this Mac, and the signed-in browser session has expired, so a
fresh provider readback requires either a replacement owner-only key file or a
new interactive sign-in.

## Screenshot composition

A new iPhone 17 Pro Max simulator produced five private-data-safe drafts at the
required `1320 x 2868` size. They are intentionally
`submissionEligible:false`. Visual review accepted the general Record, Library,
and Account stories; Today and Work need a quieter final synthetic state, and
preview banners must not appear in final captures.

External evidence:

- `Quipsly QA Artifacts/App Store Drafts/2026-08-01/current-batch-a`

## Calendar slice

- The existing managed Google Calendar integration and receipts remain intact.
- Coaching booking UI now offers `Add with iCalendar`.
- The private route authorizes staff, client, coach, or room creator.
- Generated ICS uses stable UIDs, UTC times, RFC escaping/folding, CRLF, status,
  and a Quipsly session deep link.
- It excludes attendee addresses, transcript text, recordings, goals, and
  private notes.
- The full connected-calendar architecture and phased Google/Apple/webcal plan
  is recorded in `docs/quipsly/calendar-transcription-architecture-2026-08-01.md`.
- Users can now create, replace, and revoke one-time read-only subscription
  links for personal commitments, their coaching appointments, or scheduled
  podcast rooms in one accessible Nest. Raw capability material is returned
  once, stored only as a digest, and never returned by the status API.
- Subscription renders preserve stable UIDs/revisions, publish one-hour refresh
  hints, mark task/goal due events transparent, record no-external-mutation
  receipts, and exclude notes, transcripts, recordings, identities, and
  provider credentials by construction.
- Capture Today now exposes the same three feeds through a compact native
  Calendar continuity disclosure. It authenticates directly with Nest, selects
  one accessible podcast Nest, opens Apple Calendar with `webcal`, shares the
  standard HTTPS subscription form for Google Calendar and other clients, and
  retains a newly minted capability only in process memory. Preview data shows
  statuses without any private URL and disables create/replace/revoke.
- This new subscription slice is committed source only until the next spaced
  preview batch; the earlier 0%-traffic preview does not contain it.
- A scheduled next Session can now open Apple's one-event editor with its exact
  canonical interval and Session link. The shipping target requests neither
  write-only nor full calendar access, copies no Session-private content, and
  shows a no-readback receipt before handoff. Sessions without a valid end time
  do not offer the action; Quipsly does not invent a meeting duration.
- Google subscription setup is documented as the provider actually supports
  it: share the HTTPS URL from Capture, then finish **Other calendars > From
  URL** at calendar.google.com on a computer. Apple receives the `webcal:` form
  directly.
- A production-hardening follow-up closes the capability-boundary defects.
  The database and advisory-lock layer now guarantee one active link per owner
  and collection; inactive users and former Nest collaborators receive the same
  non-enumerable not-found response as a revoked token; generated event links
  use the canonical Nest origin; and calendar polling records a receipt only
  when the content digest changes. Strong ETags and private conditional caching
  avoid returning an unchanged body without turning an anonymous capability
  route into a shared-cache object.
- Next's request logger now ignores only the bearer subscription path. Cloud
  Run creates its own request logs, so release preflight also requires the
  named, exact-route exclusion now active on the project's `_Default` Cloud
  Logging sink. A live paired probe proves ordinary health requests remain
  observable while synthetic bearer-style calendar paths do not enter the
  sink. The calendar provider still necessarily receives the private URL it
  subscribes to; accidental disclosure requires rotation.
- The migration replayed all 37 migrations in a fresh PostgreSQL database,
  reported zero schema diff, denied a second simultaneous active link at the
  database boundary, allowed an explicit revoke-and-replace, backfilled safe
  revocation receipts, and left the daily database schema current. The isolated
  fixture was removed after readback.
- A retained `.test` product operator completed the rendered phone-width
  create, conditional-fetch, replace, and revoke journey against loopback Nest
  and PostgreSQL. Readback proved one publication receipt per content revision,
  `304` for unchanged polling, immediate `404` for both revoked links, exactly
  one active link during rotation, zero active links at completion, no provider
  contact, and a cleared browser session. The first failed selector run mutated
  nothing; both evidence directories were preserved.
- Local Nest logging proof retained 27 ordinary calendar-management request
  entries while recording zero bearer subscription paths. After Google Cloud
  authentication was restored, the production `_Default` sink received only
  `exclude-quipsly-calendar-feed-capabilities`; the base sink filter,
  destination, `_Required` sink, and ordinary request logging remain intact.
  The read-only `pnpm quipsly:release:calendar-log-privacy` check now passes and
  remains a release-preflight gate.

## Transcription and packet slice

- New Deepgram batch jobs request `diarize_model=latest` instead of the
  deprecated boolean path.
- Immutable legacy manifests still replay their original `diarize=true`
  request.
- The contract records multichannel intent for isolated-channel evolution.
- Session packets are stamped with purpose and template version.
- Coaching packets stay author-private and expose coaching-only lanes.
- Podcast packets expose production, fact-check/rights, quote, article, clip,
  preparation, and task lanes without creating work automatically.
- Nest now exposes each saved packet lane as an explicit human decision:
  approve for internal use, request revision, reject, or reopen. The mutation is
  bound to the canonical room, transcript job, and summary note and stores the
  reviewer note and no-external-effect receipt on the packet summary.
- Capture projects those same persisted lanes on the Session recorder. It does
  not maintain a second mobile review state, and its review request now uses the
  canonical `callRoomId` rather than the local Session record ID.
- Both surfaces state that lane approval creates no canonical note, task, goal,
  client delivery, message, calendar event, or publication. Deliberate Session
  Notes and client follow-up release remain separate workflows.
- The assigned coach can now adjust a private client follow-up after assembly
  and before release. Saves use optimistic concurrency, revalidate the current
  coach/client/source boundary inside a Serializable transaction, and append
  immutable `DRAFT_UPDATED` history. Exact retries are idempotent; stale saves,
  changed request intent, client mutation, and edits to released history fail
  closed.
- A retained rendered coach/client operation created revision 1, changed and
  saved revision 2, then proved from a separate client account that the private
  draft remained concealed while the prior released artifact stayed visible.
  PostgreSQL readback found the two expected revisions and zero delivery events;
  Calendar evidence and the released content hash were unchanged. Exact evidence
  is recorded in
  `docs/coordination/2026-08-01-retained-coaching-draft-revisions.md`.

## Verification

- Final calendar-focused web suite: 47/47.
- Final calendar operation/release contracts: 9/9.
- Full Nest Jest suite: 1,035 passed across 205 active suites; 100 tests in 34
  suites remained intentionally skipped.
- Quipsly TypeScript, Prisma schema validation, 37-migration local status, and
  optimized 152-route production build: pass.
- Generated build output was moved to the macOS Trash after verification so it
  cannot create a duplicate-package Jest warning in later development runs.
- App Store metadata validation: pass, four explicit blockers.
- App Store listing operator tests: 4/4.
- Transcript worker tests: 10/10.
- Calendar, Google adapter, packet, and private route tests: 18/18.
- Calendar capability-log exclusion operator tests: 4/4; production readback
  and paired ordinary/excluded request proof pass after provider propagation.
- Quipsly TypeScript: pass.
- Media-processing and transcript-worker TypeScript: pass.
- Public mobile contract: pass.
- Capture calendar static App Store gate: 928/928.
- Focused native calendar UI acceptance on iPhone 17 Pro simulator: pass; the
  shipping Swift target compiled and the read-only/privacy test completed with
  exit 0. Result bundle:
  `/Volumes/My Passport/QuipslyBuild/CalendarFinal-20260801/CalendarFinal.xcresult`.
- Focused one-event Apple Calendar acceptance on the same simulator: pass. The
  test opened Apple's real `New Event` editor, canceled it, and read back
  Quipsly's truthful no-calendar-read/no-save-verification receipt. Result
  bundle:
  `/Volumes/My Passport/QuipslyBuild/CalendarFinal-20260801/CalendarFinal.xcresult`.
- Optimized Nest production build: pass, including the new calendar route.
- `git diff --check`: pass.
- Packet note-lane web/model/server tests: 46/46 across the focused suites.
- Capture static App Store gate after packet-lane integration: 933/933.
- Focused native packet-lane UI acceptance on iPhone 17 Pro Max simulator:
  pass. The test expanded the three-lane card, opened the source-grounded client
  follow-up lane, read the no-side-effect boundary, and proved preview mutation
  controls disabled. Result bundle:
  `/Volumes/My Passport/CodexDerivedData/quipsly-packet-lanes-20260801/Logs/Test/Test-HighGroundCapture-2026.08.01_07-24-29--0600.xcresult`.

The first native pass also found and fixed an accessibility defect: a
DisclosureGroup-level identifier was inherited by every lane row. Identifiers
now live on the actual disclosure label, lane buttons, sheet marker, and action
buttons, so assistive technology can distinguish the decisions.

## Live preview acceptance

- Source commit: `6ae7afd23d2f188498598e8147fb33b9a337ecee`.
- Cloud Build: `917891d8-c4bd-46cd-ae79-49f2ff36c0be`.
- Container manifest digest: `sha256:51586928e5e70cf0a748af81be2eb6a0ccce34e110cd00938b7648d99fb052dc`.
- Cloud Run revision: `studio-00494-zel`, tagged `quipsly-preview`, 0% traffic.
- Production remains 100% on `studio-00492-jeg`.
- Generated reviewer passed Firebase login, Quipsly session exchange, database
  routes, Nest/editor/recorder/research/publishing surfaces, logout, and bounded
  Firebase/database cleanup.
- The generated coaching workflow passed with separate verified coach and client
  identities, hold conversion, payment evidence, capture-room visibility,
  consent decline, current-policy discovery, independent all-party recording and
  transcription consent, recording unlock only after 2-of-2 consent,
  rescheduling, cancellation, and bounded cleanup.
- Private `.ics` export passed for coach and client, preserved one stable UID
  across reschedule and cancellation, changed the start time on reschedule,
  exported `CANCELLED` after cancellation, used private/no-store and CRLF, and
  excluded generated identities and private session-content categories.
- The deployed Google Calendar path passed configuration and token minting. A
  live `events.list` request with the exact runtime identity and a token whose
  scope readback includes `calendar.events` returned HTTP 200. A second
  production-shaped partial response returned only `calendar#events`, proving
  the configured event collection is readable without requesting event
  content. The earlier calendar-metadata request returned HTTP
  403 because that endpoint is outside the intentionally narrow scope, not
  because calendar sharing is missing. The readiness implementation now probes
  the real event collection with a partial response that excludes event
  content and returns only access status. No event was created, changed,
  deleted, or sent during either check.

The live coaching runner was brought up to the production auth and consent
contracts: disposable Firebase identities are explicitly verified, and both
participants must independently discover and accept the current consent policy.
The app's verification and all-party consent gates were not weakened.

## Transcript-worker infrastructure gate

The `quipsly-transcript-worker` Cloud Run Job does not yet exist. Secret Manager
contains the expected `quipsly-deepgram-api-key` secret, but it has no enabled
versions. The worker release therefore remains correctly blocked before provider
execution. Do not promote the Nest preview or claim production transcription
until one enabled key version exists and the consented cloud fixture passes both
create-once and immutable replay checks.

The live packet-purpose runner also refused to build from unreleased evidence:

- three accessible coaching transcripts are held by
  `ALL_PARTY_TRANSCRIPTION_CONSENT_REQUIRED`;
- the other accessible coaching rooms have no transcript recording asset; and
- the accessible podcast room has no transcript recording asset.

This is the correct fail-closed behavior. Current v2 coaching and podcast packet
lanes remain covered by deterministic tests, but production packet operation is
not accepted until an eligible released transcript exists in each purpose lane.

## Next release batch

Add one enabled Deepgram API-key secret version, deploy and read back the exact
transcript-worker artifact, then run the consented provider fixture. Build one
coaching packet plus one podcast packet from source-linked transcripts, exercise
the managed Google projection after sharing the configured calendar with the
runtime service account, and prove unrelated-account denial. Promote only after
those checks pass against this exact Nest source and worker release.
