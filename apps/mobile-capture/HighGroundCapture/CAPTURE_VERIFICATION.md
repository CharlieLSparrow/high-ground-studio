# Quipsly Capture Verification Record

Candidate date: 2026-07-18

Latest addendum: 2026-08-03

Scope: iPhone capture app, mobile-capture Nest APIs, durable media upload, and release-readiness surfaces

Canonical design: [`CAPTURE_ARCHITECTURE.md`](./CAPTURE_ARCHITECTURE.md)

## Outcome standard

This candidate is complete only when each kind of truth is named separately:

1. **Build truth** — the iOS and Nest sources compile and their static contracts pass.
2. **UX truth** — the capture-first shell is visually inspected and its focused UI/accessibility suite passes.
3. **Source truth** — a physical iPhone produces and preserves playable audio through route, interruption, lock, background, and force-quit drills.
4. **Delivery truth** — the exact immutable file reaches private cloud storage and server finalize verifies its size, CRC32C, SHA-256, ownership, and canonical media records.
5. **Release truth** — the distributed TestFlight build, healthy production service, reviewer identity, real session, privacy answers, and App Review notes all agree.

Passing an earlier gate does not imply a later gate.

## Audit findings closed in this candidate

| Finding | Candidate disposition |
|---|---|
| Prototype-heavy iPhone navigation obscured the recording task | Replaced by five destinations: Today, Record, Work, Library, Account. |
| Recording, room join, provider egress, upload, and verification could read as one state | Separate controls, labels, receipts, and state vocabularies. Joining is never described as recording. |
| Local source safety depended too heavily on in-memory/UI state | Added a preallocated UUID, durable `armed` source row and START receipt before recorder start, protected owner sidecars/last-known-good ledgers, crash validation, and no automatic deletion. |
| An interrupted M4A could be called recovered without proving playback | Launch recovery persists a non-playable, relaunch-requeued `Validating preserved audio` state, then a sequential utility task proves positive duration and decodes through declared EOF before durable promotion; incomplete/corrupt bytes stay preserved as `Audio needs repair` and are not auditioned or retried. |
| A long capture could consume the space needed to close its container | Start, resume, and two-second runtime probes preserve a 256 MiB hard reserve plus projected encoder/container growth and auto-finalize with a visible reason. |
| An unreadable canonical ledger could be replaced by an empty index | Canonical source and receipt ledgers are quarantined read-only; last-known-good and per-item owner sidecars provide fail-closed recovery evidence. |
| Legacy upload streamed unbounded multipart/chunk bodies through application memory and instance-local storage | New jobs use file-backed direct transfer to a private-GCS resumable capability. Both server-buffered legacy endpoints return `410` before reading request bytes; preserved pre-v2 sources must be re-enqueued through v2. |
| Upload capability limits were process-local or absent | Added a serialized Prisma reservation ledger with stable request UUID binding, per-account and per-Nest rolling bytes, issuance rates, active limits, explicit mobile renewal count/time, browser-terminal expiry, and exact generation/size settlement at canonical finalize or proxy registration. |
| A transport ambiguity could replay byte zero into a partially consumed resumable session | Server checks committed object evidence and otherwise rotates to a fresh capability before a full-file retry. |
| Upload success could be confused with durable media evidence | Finalize verifies generation, media type, exact bytes, GCS CRC32C, and streamed SHA-256 before returning verified records. |
| Verified bytes could be mistaken for permission to edit or transcribe | Library and API evidence now distinguish durable cloud preservation from consent-bound processing release. Missing/legacy/changed Start or consent evidence is held; transcript release has its own all-party gate. |
| Signed resumable URLs could leak through ordinary persistence | Non-secret state is an atomic protected file; capabilities are this-device-only Keychain items and are excluded from logs. |
| Background transfer could start before its recovery job was durable | Ledger persistence is a precondition for starting a daemon task; failure holds the local source instead. |
| Retry schedules could synchronize clients | Transient retry uses bounded exponential backoff with jitter. |
| Room receipt replay/concurrency relied on a last-50 metadata array | Required UUID receipts and capture IDs are stored durably with database uniqueness and transactional room-state updates. |
| Account A's local audio could be exposed after Account B signed in | Sources, playback/share, uploads, and room receipts are bound to the verified Quipsly actor; unowned legacy artifacts are preserved but quarantined. |
| A 401 retry could deliver Account A's room receipt using Account B's refreshed token | Receipt sends and their single retry are bound to the expected owner and abort when identity changes. |
| Native account entry lacked creation, recovery, and mailbox-verification truth | Added create/sign-in modes, verification email, enumeration-safe password reset, Google-origin account guidance, and a fresh Firebase account lookup before any Keychain/session write and after refresh. Account creation explicitly does not imply Capture beta access. |
| Validated consent values crossed an inferred nonisolated async UI callback | The save callback is explicitly `@MainActor @Sendable`, and the model constructs the immutable consent receipt from primitive, validated choices on its own actor before persistence. |
| Cached identity could be mistaken for network authority | Offline launch exposes only that actor's protected local Library. New capture and all network mutations require online verification. |
| CallKit activation failure could leave a connected silent LiveKit room | Room join waits for CallKit audio activation; failure disconnects media, ends CallKit, releases the audio lease, and clears UI truth. |
| Disk-space preflight used a required-reason API without declaring it | Privacy manifest declares `NSPrivacyAccessedAPICategoryDiskSpace` reason `E174.1`. |
| VoiceOver exposed a nine-point microphone meter element | The slim visual meter now occupies a 44-point semantic inspection region. |
| Camera permission could be requested by an audio-only launch or room join | Audio remains camera-free; camera authorization is requested only after an explicit Solo video or Podcast camera choice followed by Prepare. |
| Library treated every local source as audio | Video sources now open an app-owned `AVPlayer` watch surface with explicit non-destructive local-original copy; audio retains the `AVAudioPlayer` path. |
| An armed camera profile could be mistaken for the shape of the finished MOV | Finalization now decodes every track through EOF, persists actual encoded/presentation dimensions, rotation, codec, frame rate, audio shape, and duration, and fails upload closed on negotiated-versus-recorded integrity drift while preserving playback. |
| Camera output and preview assumed every source was portrait at 90° | Apple rotation coordinators now supply separate horizon-level preview and capture angles. The movie angle is locked before START, persisted in source-profile v3, presented as portrait/landscape in the UX, and compared with the finished QuickTime transform before upload. |
| Camera configuration did not guarantee unlock when a selected format setter threw | Configuration now releases the `AVCaptureDevice` lock with `defer` on every Swift error path. |
| “Continue in Studio” could attach only the latest asset from a coordinated audio/video take or camera flip | Capture now sends the newest capture-group identity plus its exact reviewed source IDs. Nest fails closed if the set changed, any source lacks exact verification or processing release, or access no longer holds; then it converges every source idempotently and reports partial retry truth without mutating originals or claiming approved sync. |
| A completed capture-group handoff ended at a disabled “Group in Studio” control | Completion now exposes **Review group sync**, deep-linking the exact project, episode, and capture group into the existing human-reviewed waveform/drift wizard. Missing handoff evidence is explicit, and initial focus makes no spine, placement, clock-offset, or approval write. |
| TestFlight support could require a tester to disclose identity, source, path, or credential data manually—or could be unreachable before sign-in | Account now exposes one collapsed **Help & diagnostics** card, and the signed-out screen exposes **Having trouble signing in?**. Their narrowly typed payload includes only surface, build, coarse device/system/route type, Nest host, capture/room state, and inspected recovery counts; it accepts no email, account/session/recording ID, source text, filename/path, credential, token, or typed login fields and carries that boundary in every shared copy. |

