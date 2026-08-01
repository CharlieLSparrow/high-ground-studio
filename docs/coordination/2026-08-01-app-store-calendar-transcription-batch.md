# App Store, calendar, and transcription batch checkpoint

Date: 2026-08-01

Branch: `codex/quipsly-product-20260724`

Release policy: committed batch; not yet deployed. This intentionally spaces
releases and avoids putting a new web manifest in production before the matching
transcript worker is released and read back.

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

## Next release batch

Before deployment, update the transcript-worker release artifact and include it
in the same release readback as Nest. Then operate one synthetic coaching
booking through ICS download and the managed Google projection, and build one
coaching packet plus one podcast packet from source-linked transcripts. Promote
only after privacy/outsider checks and exact source/image readback pass.
