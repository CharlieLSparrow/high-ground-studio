# High Ground Odyssey TestFlight Rehearsal

Last verified: 2026-08-30

This is the operator runbook for the first Charlie-and-Homer Quipsly Capture
rehearsal. It distinguishes what is ready now from what the rehearsal still
needs to prove.

## Current release state

- App: **Quipsly Capture 1.0 (58)**
- Exact native source:
  `1e3d8f6e1befb67679ff3df4fff959008a0b1367`
- App Store Connect build ID: `97819668-03dd-4bb8-b711-972acbcb25e5`
- External TestFlight group: **Quipsly Capture Rehearsal**
- TestFlight Apple Account: `shomers@icloud.com`
- Quipsly Google identity: `shomers@gmail.com`
- Apple state: `IN_BETA_TESTING` / `APPROVED`
- Public installation link:
  `https://testflight.apple.com/join/XwRRcYUm`
- Public-link capacity: limited to 100 testers
- Automatic tester notification: enabled
- Installation mode: public-link-only; neither a named-tester email nor a
  redemption code is required
- Build 58 is the current approved public beta identified by the canonical
  release ledger and Apple readback. It supersedes Build 55, whose Sessions and
  Speak to Write entries could exhaust the physical iPhone main-thread stack
  while SwiftUI constructed one oversized recorder view. Build 58 preserves the
  same features but places the recorder behind bounded view-type sections.
  All four deterministic UI shards passed all 106 journeys with zero failures,
  including both affected entries, recording, consent, voice writing, maximum
  accessibility text, post-call editing, and Share. The exact signed archive
  and IPA passed packaged metadata, entitlement, provisioning, privacy-manifest,
  and nested-signature inspection before upload. App Store Connect independently
  reports `VALID`, `IN_BETA_TESTING`, `APPROVED`, and inclusion in the external
  rehearsal group; Apple's public installation page and TestFlight handoff are
  open. A physical Build 58 install remains the final crash-fix acceptance proof.
- Build 28 passed all 63 serialized iPhone and Share Extension journeys,
  exact-source preflight, signed archive/export inspection, Apple processing,
  external beta review, external-group readback, and an anonymous HTTP 200 read
  of Apple's page naming **Quipsly Capture**. This does not claim a physical
  install or recording. It contains the Episode-workspace crash correction;
  physical Episode 9 acceptance remains required.
- Private Nest:
  `https://nest.quipsly.com/nests/high-ground-odyssey-rehearsal/episodes/testflight-rehearsal`
- Session: **High Ground Odyssey TestFlight Rehearsal**
- Session state: planned, LiveKit configured, Charlie and Homer assigned
- Consent state: requested for both people; neither receipt has been granted on
  anyone's behalf
- Episode writing: **The Swear Jar**, exact 34-block private import
- Shared Watch order:
  1. `Ted Lasso Be Curious.mp4`
  2. `I love lucy.mp4`
  3. `LOTR Ring Back.mp4`
- Lead clip: **Ted Lasso Be Curious**, selected and paused
- 2026-07-29 authenticated media readback: all three production objects match
  the current local files byte-for-byte; unauthenticated playback returns
  HTTP 401. Be Curious remains first, selected, paused, with zero watched
  segments and no started rehearsal session.
- The 09:28 UTC idempotent production staging pass made no content or room
  changes. The selected Be Curious object returned the exact 19,100,059 local
  bytes at SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
  the exact 34-block manuscript and all three Watch sources passed again.
- The 10:19 UTC **native bearer-only** proof passed against zero-traffic Cloud
  Run preview `studio-00428-cef`, exact source
  `96eebffc27bc1bae2b1789b0f0adb27d70bd3987`. The Watch projection and Be
  Curious media both returned HTTP 401 without credentials and HTTP 200 with
  the short-lived Firebase bearer. The preview returned revision 5, the exact
  three-clip order above, Be Curious selected and paused, no started Watch
  session, no active or closed segment, and the exact 19,100,059-byte source at
  the SHA-256 above. The verifier issued GET requests only.
- The 10:48 UTC local source qualification decoded the complete Be Curious
  file with FFmpeg's fail-on-error path. It is an MP4 with H.264 Main
  1280×638 video at 24000/1001 fps and AAC-LC 44.1 kHz stereo audio; both
  streams begin at 0, the container is 254.630 seconds, and full video/audio
  decode completed with no errors. Its 19,100,059 bytes still hash to the
  exact protected-cloud SHA-256 above.
- At 10:55 UTC, the upgraded native bearer-only verifier streamed **all three**
  protected sources from the same exact preview revision. Every source denied
  an outsider with HTTP 401, returned HTTP 200 to the short-lived Firebase
  bearer, and matched its local byte count and SHA-256:
  - Be Curious: 19,100,059 bytes,
    `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`
  - Lucy: 10,880,177 bytes,
    `7ea7a14735b99cd6e4c5b4c35aecfb97a97df04a7c6f7ba61cf9d3623bcc8078`
  - Samwise: 28,459,489 bytes,
    `0cd069b802ff719859673878061d63daee89dd7743a245c360a0f05d857d08bf`
  The room remained revision 5 and paused, with Be Curious first and selected,
  no started Watch session, and no watched spans. The receipt is
  `/private/tmp/quipsly-watch-preview-96eebffc-all-media-receipt.json`, mode
  0600.
