# Quipsly standard call candidate

Date: 2026-08-22
Status: source-qualified; not uploaded or deployed

> Later working-tree note: browser hot-plug reconciliation and automatic
> resumable-upload recovery were implemented and locally tested after the
> source revision recorded below. They are not part of this qualified artifact
> and must ride a later exact-source Nest candidate.

> A subsequent working-tree slice also added source-bound transcript editing
> for private Session recording shares: multiple retained ranges, immutable
> transcript exclusion receipts, short click-safe joins, and a verified
> non-destructive renderer. It is locally tested but is not part of the Build
> 33 or Nest candidate identified below.

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
  `739696687c2315e2407c2e99006f2a482043c1f8`
- Branch: `codex/quipsly-coaching-20260819`
- Capture archive version: `1.0 (33)`
- Candidate run: `20260822T094920Z-65661`
- Candidate receipt:
  `/tmp/quipsly-capture-release/739696687c23/20260822T094920Z-65661/QuipslyCapture-1.0.33-release-receipt.json`
- IPA SHA-256:
  `98ecba2c3b653eb59ea3cfb49de65cc8cdf7e50a5adaadc97181d0a7f82d11ba`
- Upload attempted: no
- TestFlight assignment attempted: no

Build 33 is already the public TestFlight beta from source
`b84e75f8608455247c7083b933c15be645d67e8d`. This differently sourced IPA
must never be uploaded as another Build 33. The next deliberate Capture release
must increment the committed build number to 34 or later and rerun candidate
qualification from that exact release commit.

## Green evidence

### Capture

- Complete offline preflight passed from a detached committed worktree.
- LiveKit dependencies resolved and the iOS simulator app built successfully.
- 68 deterministic operated UI tests passed across four reset simulator
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

One largest-text rehearsal accessibility audit reported text clipping on its
first attempt and passed the lane's single recorded retry. The result is green
under the declared retry policy, but the incident remains flaky evidence to
watch rather than a claim of a perfectly clean first pass.

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
2. Increment the committed iOS build number and rerun the source-isolated
   Capture candidate lane.
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

Keep Build 33 public while useful work is bundled. Qualify source candidates as
often as needed, but create Build 34 only when the matching Nest preview and the
physical call plan are ready. This preserves momentum without turning every
small change into tester churn.