## Automated evidence

The final local run records exact results after all hardening changes settled. Simulator evidence used Xcode 26.2, an iPhone 17 Pro simulator on iOS 26.3.1, and the canonical project DerivedData directory.

| Gate | Command or proof | Result |
|---|---|---|
| Privacy manifest | `plutil -lint HighGroundCapture/PrivacyInfo.xcprivacy` | PASS — valid plist |
| App Store/static UX | `node scripts/quipsly-ios-capture-app-store-static-smoke.mjs` | PASS — 947/947 |
| Redacted tester support contract | `pnpm quipsly:capture:support-snapshot:test` | PASS — exact output, bounded values, whitespace normalization, nonnegative recovery counts, and embedded privacy boundary |
| Signed-out and Account support, deletion, and accessibility | focused `CaptureLoginExperienceUITests` plus `CaptureExperienceUITests` on iPhone 17 Pro / iOS 26.3.1 | PASS — 7/7; Google-first login, password recovery/creation, signed-out and Account support at accessibility XXXL, `hitRegion`, `sufficientElementDescription`, `textClipped`, both real system Share Sheets without an automatic send, persistent deletion truth, and critical actions clear of the tab bar |
| Owner isolation | `node --test scripts/quipsly-ios-capture-account-isolation.test.mjs` | PASS — 15/15 |
| iOS source durability | `node scripts/quipsly-ios-capture-durability-contract.test.mjs` | PASS — 73/73 |
| Mobile source contracts | `node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only=1` | PASS — 76/76 source; live-network count unchanged pending the next authorized run |
| Committed release isolation | `scripts/release/quipsly-capture-release-from-commit.test.sh` | PASS — exact SHA, dirty-source exclusion, argument/output preservation, cleanup |
| Repository TypeScript authority | `bash scripts/ci/typecheck-typescript-7.sh` | PASS — 21/21 on pinned TypeScript 7.0.2 |
| Security boundaries | `node --experimental-strip-types scripts/quipsly-mobile-capture-security.test.mjs` | PASS — 6/6 |
| Resumable upload | `TS_NODE_PROJECT=apps/quipsly/tsconfig.json TS_NODE_TRANSPILE_ONLY=1 node --experimental-strip-types --import ./scripts/register-ts-extension-loader.mjs --test scripts/quipsly-mobile-capture-resumable-contract.test.mjs` | PASS — 9/9 |
| Ingestion idempotency | `node scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs` | PASS |
| Upload reservation quotas | `node --test scripts/quipsly-media-vault-upload-quota.test.mjs` | PASS — 14/14 |
| Session evidence | `node scripts/quipsly-mobile-capture-session-evidence.test.mjs` | PASS |
| Legacy web callers fail closed | `node --test scripts/quipsly-web-upload-callers-fail-closed.test.mjs` | PASS — 3/3 |
| Prisma schema | `pnpm exec prisma validate --schema prisma/schema.prisma` | PASS |
| Nest TypeScript | `pnpm --filter quipsly typecheck` | PASS |
| Account deletion API | focused Jest policy/route suite | PASS — 7/7 |
| Account deletion operating loop | disposable verified Firebase-emulator identity against local Nest/Postgres | PASS — create, idempotent replay, reopen, review, completion readback, and cleanup |
| Account deletion iPhone UX | focused iPhone 17 Pro iOS 26.3.1 simulator journey | PASS — 1/1; 30-day timing, persistent-status explanation, and preview no-write boundary |
| Canonical project-note editing | disposable real Firebase identity, current local Nest, loopback PostgreSQL, and focused iPhone Simulator journey | PASS — temporary title/body read back, exact title/body/revision/tags restored, stable block retained, 2 reversible receipts, zero external effects, database and Firebase residue absent |
| Canonical Task focus planning | disposable real Firebase identity, current local Nest, loopback PostgreSQL, and focused iPhone 17 Pro / iOS 26.3.1 Simulator journey | PASS — one deterministic 50-minute `WorkPlanBlock`, same identity after app termination/relaunch, unchanged Task revision/status/deadline, no reminder/appointment/provider/external-calendar mutation, exact Task and block cleanup read back as zero, generated Firebase identity absent; `/tmp/quipsly-capture-runtime-ui-focus-plan-20260803T034306Z-43329.xcresult` |
| App Store provider readiness | read-only Team Admin API audit of version 1.0 / Build 26 | PARTIAL — build, review detail, content rights, 24/24 age answers, IDFA, free price, and USA availability pass; Apple reports 0/5 screenshots, while App Privacy publication, DSA, physical acceptance, production deletion, and Mac/Vision opt-out remain manual gates |
| App Store draft visual QA | exact committed source `58c57250`, detached iPhone 17 Pro Max / iOS 26.3.1 screenshot run, human inspection, and focused UI reruns | PASS — five private-data-safe 1320 x 2868 drafts exposed and repaired a truncated Calendar action, ambiguous upload-policy labels, contradictory local-source count, and text refraction beneath the iOS 26 tab bar; Calendar plus screenshot journeys passed 2/2, and the final clean-compositing screenshot journey passed 1/1 at `/tmp/quipsly-capture-hard-edge-rerun-20260803T040837Z-55130.xcresult`; drafts remain upload-ineligible |
| Build 27 sealed candidate | exact committed source `56f3e85d8934bb5a50f929f019e1bd6e08a0a46a`, detached-source candidate lane, independent result/receipt/hash/artifact readback | PASS — 54/54 serialized iPhone and Share Extension journeys, source verification, signed archive, App Store export, strict app/extension signatures, App Store profiles, distribution-safe entitlements, iPhone-only packaged metadata, privacy/permission/background-mode inspection, and independent IPA byte/SHA-256 verification; mode-0600 receipt records `candidateQualified=true`, `uploadAttempted=false`, and `physicalTestFlightInstallReadbackPerformed=false` |
| Debug Simulator | generic iOS Simulator `xcodebuild` | PASS — arm64 and x86_64 |
| Static analysis | generic iOS Simulator `xcodebuild analyze` | PASS |
| Unsigned Release | generic iOS device, Release configuration, signing disabled | PASS — retired facade editor/export sources are absent and the current production graph emits no build warning |
| UI-test build graph | iPhone 17 Pro / iOS 26.3.1 `build-for-testing` | PASS — only the current experience and room-runtime suites remain in the target; four stale facade-test files are removed |
| Facade-removal regression | iPhone 17 Pro / iOS 26.3.1, focused login/account/support UI journeys | PASS — 7/7, zero skips; `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-hdptnccsjtratddsvysdcgbqoxgf/Logs/Test/Test-HighGroundCapture-2026.07.30_09-53-33--0600.xcresult` |
| Complete capture-group Studio handoff | focused Nest Jest, Quipsly TypeScript, generic dual-architecture Simulator build, source contracts, and an operated iPhone 17 Pro / iOS 26.3.1 journey | PASS — 31/31 server/projection/API tests, including whole-group no-write under a processing hold and explicit retry-safe mid-group failure truth; Record selected real preview Session rows and read back `2 sources ready`, retryable `1 of 2 in Studio`, and completed `2 sources in Studio`; `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-hdptnccsjtratddsvysdcgbqoxgf/Logs/Test/Test-HighGroundCapture-2026.07.30_10-19-20--0600.xcresult` |
| Exact capture-group sync-review continuation | focused editor Jest, Quipsly TypeScript, 76-check mobile source contract, 947-check App Store static gate, generic dual-architecture Simulator build, operated local Nest, and focused iPhone 17 Pro / iOS 26.3.1 journey | PASS — 4/4 helper tests select only the requested group's audio baseline and first camera without approving sync; local Nest rendered the explicit missing-handoff state at the real editor route; iPhone completion exposed enabled **Review group sync** after ready and partial states; `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-hdptnccsjtratddsvysdcgbqoxgf/Logs/Test/Test-HighGroundCapture-2026.07.30_10-43-41--0600.xcresult` |
| Full mobile preflight | `bash scripts/quipsly-mobile-capture-preflight.sh` | PASS — all source contracts, repository tests, and clean dual-architecture Simulator build completed |
| Capture UX, native auth, and Share extension | focused `CaptureExperienceUITests`, `CaptureLoginExperienceUITests`, and `ShareCaptureExtensionUITests` | PASS — 26/26, no skips; `/tmp/quipsly-account-deletion-full-ui.xcresult` |
| Video source modes and consent | focused `CaptureExperienceUITests` on iPhone 16e simulator | PASS — 3/3; exact Audio / Solo video / Podcast camera explanations, separate video choice, and video-only consent cannot enable audio |
| Finalized video truth and local watch path | static contracts, generic iOS Simulator build, and focused iPhone 17 Pro mode journey | PASS — actual MOV evidence and integrity holds are required for upload eligibility; AVPlayer Library path compiles; focused journey passes 1/1 |
| Camera orientation contract | static contracts and generic iOS Simulator build | PASS — no fixed 90° output assumption; capture angle locks before START and finished rotation drift holds upload; physical portrait/landscape recording remains open |
| Visual QA | Today, Record, Work, Library, Account; light/dark, large type, and accessibility XXXL | PASS — focused navigation and Work journeys plus signed local Work operation; physical TestFlight inspection remains open |
| Patch hygiene | tracked-worktree `git diff --check` | PASS |

