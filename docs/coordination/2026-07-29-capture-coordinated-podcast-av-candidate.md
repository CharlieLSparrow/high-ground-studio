# Quipsly Capture Coordinated Podcast A/V Candidate

Date: 2026-07-29

## Exact source

- Branch: `codex/quipsly-product-20260724`
- Current iPhone candidate checkpoint: `14070670`
- Feature commit: `5920e525`
- Commit subject:
  `feat(capture): coordinate local podcast audio and video`
- Editor-handoff commit: `d1dc98aa`
- Commit subject:
  `feat(capture): preserve grouped editor alignment`
- Native Episode Watch commit: `96eebffc`
- Commit subject:
  `feat(capture): add shared episode watch`
- Watch route-loss safety commit: `7dc8cdab`
- Protected-download management commit: `0aab884e`
- Native editor-sync commit: `73fd92f2`
- Exact episode-editor handoff commit: `5b456ec0`
- Protected-transport confinement commit: `b33a1ec5`
- Immediate shared-Pause reachability commit: `34811d16`
- Reverse route-transition guard commit: `45c7cdb1`
- Shared clip-selector commit: `ecec25e8`
- AVPlayer readiness gate commit: `3533af94`
- Fatal shared-playback recovery commit: `14070670`
- App Store version/build in source: `1.0 (8)`
- Release decision: do not upload or assign this feature as Build 9 until its
  physical-iPhone gate is complete. Build 8 remains the honest external
  rehearsal lane.

## Product outcome

The iPhone Record surface now has four explicit source modes:

1. **Audio** — one local microphone master; may coexist with LiveKit.
2. **Podcast audio + video** — separate AAC microphone and video-only MOV
   masters under one capture-group identity; may coexist with LiveKit.
3. **Solo video** — one camera-and-microphone MOV; LiveKit is blocked.
4. **Podcast camera** — one video-only MOV beside LiveKit or another audio
   recorder.

Podcast A/V uses one visible Start/Stop action but never hides the two source
identities. Each source has its own UUID, durable START/STOP boundary,
server-clock burst, monotonic clock, file, recovery state, upload job, and
editor lane. The sources share only the capture-group identity and Session
authority. Final synchronization remains a clock/waveform proposal that a
human reviews.

Pause closes and validates the current movie boundary before calling the group
paused. Resume starts the camera first, waits for AVFoundation's delegate
confirmation, and then resumes audio. Flip leaves the microphone master
running while it closes the current movie and opens the other camera as a new
video source in the same group.

The app observes camera-session interruptions and runtime errors, closes
recoverable fragments, and never silently restarts or claims continuity. A
partial startup or unexpected source ending closes and preserves its partner.
Provider join, leave, mute, and route controls remain locked while the
audio-bearing group is active.

## Upload and editor handoff

Released mobile finalization now preserves the exact source UUID,
capture-group UUID, durable START receipt, and review-only clock proposal on
the canonical `RecordingAsset` before any optional Episode Production
projection. A recording can therefore be attached to an episode later without
losing the provenance required to place it.

Every arriving source recomputes grouped proposals across canonical
`StudioEpisodeProduction.productionJson.importedMedia`. The audio and video
rows retain independent immutable identities and begin times while exposing
one baseline recording, one estimated group offset per source, and the current
proposal source count. The same proposal is present in both metadata and sync
packets so Episode Room and the deep editor read one contract.

The generic/manual recording-promotion path now preserves the same take,
source-profile, segment, checksum, storage-generation, and alignment evidence.
It accepts only the explicit review-safe proposal contract:

- no sample-accurate claim;
- waveform correlation required;
- drift review required; and
- human approval required.

Malformed alignment metadata is omitted rather than promoted into the editor.
No source bytes are mutated and no proposal is automatically locked to the
timeline.

## Privacy and pipeline corrections

- The bundled privacy manifest now declares Apple's specific
  `NSPrivacyCollectedDataTypePhotosorVideos` category as linked,
  non-tracking, app-functionality data.
- The LiveKit simulator validator now uses an explicit disposable DerivedData
  path instead of silently growing a developer's global Xcode cache.
- The default mobile preflight runs the coordinated-capture contract.

## Verified evidence