- At 10:57 UTC, the read-only production identity rehearsal found Homer's
  canonical Quipsly user, active free membership, editor grant, invite ledger,
  room participant, and REQUESTED consent already present; it proposed zero
  repairs. `shomers@gmail.com` is intentionally not Firebase-linked until
  Homer completes **Continue with Google** once. That verified Google subject
  is transactionally attached to the existing Quipsly user by email, so Homer
  should not use password signup and does not need a Quipsly verification
  email. The redacted receipt is
  `/private/tmp/quipsly-capture-rehearsal/homer-identity-readback.json`, mode
  0600.
- Build 14's exact source contains the native **Continue with Google** surface,
  the Quipsly iOS OAuth client ID, and its registered callback scheme. On
  2026-07-30, an operated current-source simulator journey tapped that real
  button, confirmed Apple's protected prompt identified `google.com`, selected
  **Continue**, and reached Google's page identifying **Quipsly** as the OAuth
  audience. No provider account or credential was entered. The matching
  opt-in XCUITest passed 1/1 through the protected-provider handoff and stores
  no reviewer password. This proves the app-to-Google boundary; only Scott's
  action on his physical iPhone can link `shomers@gmail.com` to his existing
  Quipsly user.
- At 11:49 UTC, zero-traffic preview `studio-00429-niv` proved the complete
  read-only native rehearsal boundary from exact deployed source
  `8fa86d46977074f90386663fae92ea2fe0166167`. An outsider received HTTP 401
  for the canonical manuscript, Watch projection, and every protected media
  object. The authenticated projection returned all 34 canonical blocks,
  unique stable IDs, ascending orders, every body, and the exact first heading
  `**THE SWEAR JAR**`. A second request with the same opaque writing version
  returned metadata only instead of retransmitting the script. All three
  protected videos again matched their pinned local bytes and SHA-256 values.
  Watch remained revision 5, selected on Be Curious, paused at zero, with no
  session, active segment, watched span, recording, consent mutation, or
  provider join. The GET-only receipt is
  `/private/tmp/quipsly-native-rehearsal-preview-8fa86d46-receipt.json`, mode
  0600.
- At 13:50 UTC, the same GET-only proof passed against the newest
  zero-traffic preview `studio-00430-fop`, exact source
  `1ac5bd3d441a07938239f2073add2f6e2ed0a0eb`. All 34 manuscript blocks and
  all three protected clip byte counts and hashes still match. Watch remains
  revision 5, paused at zero, with Be Curious first and selected, no session,
  no active segment, and no watched segment. The redacted mode-0600 receipt is
  `/private/tmp/quipsly-watch-preview-1ac5bd3d-current-receipt.json`.