## Retained Session-truth operation (2026-07-31)

The retained QA account created `QA Retained · Capture truth visible boundary AQ`
through the shipping iPhone shell, terminated and relaunched the app, restored
that exact Session, waited for canonical authority to settle, and read back
consent, recorder, lifecycle, provider, CallKit, and recording-receipt boundaries
without joining or recording. The focused runtime result passed 1/1 at
`/tmp/quipsly-capture-runtime-ui-session-create-surface-20260731-visible-boundary-aq.xcresult`.
Commit `cac6687e0047bcf525cf17e8c45ee288c676b00a` repeated the complete journey
with retained Session `QA Retained · Capture truth cac6687e AR`: 1 passed,
0 failed, 0 skipped at
`/tmp/quipsly-capture-runtime-ui-session-create-surface-cac6687e-ar.xcresult`.
The same operation found and closed a global-sign-out defect caused by an
episode-chat feature denial; native chat now uses the shared bearer-or-cookie
identity boundary, and a missing canonical thread stops background polling
after its terminal 404. This is exact-commit local Simulator/Nest evidence;
physical-iPhone, TestFlight, and production proof remain open.

## External proof still required

These checks cannot be substituted with source inspection or Simulator output:

- Restore a healthy `nest.quipsly.com`, then sign in with a real reviewer account and prove at least one accessible capture session.
- Restore public policy/support surfaces. On the candidate audit date, the checked `www.quipsly.com` policy/login routes and `nest.quipsly.com` policy, account-deletion, authentication, readiness, and session APIs returned HTTP 503. One earlier transient probe of the `www.quipsly.com` root returned HTTP 500; a later root retry returned HTTP 503. None is current reviewer proof.
- Apply and verify `ops/quipsly-coaching-capture-additive.sql` through the repository's schema-sync job before exercising capture state or issuing upload capabilities. It must prove both `CaptureRoomStateReceipt` and `MediaVaultUploadReservation` plus their indexes. This repository's historical Prisma migrations do not own the existing `CallRoom` rollout, so no standalone Prisma migration is claimed.
- Apply and read back the reviewed media-vault CORS policy containing `x-goog-if-generation-match`; local source review alone does not prove browser create-only uploads work against the live bucket.
- Approve the 30-day target and legal retention matrix, provision the dedicated private deletion worker, and prove its completion email against a disposable production account. The app and API create and reopen one idempotent request, show its durable review/completion status and target date, and provide an in-app completion readback. Nest keeps its in-process executor disabled, while the worker alone combines database/Firebase access with GCS deletion and email; it fails closed on IAM, a shared secret, exact plan, concurrency 1, and an explicit GCS bucket allowlist. This remains incomplete until provider setup and independent production deletion readback succeed.
- Replace the explicitly beta/incomplete Terms and high-level beta privacy surface with counsel-approved production terms, retention/vendor/rights disclosures, and App Store privacy answers that match the candidate.
- Record on a physical supported iPhone with built-in, Bluetooth HFP, wired, and USB microphones, then record front/rear Solo video and Podcast camera sources at every resolved production profile.
- Exercise lock/unlock, background, call/alarm/Siri interruption, route removal, Low Data Mode, constrained/cellular transfer, force quit, and reboot.
- Confirm each resulting source is playable, remains visible in the correct account's Library, resumes upload, and becomes **Verified in Quipsly** without local deletion.
- Join a Nest-issued LiveKit packet and prove CallKit activation/deactivation, remote participant updates, mute, disconnect/reset, and simultaneous local-source behavior.
- Install the archived candidate through TestFlight and repeat the critical record/save/upload verification on the distributed binary.
- From a real completed multi-source capture, open **Review group sync** on the
  physical iPhone, confirm the exact microphone master and camera sources in
  production Nest, perform waveform and long-take drift review, explicitly
  approve or revise alignment, and proof-listen/watch the resulting timeline.
- Open **Help & diagnostics** in the distributed binary, inspect the generated
  payload before sending it, and confirm the physical iPhone Share Sheet
  contains no identity, content, path, session, or credential data.
- Sign out, open **Having trouble signing in?**, and repeat the inspection
  after typing a synthetic email and password. Confirm neither appears in the
  Share Sheet payload and no authentication attempt is triggered.

The canonical archive/upload procedure is
[`docs/quipsly/ios-capture-release-runbook.md`](../../../docs/quipsly/ios-capture-release-runbook.md).
It builds from one detached committed worktree and keeps upload, processing,
tester assignment, and physical installation as separate receipt states.

## Release decision

Do not submit this candidate solely because its automated matrix is green. App Store readiness requires the production/reviewer and physical-device evidence above, current privacy-label answers, localized permission copy, support/privacy URLs, account-deletion instructions, screenshots from the candidate build, and final review notes.
