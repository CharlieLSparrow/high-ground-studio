# Quipsly Capture App Store submission readiness

**Date:** 2026-08-02

**Mode:** read-only provider audit plus exact-commit draft visual review

## Outcome

App Store Connect now has a precise submission ledger rather than a generic
metadata blocker. Build 26 is assigned to version 1.0 and remains the current
distributed baseline. The provider confirms the app identity, build identity,
review detail, content rights, all 24 age-rating answers, IDFA declaration,
free United States price, and United States availability.

The submission is not ready. Apple reports zero of the planned five 6.9-inch
iPhone screenshots, and App Privacy publication, DSA trader verification,
physical Build 26 acceptance, production account-deletion proof, and app-level
Mac/Vision availability choices remain explicit manual gates.

No metadata, screenshot, privacy answer, legal status, compatibility setting,
review submission, TestFlight assignment, or build was changed by this audit.

## Draft visual operation

Exact committed source `58c57250bb7b42c5e6f522011d44523a07a2e57d`
produced five private-data-safe 1320 x 2868 draft screenshots from a detached
worktree on iPhone 17 Pro Max / iOS 26.3.1. The drafts remain deliberately
ineligible for App Store upload.

Human visual inspection found and repaired three shipping UX/truth defects:

- **Add to Apple Calendar…** visibly truncated, so the explicit one-event
  action is now the shorter **Add to Calendar** while its hint still names
  Apple's system editor and the no-read boundary.
- Account's upload switches sounded like they changed the network itself.
  They now say **Upload using cellular**, **Upload on metered networks**, and
  **Upload in Low Data Mode**.
- The App Store Account state claimed zero local originals while the Library
  state showed one 18.4 MB verified source. Both deterministic surfaces now
  describe the same single synthetic source.

The Calendar-editor journey and the complete five-screenshot journey pass 2/2
after the repair. The result bundle is
`/tmp/quipsly-capture-app-store-ux-fix-rerun-20260803T035737Z-50848.xcresult`.

Final visual readback found one additional navigation-layer defect: the next
Help card's teal text refracted through the persistent iOS 26 Liquid Glass tab
bar. Quipsly now requests the system's hard bottom scroll-edge effect on iOS
26 and later, while iOS 17 through 25 retain their native treatment. This does
not replace or imitate the system tab bar; it uses Apple's nearly opaque edge
boundary for dense text under pinned controls. The complete five-screen
journey then passed 1/1 at
`/tmp/quipsly-capture-hard-edge-rerun-20260803T040837Z-55130.xcresult`, and
human inspection confirmed a clean Account/tab-bar boundary.

## Exact remaining gates

1. Recapture and approve all five screenshots from the next exact signed
   candidate or its TestFlight installation, then upload only those approved
   assets.
2. Publish App Privacy answers after the account holder verifies that they
   still match the signed binary and production services.
3. Complete the account-level DSA trader determination.
4. Opt out of Apple Silicon Mac and Apple Vision Pro availability, then read
   both choices back.
5. Prove account deletion against a disposable production identity with
   independent Firebase, database, and media deletion readback.
6. Install the current TestFlight build on a physical iPhone and prove capture,
   interruption recovery, upload, playback, alignment, and cross-device
   readback. The next deliberately batched candidate must repeat this gate for
   any newer native source.

Build 26 does not contain the latest canonical focus-planning and screenshot UX
work. In keeping with the spaced release train, this checkpoint does not create
another build merely to clear provider metadata; the next TestFlight build
should batch a genuinely useful product increment and then recapture final
screenshots from that exact source.

## Build 27 no-upload follow-up — 2026-08-03

The deliberately batched candidate now exists. Exact source
`56f3e85d8934bb5a50f929f019e1bd6e08a0a46a` qualified Quipsly Capture 1.0
(27) with 54/54 serialized UI journeys, a signed archive, exported IPA, strict
app/extension signature and profile inspection, iPhone-only packaged metadata,
and an independently matching 22,555,819-byte IPA SHA-256. The owner-only
receipt records `candidateQualified=true` and `uploadAttempted=false`.

The first Build 27 source correctly failed before signing because packet-note
purpose/audience review was incorrectly gated on completed playback review.
The replacement source permits no-write inspection while leaving the final
canonical Save action locked until the complete evidence span is confirmed.

This qualifies a sealed candidate; it does not change the provider state
described above. Build 26 remains the distributed baseline until an explicit
sealed-candidate upload and independent App Store Connect readback. Final
screenshots must come from the exact distributed Build 27 binary or its signed
candidate after physical approval. Full evidence is in
`docs/coordination/2026-08-03-capture-build27-candidate.md`.

## Current platform references

- Apple defines the hard scroll-edge style as a nearly opaque boundary between
  pinned controls and scrolling content:
  <https://developer.apple.com/documentation/swiftui/scroll-views>
- Apple documents that `EKEventEditViewController` can let a person review and
  save one event without granting Quipsly broad Calendar access:
  <https://developer.apple.com/documentation/eventkit/accessing-calendar-using-eventkit-and-eventkitui>
- Apple documents read-only external calendar subscriptions in iPhone Calendar:
  <https://support.apple.com/guide/iphone/use-multiple-calendars-iph3d1110d4/26/ios/26>
- Google's current Calendar scope catalog confirms Quipsly's narrow owned-event
  and calendar-list scopes:
  <https://developers.google.com/workspace/calendar/api/auth>