- At 14:00 UTC, the final Chrome security-check download was read back from
  disk. `Ted Lasso Be Curious.mp4` is complete rather than a partial browser
  file and still probes as 254.630 seconds of H.264 1280×638 video plus AAC
  44.1 kHz stereo audio. It is still exactly 19,100,059 bytes at SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`.
  Lucy and Samwise also probe cleanly, and no `.crdownload`, `.download`, or
  `.part` file remains.
- At 17:56 UTC, a fresh production generated-invite rehearsal targeted the
  exact `high-ground-odyssey-rehearsal` Nest. A disposable verified Firebase
  identity began with no Quipsly UID binding, then passed Firebase login,
  server-side just-in-time identity attachment, native session check, invite
  acceptance, protected project access, Home Nest creation, account switching,
  editor/recorder/research/publishing reachability, logout, and cookie
  clearing. Independent cleanup removed the generated invite, grants, Home
  Nest, membership, Quipsly user, Firebase user, token file, proxy, and
  work directory. The rehearsal state was then read back unchanged: Scott's
  canonical Quipsly user, editor grant, membership, participant, and REQUESTED
  consent remain ready; Firebase still has no `shomers@gmail.com` credential,
  which is the expected state until he chooses **Continue with Google**.
- That proof no longer relies on an undeclared developer-machine Firebase key.
  `pnpm quipsly:auth:invited-user-smoke` validates its target, reads the public
  client configuration from the exact Nest origin without printing it, uses a
  private lifecycle-owned work directory, waits for its owned Cloud SQL proxy,
  and cleans the complete process boundary on success or failure.
- At 17:58 UTC, the consolidated live rehearsal preflight passed all ten
  infrastructure checks against current providers. It read back Build 14 in
  beta testing, the open public handoff, exact deployed Nest source
  `a2d8835353c372e2cb528b661c28752b61cc492c`, Scott's ready just-in-time
  Google-link state, the two-person Room, both REQUESTED consent rows, all 34
  manuscript blocks, Be Curious selected and paused at Watch revision 5, all
  three protected media objects, and the one canonical signed Mac bundle.
  `readyToBeginHumanRehearsal` is true while `readyToRecordNow` correctly
  remains false. The redacted receipt is
  `/private/tmp/quipsly-hgo-rehearsal-preflight-20260730-1758.json`, mode 0600.
- The `pnpm quipsly:capture:rehearsal-preflight -- --output ...` entry point now
  accepts pnpm's conventional argument separator instead of rejecting it
  before the readback. The focused CLI/receipt suite passes 6/6.

## Approved Build 23 rehearsal lane

Build 23 supersedes Build 22 for every new install and rehearsal. It carries
the matching native client for longitudinal coaching continuity: a coach can
deliberately reveal a saved private brief from the exact earlier Session when
canonical project and purpose match, then open that source Session. It does not
copy the brief, infer a relationship from titles, create work, invoke AI, or
claim a physical recording result. It also preserves Build 22's podcast
audio/video, Shared Watch, manuscript, Episode thread, Work, Google identity,
tagging, recovery, and explicit consent/call/recording separation.

Exact detached source `949139db3b2aca69b63414bd6874e4212c2f7ebc`
passed all 47 serialized iPhone and Share Extension journeys twice with zero
failures: once as a no-upload candidate and once in the upload-bound lane. The
upload-bound IPA is 21,343,893 bytes at SHA-256
`13deeb865879b1c0e03011aa20131bcb280fa534ff8130bde1131e05efa6cf85`.
Strict inspection passed for app and Share Extension signatures, provisioning,
entitlements, privacy manifests, camera/microphone descriptions, background
modes, encryption declaration, and matching version/build.

Independent App Store Connect readback reports:

- build ID `f62118c4-032e-42a5-8756-eea73165a5b0`;
- processing state `VALID` and external state `IN_BETA_TESTING`;
- beta review state `APPROVED`;
- Build 23 included in **Quipsly Capture Rehearsal** through the exact group
  relationship endpoint;
- complete beta metadata, automatic notification, and open public-link
  capacity for 100 testers;
- the anonymous Apple page exposes the exact Quipsly title, beta heading, and
  `itms-beta` handoff.

Production Nest serves the matching continuity backend from exact source
`0ec3986468d3121176b828e0bc13969e066047cb` at `studio-00474-gel`, immutable
runtime image digest
`sha256:a30e76a747ceb4f039f3702a3e4c8896b60ab95108b8a89d307fab83e512085e`.
Zero-traffic authenticated operation, guarded promotion, independent generated
reviewer cleanup, public-route checks, and all 111 production mobile Capture
contract checks passed before Build 23 distribution.

The release receipt still records no physical TestFlight install. Apple
processing, approval, group assignment, and public-link readback do not prove
a physical iPhone install, interruption recovery, or a real two-person
recording.

## Historical Build 22 rehearsal lane

Build 22 supersedes Build 20 for every new install and rehearsal. It preserves
the coordinated podcast audio/video, protected Shared Watch, manuscript,
Episode thread, source evidence, canonical tag focus, Work, Google identity,
and recovery behavior from the prior public release. It additionally lands a
newly created Session directly on its recorder and preserves the explicit
consent/call/recording separation.

Exact detached source `34354101340bca41f31ff576393a6aea841befe3`
passed all 47 serialized iPhone and Share Extension journeys with zero
failures. The upload-bound IPA is 21,287,598 bytes at SHA-256
`61e00fdd5ef385cebcd44a3ce3aa3e28befbb954bef300025395f3e6ee59ae49`.
Strict inspection passed for the app and Share Extension signatures,
provisioning, entitlements, privacy manifests, camera/microphone descriptions,
background modes, encryption declaration, and matching version/build.

Independent App Store Connect readback reports:

- build ID `81160b86-95c7-44b2-8cc9-4c29a7335929`;
- processing state `VALID`;
- internal and external state `IN_BETA_TESTING`;
- beta review state `APPROVED`;
- Build 22 included in **Quipsly Capture Internal** and
  **Quipsly Capture Rehearsal**;
- complete beta metadata, automatic notification, and open public-link
  capacity for 100 testers;
- the uncached public page exposes the exact Quipsly title, beta heading, and
  `itms-beta` handoff.

Production Nest serves the matching backend contract from exact source
`12c97cbdfe8bfd19b74c557f7fba04dd935f5a23` at `studio-00472-wey`, immutable
runtime image digest
`sha256:8d757ae0f6259ba39cbe5adfcde92d475b11f96316d9bbbfb711e60e0b3374c4`.
The guarded schema lane, zero-traffic authenticated acceptance, promotion,
and post-promotion Capture contract all passed before Build 22 distribution.

The release receipt still records no physical TestFlight install. Apple
processing, approval, group assignment, and public-link readback do not prove
a physical iPhone install or a real two-person recording.

## Historical Build 20 rehearsal lane

Build 20 supersedes Build 19 for every new install and rehearsal. It preserves
the coordinated podcast audio/video, protected Shared Watch, manuscript,
source evidence, canonical tag focus, Work, Google identity, and recovery
behavior qualified in earlier builds. It adds the canonical Episode Room
conversation beside Manuscript and Watch in an episode-bound recorder session.
Opening the thread does not start recording or playback; Editor posts use
stable retry identity and the offline copy is read-only and account protected.

Exact detached source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f`
passed all 46 serialized iPhone and Share Extension journeys with zero
failures and produced the exact upload-bound 21,027,646-byte IPA at SHA-256
`20c4b689ffae7a50396f4ef31202395081367d1ac45ca3884ecb4137aee64502`.

Independent App Store Connect readback reported:

- build ID `34176ece-cbb8-4e64-9440-dc0a3e02ae77`;
- processing state `VALID`;
- external state `IN_BETA_TESTING`;
- beta review state `APPROVED`;
- Build 20 included in **Quipsly Capture Rehearsal**;
- complete beta metadata, automatic notification, and open public-link
  capacity for 100 testers;