- `scripts/quipsly-mobile-capture-preflight.sh`: passed end to end.
- Quipsly TypeScript: passed.
- Privacy manifest lint: passed.
- App Store static gate: **721/721**.
- Coordinated podcast capture contract: **20/20**.
- Capture durability contract: **73/73**.
- Account isolation contract: **15/15**.
- Universal iOS simulator build with LiveKit and Google dependencies: passed
  for the canonical simulator architectures.
- Deterministic UI test:
  `CaptureExperienceUITests.testVideoModesExplainAndExposeTheExactLocalSourceBeforeCameraPermission`:
  passed on the booted iPhone 16e simulator.
- Grouped upload/editor handoff: **43/43** focused server/editor tests passed.
- Capture finalization integrity: passed with durable alignment-before-episode
  ordering.
- Native shared Watch static contract: **23/23**.
- Native Watch UI test:
  `CaptureExperienceUITests.testEpisodeWatchStagesLeadClipWithoutInventingRecordingOrSharedMutation`:
  passed on the iPhone 16e simulator.

The UI test proves that the four-mode picker is reachable and that Podcast A/V
shows the separate microphone status and two-source truth before asking for a
camera permission. A simulator cannot prove real simultaneous camera,
microphone, route, LiveKit, thermal, or storage behavior.

The local Docker engine was non-responsive during the follow-up database-smoke
attempt. The bounded Quipsly launch jobs were stopped cleanly; no production
service or data was changed. The database-backed replay remains a physical
rehearsal/supporting pipeline check, not a substitute for the iPhone gate.

## Isolated cloud preview

The exact checkpoint commit `cd9c3a9091fd31db8e5d599b7090703ded1ce4b3`
materialized a bounded 110.5 MiB release context and built immutable image
`preview-20260729-024522` in Cloud Build
`09e84ffb-9ec9-413d-800b-b1953dac4afc`. Required route bundles were verified
inside the image. Cloud Run revision `studio-00427-meb` is ready behind the
`quipsly-preview` tag and receives **0%** of production traffic.

The first preview smoke failed closed because production Cloud SQL was missing
the committed additive migration
`20260728223500_add_document_tags`. A SHA-pinned, status-only schema job proved
that this was the only pending migration. `prisma migrate deploy` then applied
that exact migration through execution `quipsly-schema-migrate-j88bp`; a fresh
status job completed successfully. The legacy
`prisma db push --accept-data-loss` bridge was not used.

After schema repair, the preview passed:

- the full signed release smoke across public, signed-out, and signed-in
  routes;
- Firebase login and native session verification;
- Nest, writing, editor, recorder, research, and publishing journeys;
- production database-backed Session and episode reads;
- both configured public-host health checks;
- the authenticated mobile Capture contract at **144/144**; and
- the Capture reviewer Session/consent/provider/readiness lifecycle.

Production remains healthy and pinned 100% to `studio-00425-gij`. Promotion of
`studio-00427-meb` is deliberately separate from this preview proof.

The later native-Watch checkpoint
`96eebffc27bc1bae2b1789b0f0adb27d70bd3987` built successfully in Cloud Build
`2165f581-a1f3-4ecc-97f3-9c94494fd3ad` as tag
`preview-96eebffc-20260729`. Cloud Run revision `studio-00428-cef` is ready
behind `quipsly-preview` at **0%** production traffic. Its full signed preview
smoke passed, including Firebase login, the native session check, authenticated
Nest/Capture/database journeys, logout, and configured public-host health.

The read-only native-Watch release proof then used only Firebase bearer GETs
against the real rehearsal:

- unauthenticated Watch and protected Be Curious media: HTTP 401;
- authenticated Watch and media: HTTP 200;
- exact clip order: Be Curious, Lucy, then Samwise;
- Be Curious selected and paused at revision 5;
- no Watch session, active segment, or watched segment;
- exact protected source: 19,100,059 bytes, SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
- no direct database access, room mutation, consent, recording start, or
  provider join.

The redacted, mode-0600 receipt was written outside the repository at
`/private/tmp/quipsly-watch-preview-96eebffc-receipt.json`. Production remains
100% on `studio-00425-gij`; the newer preview is also intentionally unpromoted.

