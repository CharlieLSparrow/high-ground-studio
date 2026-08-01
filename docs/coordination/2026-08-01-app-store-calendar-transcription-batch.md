# App Store, calendar, and transcription batch checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Release policy: committed Nest batch deployed as a no-traffic preview. Production
remains pinned to the prior revision. This intentionally spaces releases and
avoids promoting a new web manifest before the matching transcript worker is
released and read back.

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
- This new subscription slice is committed source only until the next spaced
  preview batch; the earlier 0%-traffic preview does not contain it.

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

## Verification

- App Store metadata validation: pass, four explicit blockers.
- App Store listing operator tests: 4/4.
- Transcript worker tests: 10/10.
- Calendar, Google adapter, packet, and private route tests: 18/18.
- Quipsly TypeScript: pass.
- Media-processing and transcript-worker TypeScript: pass.
- Public mobile contract: pass.
- Optimized Nest production build: pass, including the new calendar route.
- `git diff --check`: pass.

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
- The deployed Google Calendar path passed configuration and token minting, but
  its read-only calendar metadata request returned Google HTTP 403. Calendar API
  is enabled and the runtime identity is
  `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`; the configured
  calendar still needs to grant that identity event-management access. No event
  was created, changed, deleted, or sent during this check.

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