- the uncached public page exposes the exact Quipsly title, beta heading, and
  `itms-beta` handoff.

Production Nest runs the matching product slice from exact source
`d410e03e14ed723ff4b1f66c50e1c620ab65cb9f` at `studio-00470-has`, immutable
runtime image digest
`sha256:5f2a5b2381ba2523bcfb1c0898873ce1c4e8a1ddbb5757cdf749d71fc7e38fad`.
The zero-traffic preview passed authenticated smoke before promotion.
Post-promotion recovery, billing, SQL, domain, public-page, and 108-check
mobile-contract readbacks pass against the exact production revision.

The transcript provider remains deliberately held. Production has no provider
environment or transcript worker Job; the reserved Deepgram secret resource
has zero versions.

The release receipt still records no physical TestFlight install. Apple
processing, approval, group assignment, and public-link readback do not prove
a physical iPhone install or a real two-person recording.

## Historical Build 19 rehearsal lane

Build 19 remains the rollback record for exact saved Media Vault range
playback. New installs and rehearsals use Build 23.

## Historical Build 18 rehearsal lane

Build 18 remains the rollback record for exact canonical tag focus across
iPhone Work and Nest.

## Historical Build 17 rehearsal lane

Build 17 remains the rollback record for deliberate iPhone authoring of the
canonical Nest tag vocabulary.

## Historical Build 16 rehearsal lane

Build 16 supersedes Build 15 for every new install and rehearsal. It adds
native management of the same canonical project vocabulary used by Nest:
Owners and Editors can search aliases, inspect assignment impact, rename,
archive, and restore tags from iPhone Work. Existing assignments survive
rename and archive; shared vocabulary mutations require a live optimistic
revision and never masquerade as an offline record edit. Higher-impact merges
remain in Nest's audited impact/history/rollback manager.

Exact detached source `356f6d821eafac018c5116cb4d888425c442cf42`
passed all 45 serialized iPhone and Share Extension journeys and produced a
verified 20,866,985-byte IPA at SHA-256
`237cb1e8e286d06b23744d42a4d7193fec3f04b0edd4699fd2df47a6e00cf7ca`.

Independent App Store Connect readback reported:

- build ID `0c67b80d-0df3-4c48-9844-ba963202515d`;
- processing state `VALID`;
- external state `IN_BETA_TESTING`;
- beta review state `APPROVED`;
- Build 16 included in **Quipsly Capture Rehearsal**;
- complete beta metadata, automatic notification, and open public-link
  capacity for 100 testers;
- the uncached public page exposes the exact Quipsly title, beta heading, and
  `itms-beta` handoff.

Production Nest source matches this build at `studio-00458-xac`. A generated
verified reviewer operated its authenticated workspace/editor/recorder path
and the 108-check mobile contract before the exact revision received traffic.

The release receipt still records
`physicalTestFlightInstallReadbackPerformed: false`. Apple processing,
approval, group assignment, and public-link readback do not prove a physical
iPhone install or a real two-person recording.

## Historical Build 15 rehearsal lane

Build 15 supersedes Build 14 for every new install and rehearsal. It preserves
Build 14's complete coordinated-podcast, source-evidence, Work, and Google
identity lineage and adds the current production slices that had previously
existed only in source:

- complete capture-group Studio handoff across ready, partial/retry, and
  complete states;
- exact capture-group deep linking into Nest's guided waveform/drift sync
  review;
- current-pass Shared Watch materialization and explicit previous-pass
  clearing without requiring a local playback copy on this phone;
- canonical source filing and annotation with reusable Nest tags;
- privacy-bounded diagnostics before and after sign-in;
- reduced-motion and largest-accessibility-text repairs;
- removal of the unreachable prototype iPhone editor, exporter, publisher,
  sample timeline, and fabricated-success graph.

The exact detached source `c3e02a6e…` passed all 45 serialized iPhone UI
journeys after the release gate exposed and blocked one real source-filing UX
defect: the annotation keyboard covered the canonical tags with no explicit
dismissal. Build 15 adds a visible keyboard **Done** action, interactive
dismissal, and a test that proves the exact annotation survives before tag
selection. The corrected run then produced and verified the signed
`1.0 (15)` archive and IPA.

At 22:40 UTC, independent App Store Connect readback reported:

- build ID `5b1a9404-3c1d-45c7-9781-33d298ee2bca`;
- processing state `VALID`;
- external state `IN_BETA_TESTING`;
- beta review state `APPROVED`;
- Build 15 included in **Quipsly Capture Rehearsal**;
- complete beta metadata, automatic notification, and open public-link
  capacity for 100 testers;
- the uncached public page still exposes the exact Quipsly title, beta heading,
  and `itms-beta` handoff.

The signed receipt still records
`physicalTestFlightInstallReadbackPerformed: false`. Apple processing,
approval, group assignment, and public-link readback do not prove a physical
iPhone install or a real two-person recording.

## Historical Build 14 rehearsal lane

Build 14 carries the complete coordinated-podcast and source-evidence lineage
first qualified in Build 9, plus exact local-to-Nest evidence comparison and
canonical project creation from iPhone Work. It also keeps standalone audio
and video capture independent from Shared Watch's headphone requirement and
makes recurring-task authoring use a deterministic Settings-style picker. It
adds operated canonical project-note editing with protected offline decisions,
stale-conflict handling, stable block identity, and annotation-safe remapping.
It also includes the later one-time task and canonical goal editors that were
not distributed in Build 13. It is no longer an unuploaded candidate:

