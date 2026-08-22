# Quipsly standard call candidate

Date: 2026-08-22
Status: Build 34 source-qualified; not uploaded or deployed

> Later working-tree note: browser hot-plug reconciliation and automatic
> resumable-upload recovery were implemented and locally tested after the
> source revision recorded below. They are not part of this qualified artifact
> and must ride a later exact-source Nest candidate.

> A subsequent working-tree slice also added source-bound transcript editing
> for private Session recording shares: multiple retained ranges, immutable
> transcript exclusion receipts, short click-safe joins, and a verified
> non-destructive renderer. It is locally tested but is not part of the Build
> 33 or Nest candidate identified below.

> A later invitation slice replaced the vertical acceptance page with one
> compact outer-room card, reduced host setup to email plus one action, and
> added exact-account accepted-link re-entry. The retained two-account local
> flight passed pending claim, repeat entry, LiveKit audio, chat, authoritative
> presence, removal denial, restoration, and restored re-entry. This remains
> later working-tree evidence, not part of the candidate identity below.

> Build 34 is now source-qualified. The committed source adds a shared
> host Record/Stop directive across browser and iPhone endpoints, explicit
> late-join confirmation, remembered one-time Session choices, and automatic
> all-party readiness refresh. A fresh local product flight passed the complete
> signup-to-revoke path, and the exact Build 34 archive and IPA passed the full
> deterministic release gate. Upload, deployed Nest proof, and physical-device
> acceptance remain independent gates.

## Product decision

The call path follows the conventions people already know from Meet, Zoom,
Teams, Riverside, and iOS:

- one calm green room before joining;
- current microphone and camera state visible beside the preview;
- one primary **Join call** action;
- mute, camera, and leave controls directly available during the call;
- device settings and sound check available but secondary;
- safe device and join-muted choices remembered on the same device;
- OS microphone and camera permission requested only when the user chooses the
  feature, then retained by the browser or iOS permission system;
- call participation remains separate from explicit recording and
  transcription consent.

Quipsly should be creative after this familiar threshold: participant-owned
high-quality sources, source-bound transcription, collaborative notes and
tasks, audio evidence, reversible editing, and post-call follow-through.

Research and the resulting design rules are recorded in
`docs/research/quipsly-standard-call-experience-2026-08-22.md`.

## Candidate identity

- Source revision:
  `120a9090ab3e1711a5e8f7e2643b874f82fde1ea`
- Branch: `codex/quipsly-coaching-20260819`
- Capture archive version: `1.0 (34)`
- Candidate run: `20260822T194114Z-7721`
- Candidate receipt:
  `/tmp/quipsly-capture-release/120a9090ab3e/20260822T194114Z-7721/QuipslyCapture-1.0.34-release-receipt.json`
- IPA SHA-256:
  `ab47395930752b54619fb05588f7ebc5e051df8738d33144901960b47ff35d5e`
- Upload attempted: no
- TestFlight assignment attempted: no

Build 33 remains the public TestFlight beta. Build 34 is a separately sealed
candidate and must be uploaded only through the receipt-bound
`upload-qualified` lane so provider distribution cannot drift from this tested
source and IPA hash.

## Green evidence

### Capture

- Complete offline preflight passed from a detached committed worktree.
- LiveKit dependencies resolved and the iOS simulator app built successfully.
- 69 deterministic operated UI tests passed across four reset simulator
  shards, including:
  - the standard call green room;
  - consent-needed Session entry without crashing;
  - explicit recording consent;
  - account-partitioned preflight and transcript outboxes;
  - coaching home, Session thread, post-call review, source evidence, calendar,
    video-quality, login, accessibility, and Share Extension journeys.
- App Store archive and export succeeded.
- App and Share Extension signatures, distribution profiles, entitlements,
  privacy manifests, background modes, iPhone-only metadata, and matching
  versions passed packaged-artifact inspection.
- Candidate receipt records `candidateQualified: true`,
  `deterministicUITestPerformed: true`, and every external distribution field
  as false/not attempted.

All four shards passed without a product-test failure. A prior candidate exposed
an iOS Simulator/SpringBoard notification-alert automation deadlock. Build 34
now keeps the shipping Apple notification path unchanged while the deterministic
release UI test proves contextual save, protected persistence, relaunch
recovery, and account partition through a simulator-only notification boundary;
the scheduler harness separately proves one contextual authorization request.

### Nest

- The manifest-bounded committed release context contains 2,065 files and is
  121.8 MiB, below the 300 MiB hard limit.
- The exact Session recording-evidence suite passed 66/66.
- Prisma 7.7.0 generation passed.
- The strict Next.js 16.2.7 optimized production build completed with
  TypeScript checking and all 194 static pages generated.
- Retired owner-override and release-script safety checks passed.

## Release gates still open

These checks are intentionally independent. None may be inferred from the
green simulator or build evidence.

1. Refresh Google Cloud authentication. The Nest preflight could not mint an
   access token or inspect Cloud Run, logging exclusions, or media access. It
   was interrupted when `gcloud` requested an interactive password.
2. Upload the sealed Build 34 candidate through its qualified receipt, wait for
   App Store processing, assign the intended TestFlight group, and verify the
   resulting build identity before changing the canonical public target.
3. Deploy the same committed Nest source to a zero-traffic preview, complete
   authenticated preview smoke, and promote only its immutable revision.
4. Install the new TestFlight build on a physical iPhone and prove the standard
   lobby, remembered join-muted choice, microphone/camera permission retention,
   join, mute, camera, leave, reconnect, backgrounding, and crash-free reopen.
   On the browser side, unplug and reconnect the selected USB microphone,
   camera, and headphones before and during a call; confirm the actual media
   route matches the UI, the call fails closed when a retained source is
   locked, and the preferred studio setup survives automatic fallback.
5. Complete a two-person iPhone/browser call using ordinary accounts and an
   ordinary product-created invitation.
6. Record real local audio and video at both ends, verify upload and immutable
   source readback, inspect sync evidence, and play the assembled result.
7. Generate, correct, and read back a speaker-attributed transcript; create and
   share reviewed notes, tasks, goals, and a light edit.
8. Run fresh-coach/client negative isolation checks and minimally instructed
   human acceptance. Automation must not be reported as novice-human proof.

## Release cadence

Keep Build 33 public while Build 34 is qualified and the matching Nest preview
is deployed. Do not change the canonical public release target until Build 34
is uploaded, assigned, approved, and its installation page is directly
verified. This preserves momentum without turning every small change into
tester churn.
