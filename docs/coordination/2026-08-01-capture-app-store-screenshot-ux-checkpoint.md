# Quipsly Capture App Store screenshot UX checkpoint

**Date:** 2026-08-01  
**Status:** committed-source draft evidence complete; submission use still blocked

## Outcome

Quipsly Capture now has a deterministic, private-data-safe App Store screenshot
journey whose five screens present the production product story rather than the
engineering preview boundary.

The shipping UX repairs are committed in:

- source commit: `543180f4085b63ffe37d21554e04c2e7fe17fda3`
- subject: `Polish Capture App Store screenshot journey`

The dedicated presentation layer is available only in `DEBUG`, requires the
existing mutation-free preview mode, and cannot be enabled in a release build.
It uses fictional account data (`Alex Morgan`, `alex@example.com`) and performs
no server mutations.

## Visual review

The operated journey now shows:

1. **Today:** a ready leadership coaching session, Apple Calendar continuity,
   and the first reviewed follow-through task without preview/debug labels.
2. **Record:** audio, video, transcription, and nearby-person consent choices
   visibly enabled with a reachable Save action.
3. **Work:** a project-centered task, note, goal, and tag workspace without
   disabled project-creation affordances or internal canonical-model jargon.
4. **Library:** a locally preserved source, verified cloud copy, and transcript
   ready for review without synthetic/offline failure copy.
5. **Account:** identity, privacy policy, account-deletion information, deletion
   request, upload policy, and local-original retention in the initial viewport.

The consent copy was shortened without removing the canonical attestation or
the requirement that signed-in participants save their own consent. Privacy and
account deletion were moved directly beneath identity in the real Account UX.

## Exact-source evidence

The committed-source runner materialized the five-screen set from an isolated
worktree at the exact source commit above:

- evidence root:
  `/tmp/quipsly-capture-app-store-drafts/543180f4085b/20260801T194254Z-68812`
- screenshot directory:
  `/tmp/quipsly-capture-app-store-drafts/543180f4085b/20260801T194254Z-68812/screenshots`
- draft receipt:
  `/tmp/quipsly-capture-app-store-drafts/543180f4085b/20260801T194254Z-68812/draft-receipt.json`
- committed-source receipt:
  `/tmp/quipsly-capture-app-store-drafts/543180f4085b/20260801T194254Z-68812/committed-source-receipt.json`

The Record and Account frames were visually sampled again from this exact
committed-source run after the complete five-screen UI journey passed.

## Gates

- App Store/capture static smoke: `949/949` passed.
- Dedicated App Store screenshot UI journey: passed and exported five images.
- Swift compilation exercised by the screenshot UI run: passed.
- `git diff --check`: passed before commit.
- Human visual audit of all five draft frames: passed.

## Boundary still held

These are layout and messaging drafts, not approved App Store assets. The
receipts intentionally keep `submissionEligible` false. Before any screenshot
is uploaded to App Store Connect, the same journey must be recaptured from the
exact signed candidate or TestFlight installation and approved by a human.

This checkpoint does not claim:

- installation or operation on a CoreDevice-visible physical iPhone;
- signed-candidate equivalence with public TestFlight Build 25;
- completed App Privacy or legal declarations;
- reviewer-visible end-to-end account-deletion completion proof; or
- approval to copy these files into the submission asset directory.

Build 25 remains the canonical public TestFlight target until a later candidate
passes those boundaries. No App Store Connect mutation was performed here.