- the detached exact-source release passed 36/36 deterministic UI journeys,
  produced a signed archive, and verified the exported `1.0 (14)` IPA;
- App Store Connect identifies Build
  `b1da4da1-5c77-4ee1-b4bc-ce6213a7df97` as `VALID`;
- the external `Quipsly Capture Rehearsal` group contains Build 14;
- the 08:17 UTC read-only API plan reports `IN_BETA_TESTING` / `APPROVED`,
  complete beta metadata, automatic notification enabled, and zero pending
  provider mutations;
- the exact public page is open and exposes the Quipsly title, beta heading,
  and `itms-beta` TestFlight handoff.

During a Build 17 rehearsal, expect the same project creation, task
creation/completion and title/detail/due editing, goal
title/definition/target editing, project-note body editing, tags, notes, and
recurring-task controls, plus the Build 16 and Build 17 vocabulary additions above. The release still
requires physical-device readback; simulator and provider state do not prove
Scott installed or operated Build 17.

Historical Build 13 recovery: Fastlane's first upload handoff split the external-volume path at
`My Passport` and exited before transferring any bytes. App Store Connect
readback confirmed Build 13 was absent. The qualified IPA was then copied to a
space-free `/private/tmp` path, its SHA-256 was checked against both the
canonical artifact and receipt, and that byte-identical copy uploaded and
processed successfully. The pipeline now performs this verified temporary
staging automatically while preserving the canonical artifact on the release
volume.

Build 17's **Podcast audio + video** mode creates two immutable local masters
under one capture-group identity: a microphone AAC source and a video-only MOV
source. During a LiveKit call, LiveKit stays the single microphone hardware
owner and Quipsly records its already-owned local-input PCM instead of opening
a competing microphone client. The app waits for real PCM before claiming the
audio source started. Pause/Resume acts on both sources; Flip safely closes and
validates the current movie, starts the other camera in the same group, and
keeps the microphone source continuous.

The same build exposes the canonical **The Swear Jar** manuscript beside
Record, stages protected Episode Watch clips with revision-safe shared
Play/Pause/Seek, sends receipt-backed watched spans to the non-destructive
editor lane, and opens the assembled episode in Nest. **Before you record**
reconciles account, exact Session, consent, route, storage, camera profile,
manuscript, protected clip, headphones, and live-room readiness without
granting consent, joining, or starting capture.

Every completed source retains its app/build, iPhone/OS, route, capture-group,
room receipt, local hash, and verified cloud identity in an
owner-partitioned protected ledger. Library can prepare a redacted portable
receipt and **Compare with Nest** before the local upload job is retired.
Neither action deletes or overwrites the phone original.

The signed candidate receipt still says
`physicalTestFlightInstallReadbackPerformed: false`; Scott's installation and
the real two-account rehearsal below are the gates that can change that truth.
Provider readback receipts beside the artifact independently prove upload,
processing, internal assignment, external assignment, approval, and the open
public handoff.
Historical design and qualification evidence remains in:

- [`Coordinated podcast A/V candidate`](../coordination/2026-07-29-capture-coordinated-podcast-av-candidate.md)
- [`Build 9 qualification record`](../coordination/2026-07-29-capture-build-9-qualified-candidate.md)
- [`Build 11 qualification record`](../coordination/2026-07-29-capture-build-11-qualified-candidate.md)

Email delivery and App Store Connect team membership are not installation
gates. The enabled public external-testing link is the canonical path:

`https://testflight.apple.com/join/XwRRcYUm`

As a redundant internal path, Build 22 was distributed to internal testers
when the upload completed. The public link remains the canonical recovery path
when Apple's invitation email or TestFlight library refresh lags.

The public page briefly returned **This beta isn't accepting any new testers
right now** even though an approved build was assigned, the
group was enabled, and Apple's public-link metrics reported zero accepted
testers. The existing 10-person cap was raised to 100 and the link activation
was cycled off and back on without changing its ID. Fresh uncached iPhone and
desktop HTTP readback now returns **Join the Quipsly Capture beta**, the exact
Quipsly beta description, and the TestFlight handoff. Opening it on the iPhone
presents **Start Testing** and hands off to TestFlight without an invitation
email or redemption code.

Operators and release agents must verify that human-facing boundary directly,
not infer it from `publicLinkEnabled`:

```bash
pnpm quipsly:capture:testflight-public-link-readback \
  --output /private/tmp/quipsly-testflight-public-link-current.json
```

The verifier fails when Apple returns its generic closed page with HTTP 200 and
passes only when the exact Quipsly title, beta heading, and `itms-beta`
TestFlight handoff are all present. The optional receipt is mode 0600.

Apple's API also resolves the same exact tester into both **Quipsly Capture
Internal** and the approved **Quipsly Capture Rehearsal** external group.
Auto-notify is enabled and no assignment operation is missing. When that tester
remains `INVITED` but Apple does not deliver the message, inspect the exact
relationship first and resend only through the explicit recovery command:

```bash
pnpm quipsly:capture:testflight-resend-invitation -- \
  --tester-email shomers@icloud.com

pnpm quipsly:capture:testflight-resend-invitation -- \
  --tester-email shomers@icloud.com \
  --apply \
  --output /private/tmp/quipsly-testflight-resend-current.json
```

