# Quipsly Capture accessibility and Build 22 hold

Date: 2026-07-31

This checkpoint hardens the shipping iPhone shell at exact source
`10d5ba8d709ec8a6479979d72866212e555bf4f7` and records why qualified Build
22 remains deliberately outside App Store Connect. It does not promote
simulator evidence into physical-device proof or infer backend compatibility
from a successful native archive.

## Operated product changes

- Work now owns a self-sizing search field instead of relying on the system
  search presentation that clipped at the largest accessibility text size.
  The retained preview journey types `Proof-listen`, finds the exact retained
  task, clears the query, confirms keyboard dismissal, and continues into the
  shared tag vocabulary.
- Project names and role metadata adapt vertically rather than truncating.
  Project task, goal, note, and tag counts choose a four-column row only when
  it fits; otherwise they wrap into a two-column grid.
- The shared-tag **Manage** action now meets the 44-point minimum hit target.
- The Account identity card exposes one human-readable signed-in identity to
  assistive technology and hides its decorative avatar.
- Today, Work, Library, and Account now run one app-owned accessibility audit
  at `UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge`. The audited
  issue classes are hit region, sufficient element description, and clipped
  text. Increase Contrast was enabled on the audited iPhone 17 Pro simulator.

## Exact verification

- Work search, clear, keyboard dismissal, retained project records, tag
  vocabulary, tasks, goals, notes, and tags: 1 passed, 0 failed, 0 skipped.
- Largest-text core-shell audit after a clean simulator boot: 1 passed, 0
  failed, 0 skipped.
- Focused record, consent, rehearsal, and core-shell accessibility run: 4
  passed, 0 failed, 0 skipped.
- Native and App Store static contract: 902/902 checks passed.
- Cross-surface Quipsly contract: 168/168 tests passed.
- Exact-source full `CaptureExperienceUITests`: 41 passed, 0 failed, 0
  skipped in 18m46s.
- Exact-source Safari/Share Extension journeys: 3 passed, 0 failed, 0 skipped.
- Copied result bundles were independently read back from
  `/Volumes/My Passport/Quipsly Release Evidence/2026-07-31-capture-accessibility-10d5ba8d`;
  all four preserved summaries report `Passed` with zero failures or skips.

The simulator was also visually read back while the suite operated the real
shipping shell, including Episode manuscript, shared Watch, episode thread,
consent, transcript review, source-linked task/goal actions, Account support,
and deletion surfaces. This is deterministic simulator operation, not a real
recording or external side effect.

## Qualified Build 22, intentionally not uploaded

- Frozen source:
  `8ec38f09cd5842ff67d346c0b8d6c41f557b8081`
- Version/build: Quipsly Capture 1.0 (22)
- IPA bytes: `21,141,551`
- IPA SHA-256:
  `2804812646db6caa37dfc7fb8badb7d2134b0047ef0205ac284d12e47c4520c1`
- Candidate qualification: passed, including its deterministic UI lane.
- Receipt state: `uploadAttempted: false`, `uploadPerformed: false`.
- Fresh App Store Connect lookup: Build 1.0 (22) was not found.
- Durable evidence:
  `/Volumes/My Passport/Quipsly Release Evidence/2026-07-31-build22-8ec38f09-qualified-not-uploaded`

Build 22 contains native client-follow-up behavior that depends on the
matching Nest schema and server surface. Upload remains held until the exact
backend source completes the guarded schema/deploy sequence, a zero-traffic
revision passes authenticated acceptance, and production readback confirms
that same source. A native-only upload would distribute a client whose server
contract is not yet proven.

## Current delivery and loop-back gates

- Fresh App Store Connect readback confirms Build 20 is `VALID`, externally
  `IN_BETA_TESTING`, and included in **Quipsly Capture Rehearsal**. The
  anonymous public page is open and exposes Apple's exact Quipsly Capture
  TestFlight handoff. Build 20 therefore remains the canonical external target.
- Google Cloud user credentials, Application Default Credentials, deploy
  project access, Firebase project access, and Firebase Admin access all fail
  the current authorization check. Before the matching backend can be
  released, run:

  ```bash
  gcloud auth login --update-adc --brief
  gcloud auth application-default set-quota-project quipsly-reef
  bash scripts/release/quipsly-gcloud-auth-check.sh
  ```

- Xcode and CoreDevice currently expose only the Mac as available. Layla and
  Morbo remain unavailable, and the USB device tree exposes no iPhone. A
  physical TestFlight install, source recording, interruption/recovery,
  upload, playback, and same-ID Nest readback remain open acceptance gates.

Retained synthetic QA identities and clearly labeled artifacts remain the
default longitudinal test corpus under
`docs/runbooks/quipsly-retained-dogfood.md`. Nothing in this checkpoint
authorizes using a real collaborator identity for destructive testing or
claiming an external notification, invitation, publication, or calendar
mutation that was not directly observed.