The exact local Be Curious source was also fully decoded with FFmpeg's
fail-on-error path at 10:48 UTC. Its H.264 Main 1280×638 video and AAC-LC
stereo audio both start at zero, the 254.630-second container produced no
decode errors, and the file still matches the protected object byte count and
SHA-256 above.

At 10:55 UTC, the native bearer verifier was upgraded and rerun to stream all
three protected rehearsal sources, not just the lead. Each source returned 401
without credentials and 200 with the short-lived Firebase bearer, and every
stream matched its pinned local byte count and SHA-256. Lucy and Samwise also
completed full local FFmpeg decode with zero errors. The room remained
revision 5, paused, with Be Curious selected and no session or watched spans.
The new redacted v2 receipt is
`/private/tmp/quipsly-watch-preview-96eebffc-all-media-receipt.json`, mode
0600.

After that exact server proof, the iPhone candidate was hardened without
changing the deployed Watch API:

- losing a private listening route now issues one revision-safe Pause for
  everyone instead of allowing another participant to keep advancing;
- private preview route loss remains local-only;
- prepared Watch downloads have an explicit local removal control and signing
  out purges the derived cache without touching canonical Nest media;
- closed receipt-backed spans can be sent explicitly to the non-destructive
  editor lane only while playback is paused;
- a current sync is visible, cannot be repeated accidentally, and links to the
  exact project/episode editor.
- either editor can select the next episode clip from Capture while the shared
  clock is paused; Be Curious remains the preselected first rehearsal source;
- protected playback URLs and episode paths are confined to the configured
  Nest origin and strict path-segment identities;
- Play is withheld until `AVPlayerItem` confirms the downloaded source is
  actually decodable; and
- a fatal decoder failure removes the unusable copy and pauses the shared
  clock for everyone when that collaborator has editor authority.

The native Watch contract is now **37/37**. The full mobile preflight, strict
TypeScript, privacy/App Store static gates, and LiveKit-linked universal iOS
simulator build all pass at `14070670`. These checks harden the candidate but
do not replace the physical-iPhone gate.

## Current external TestFlight readback

Read-only App Store Connect API evidence at
`2026-07-29T08:44:24.880Z` confirms:

- version/build `1.0 (8)` is still assigned to
  `Quipsly Capture Rehearsal`;
- the intended external tester is still assigned;
- email auto-notify and beta localizations are ready;
- external build state is `WAITING_FOR_BETA_REVIEW`; and
- beta review state is `WAITING_FOR_REVIEW`.

No App Store Connect mutation was needed or made.

## Physical-iPhone gate

Do not call this production-qualified until one real iPhone proves:

1. Join the exact Nest-issued LiveKit Session with headphones.
2. Prepare Podcast A/V and read back the actual microphone route and camera
   profile.
3. Start once and confirm the app claims two-source recording only after both
   sources are active.
4. Speak while viewing remote-room audio; verify no provider disconnect or
   route theft.
5. Mark, pause, resume, and Flip front/back while audio remains continuous
   across the camera boundary.
6. Stop and play every local source from Library.
7. Verify distinct audio/video source UUIDs and one shared capture-group UUID.
8. Verify START/STOP receipts, upload jobs, exact cloud verification, relaunch
   recovery, and preservation of local originals.
9. Import the sources into the Episode timeline, review clock placement and
   waveform sync, and audition the assembled result.
10. Exercise backgrounding, route loss, camera interruption, constrained
    storage, and a warm-device stop without accepting a false success state.

Only after that gate should the release lane bump to Build 9, create an archive
from an exact committed SHA, verify the IPA/privacy/entitlements/source
receipt, upload it, and deliberately assign it to the external rehearsal group.

## Architecture

The full implementation and acceptance contract is
[`../quipsly/ios-coordinated-podcast-capture.md`](../quipsly/ios-coordinated-podcast-capture.md).

Apple boundaries used by the design:

- [AVAudioSession playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord)
- [AVAudioSession voiceChat](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat)
- [AVCaptureMovieFileOutput](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput)
- [AVCaptureSession runtime errors](https://developer.apple.com/documentation/avfoundation/avcapturesession/runtimeerrornotification)
- [App privacy data types](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype)