The first command is read-only. The second requires `--apply`, verifies the
tester belongs to this app through a TestFlight group, refuses accepted or
installed testers, sends exactly one Apple invitation, and writes a mode-0600
receipt containing only an email digest. A successful Apple HTTP 201 proves
that the provider accepted the resend; it does not prove mailbox delivery or
physical installation. On July 29, that exact resend returned HTTP 201 after
Apple had failed to deliver the original message.

At `2026-07-30T14:45:59Z`, Apple accepted another exact resend for Scott with
HTTP 201. The named tester still reported `INVITED` immediately beforehand.
The public link remained open with the exact Quipsly Capture title and
`itms-beta` handoff at `2026-07-30T14:46:07Z`. Continue to use the public link;
neither App Store Connect account acceptance nor a successful resend proves a
TestFlight installation.

The public-link route is intentionally anonymous. Do not wait for the named
email tester to change state before beginning the rehearsal. Instead, use the
external-group readback after the tester taps **Start Testing**:

```bash
pnpm quipsly:capture:app-store-readback -- \
  --group "Quipsly Capture Rehearsal" \
  --group-kind external \
  --expect-public-link-state ACCEPTED,INSTALLED
```

This command fails until Apple exposes at least one `PUBLIC_LINK` tester in
`ACCEPTED` or `INSTALLED`, then reports only aggregate invite types and states.
It never prints an anonymous tester's name or email. Apple may take time to
publish install/session metrics, so the physical iPhone's TestFlight and
installed-app version/build readback remains the immediate source of truth.

- [Apple: Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)
- [Apple: View and reinvite testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/view-and-manage-tester-information)
- [Apple: Beta tester invitations API](https://developer.apple.com/documentation/appstoreconnectapi/beta-tester-invitations)
- [Apple: TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)

## Message to send Homer

> We are testing Quipsly Capture. Apple has approved the external beta.
>
> 1. Install **TestFlight** from the App Store.
> 2. On the iPhone, open
>    `https://testflight.apple.com/join/XwRRcYUm` in Safari.
> 3. Tap **Start Testing**, open TestFlight, then accept and install
>    **Quipsly Capture**. Ignore the Redeem button; this path does not require
>    an email or code.
> 4. Open Quipsly Capture and tap **Continue with Google**.
> 5. Choose `shomers@gmail.com`. Do not create a password account and do not
>    wait for a Quipsly verification email; Google sign-in is the intended
>    path.
> 6. Allow microphone and camera access when iOS asks.
> 7. Open **Account**, expand **Help & diagnostics**, and share the support
>    snapshot with Charlie. It contains the app build and coarse device/runtime
>    state, but no email, account ID, session ID, source text, filename, path,
>    or credential.
> 8. Stop there if Charlie is not with you. We will choose the exact rehearsal
>    Session and make the recording-consent choices together.

The Apple Account signed into TestFlight is `shomers@icloud.com`; the Quipsly
account selected inside Capture is `shomers@gmail.com`. They identify Scott at
different provider boundaries and are intentionally not merged by email. The
public TestFlight link avoids the unreliable private-email invitation path
entirely.

The no-credential provider-boundary check can be repeated independently of the
signed-in runtime journeys:

```bash
QUIPSLY_CAPTURE_UI_TEST_MODE=google-handoff \
  QUIPSLY_CAPTURE_UI_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro' \
  bash apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh
```

It intentionally stops before selecting a Google account. It cannot prove
Scott's successful login or canonical Quipsly identity attachment.

If the public link does not hand off to TestFlight:

1. copy and paste the exact link into Safari on the iPhone;
2. confirm TestFlight is installed and signed into the intended Apple Account;
3. tap **Start Testing** and then **Open in TestFlight**;
4. report the exact Safari/TestFlight screen before changing accounts or
   entering a redemption code.

## USB-independent physical install readback

The support snapshot closes the recurring gap between “Apple says a tester is
installed” and “the exact public build is open on Homer's authenticated physical
iPhone.” Save the shared text without editing it, then run:

```bash
pnpm quipsly:capture:physical-install-readback -- \
  --snapshot /absolute/path/homer-quipsly-support.txt \
  --output /private/tmp/homer-quipsly-physical-install.json
```

The owner-only receipt requires a fresh Account-surface snapshot, exact
Quipsly Capture `1.0 (33)`, an `iPhone<model>,<variant>` hardware identifier,
iOS, production Nest, non-preview mode, online or verified offline account
access, and the exact privacy disclaimer. It fails on an email/private field,
wrong build, simulator, signed-out state, preview, stale timestamp, or missing
privacy boundary. It never retains the raw shared text.

This proves only physical installation plus Quipsly authentication. It
deliberately leaves consent, microphone/camera fidelity, front/back switching,
pause/resume, interruption and force-quit recovery, upload verification,
assembled playback, and timeline alignment unproved.

## Ten-minute preflight

From the exact product worktree, run the consolidated live readback first:

```bash
QUIPSLY_CAPTURE_IPHONE_SUPPORT_SNAPSHOT=/absolute/path/homer-quipsly-support.txt \
pnpm quipsly:capture:rehearsal-preflight \
  --output /private/tmp/quipsly-hgo-rehearsal-preflight-current.json
```

`infrastructureReady: true` proves the current Build 33/public-link boundary,
the exact private production Room, two participant records, just-in-time
Scott Google linking, the 34-block manuscript, all three protected Watch
objects, and the signed canonical Mac launcher. It intentionally leaves
`readyToRecordNow: false` until physical installation, both human consent
decisions, physically heard/seen device routes, a listened/watched disposable
take, the two-person room, and same-ID upload/timeline readback are separately
proved. The preflight verifies Charlie's saved device-bound Mac session before
it restarts the canonical app into bounded Capture Setup. Never edit that
receipt to make a human or physical gate green.

When the optional support snapshot is present, the preflight composes its
owner-only derivative receipt and can close only
`scottPhysicalInstallProven`. It still cannot make any recording, consent,
route, recovery, upload, playback, or two-person-room claim green.

Both people:

1. Use headphones to avoid speaker echo.
2. Charge the iPhone and leave at least 10 GB free for this first video test.
3. Turn off Low Power Mode.
4. Use stable Wi-Fi.
5. Open Quipsly Capture and confirm the Account surface shows the intended
   Google identity.
6. Open **Record** and choose **High Ground Odyssey TestFlight Rehearsal**.
7. Confirm the Session—not a similarly named old room—is selected before
   granting consent or recording.

Charlie:

1. Open the private Episode Room URL on the Mac.
2. Confirm the writing begins with **The Swear Jar**.
3. Confirm **Be Curious** is the selected Watch clip and remains paused.
4. Keep a second browser tab ready for the Session review:
   `/sessions/cms5lylpx000001s6bz9pt1yu`.
5. If using the Canon R8 as the production video source, record it
   independently and preserve its original card/file clock. Quipsly can import
   and align it after the rehearsal.
6. If the MV7i is connected to an iPhone or Mac, verify the route name and
   headphones before the take. Do not infer that Quipsly selected it merely
   because the device is plugged in.

## Consent

Each signed-in participant must save their own choices. One person must never
grant the other person's receipt.

In **Record → Review choices**:

1. enable **Record audio** for a local audio take;
2. enable **Record video** if that iPhone will create a camera source;
3. enable **Create a transcript** only if everyone agrees to transcription;
4. confirm that every person who may be heard or seen was told and agreed;
5. tap **Save these choices**.

The app should show the participant counts reaching the required total before
record controls unlock.

## Recommended first rehearsal

### Current Mac fallback evidence

Before this rehearsal, the signed current-source Mac app completed one
local-only MV7i plus built-in-camera take and saved it into a reload-verified
Studio working session. Studio generated proxies, displayed the recorded
camera source, advanced playback, and recovered the same two lanes, decisions,
and `0.07064375`-second source offset after a full app quit and relaunch.

That proof means a safe Mac take no longer disappears from Studio merely
because the process exits. It does not green-light the room rehearsal: the
audio was a quiet ambient signal, the Canon feed still showed its utility
placeholder, no human listened/watched start-to-stop, and no room, Nest
START/STOP, upload, transcript, or participant sync was involved. Use the
built-in camera only as an explicit reference fallback; keep the R8's on-card
file as the production original until the live Canon route is visually proven.

Build 33 exposes four deliberate source modes:

- **Audio** creates a local microphone source. In a joined LiveKit room it
  records the room-owned local-input PCM instead of opening a second
  microphone client.
- **A/V** creates separate microphone and video-only masters in one capture
  group while LiveKit remains the call.
- **Solo** creates one camera-and-microphone movie and therefore refuses to
  coexist with a live room.
- **Camera** creates a video-only master beside the LiveKit conversation.

Provider audio still is not the same as a verified provider-egress recording.
The local source receipts and the LiveKit room remain separate truth.

For the most useful low-risk first proof:

1. Charlie opens the signed Quipsly Studio app. Complete the Google account
   handoff if Account still says **Not connected yet**, then open **Episode
   Capture Setup** with `Command-Shift-R`.
2. Charlie selects the exact rehearsal room, `Shure MV7i` for microphone and
   headphones, and `EOS Webcam Utility` for the Canon reference feed. Confirm
   a fresh live image. Keep Canon on-card recording as the independent 4K
   production master if desired.
3. Homer opens the same Session in Build 33. Both people join the LiveKit room.
   Joining must not start recording.
4. Homer selects **A/V**, prepares the front camera, expands **Before you
   record**, and runs **Check this iPhone**. Do not start until the exact
   Session, both consents, microphone route, camera profile, storage,
   manuscript, Be Curious, headphones, and room are all truthful.
5. Charlie starts the app-owned MV7i WAV and Canon reference source. Homer
   starts **Podcast audio + video**. Speak for 20–30 seconds and verify the app
   claims two local sources only after both have actually started.
6. Homer taps **Pause**, waits for both sources to show paused, then
   **Resume**. Tap **Flip** once while recording. Flip must validate the
   current movie and start the other camera in the same capture group while
   keeping the microphone source continuous.
7. Stop Homer's coordinated take, then stop Charlie's sources. Confirm every
   source appears locally and plays before relying on upload or timeline
   assembly.
8. If the Mac account or hardware lane cannot be made truthful, do not fake
   it: Charlie uses a second signed-in Capture device for the call/audio
   boundary and records the R8 independently. Record the Mac limitation as
   open evidence.

## Shared clip proof

With the Episode Room open in both collaborators' authenticated Nest sessions:

1. Charlie confirms **Be Curious** is selected.
2. Start the authoritative Capture recording clock, then use **Use recording
   clock** in Episode Room. Do not invent or type a start timestamp.
3. Charlie presses **Play for everyone**.
4. Homer presses **Pause for everyone** from the second device.
5. Confirm both players converge on the paused position and the latest receipt
   names Homer as the actor.
6. Resume, briefly disconnect one iPhone's private listening route, and confirm
   both players converge on the resulting authoritative Pause. Reconnect
   headphones before continuing; the phone speaker must never carry the
   reference clip during local or provider recording.
7. Seek to a useful moment, resume, and pause again.
8. Repeat with Lucy or Samwise only if the Be Curious pass is clean.
9. While paused, choose **Send watched spans to editor** in Capture, or
   **Sync watched spans** in Nest.
10. Open **Edit** and confirm the watched source ranges appear in the dedicated
   Shared Watch derivative lane without changing the original clips.

If a browser blocks remote autoplay, tap **Join playback** on that device. That
is a local browser-permission recovery; it does not create a second playback
clock.

## Stop and read back

1. Stop every local recording before leaving the room.
2. Leave the LiveKit room.
3. Keep the phone app open long enough to observe background upload state, then
   deliberately test one relaunch.
4. Confirm no local original disappears after upload verification.
5. In the Session review, verify START and STOP receipts, recording assets, and
   consent state.
6. In Episode Room and Edit, verify imported audio/video sources, shared-watch
   derivatives, and the exact recording-clock anchor.
7. Listen to the assembled audio and watch each camera boundary. Do not accept
   a transcript, alignment proposal, or final edit without source playback.
8. Record the app version/build, iPhone model/OS, route names, failures, and
   exact recovery actions.
9. In Library, open **Review source evidence** for every take. Prepare and
   share the JSON receipt, then confirm its local SHA-256/byte count, START and
   STOP IDs, capture group, app/device/route snapshot, and verified cloud proof
   match the Session and editor readback.
10. Tap **Compare with Nest**. Treat `Exact local and Nest source match` as the
    cryptographic pass, `Exact bytes preserved · processing held` as a policy
    hold, `Incomplete` as a retry/readiness state, and `Drift` as a stop-work
    integrity failure. Capture the exact issue list before retrying anything.

## Pass criteria

The rehearsal passes only when:

- Homer installed Build 33 through TestFlight and used Google sign-in;
- the pre-provisioned Quipsly identity linked without a duplicate account or
  email-verification loop;
- both people independently granted the intended consent choices;
- both joined and left the exact Session;
- Homer's coordinated take has START and STOP evidence for both local masters,
  local playback, upload verification, a portable source-evidence receipt for
  each source, and post-relaunch readback;
- the video test preserves front/back movies plus the continuous microphone
  source in one capture group and every piece plays;
- Charlie can play the reference clip and Homer can pause it;
- Be Curious produces a receipt-backed watched span and an explicit timeline
  derivative;
- the editor can audition the real sources and assembled result;
- no source original is overwritten or deleted; and
- every limitation or failure is recorded honestly.

## Current blockers that are not Homer failures

- Homer's first Google sign-in is the only remaining live identity-link step.
- A physical two-account rehearsal is still required; simulator and server
  tests do not substitute for it.
- Charlie's saved device-bound Google/Firebase session is verified for
  `charlie@highgroundodyssey.com`, and current Capture Setup selects the Shure
  MV7i for both 48 kHz input/output plus EOS Webcam Utility for video. The
  Canon feed still requires a visibly moving image, and the MV7i still requires
  a spoken-gain headphone proof-listen, room join, upload, and cross-device
  readback. A local-only MV7i plus built-in-camera take now has durable Studio
  and relaunch proof, but it does not substitute for those operations.
- Build 33 implements same-iPhone coordinated local audio plus video beside
  LiveKit, but the exact real-device microphone ownership, first PCM,
  Pause/Resume/Flip, upload, and assembled sync path remains unproven until
  this rehearsal.

## July 30 live Mac preflight checkpoint

The consolidated preflight now treats the normal Account projection and the
bounded Capture projection as independent evidence. It launches the canonical
app normally, completes and waits for the saved-session verification, stores
that readback, then restarts into `--episode-capture-setup-only` and stores the
separate `/capture_status` readback. This prevents Capture Setup from erasing
account evidence or normal editor state from being mistaken for absent capture
hardware.

Live production readback at `2026-07-30T18:16:31Z` passed all eleven
infrastructure checks:

- Build 14 remains valid and in beta through the open public link;
- the exact production rehearsal Room, manuscript, Watch state, and protected
  media are intact;
- Charlie's saved Mac session is valid for the expected Home Nest and exposes
  the rehearsal project;
- the signed canonical bundle is the only Quipsly Mac binary running;
- microphone and camera authorization are granted;
- Shure MV7i is the exact two-channel 48 kHz input and output;
- EOS Webcam Utility is selected and has a negotiated preview; and
- no recording, provider join, consent mutation, upload, or publication
  occurred.

The EOS live-image flag remains false, camera recording remains unarmed, and
physical listening/seeing remains a human gate. The receipt is
`/private/tmp/quipsly-hgo-rehearsal-preflight-20260730T181611Z.json`.
