# Current State

Date: 2026-08-02

## Evidence-backed weekly review checkpoint

Implementation commit: `03a316e1`

- Nest Work and Capture Today now use one deterministic domain projection for
  goals, linked tasks, weekly commitments, Session contribution, blockers, and
  next work. No model decides whether a week was good, and the projection has
  no provider or target-status side effects.
- Focus-block completion records explicit actual minutes separately from the
  planned window. Missing historical or Build 25 time remains visibly unknown;
  the compatibility path never turns a plan into claimed work.
- A retained client recorded 37 minutes through rendered Calendar. Client Nest,
  the signed-in Capture API, and the assigned coach all read the same canonical
  week; independent PostgreSQL readback kept the task `OPEN` and goal `ACTIVE`.
- The operation exposed and fixed an older Work privacy defect: generic room
  participation no longer grants private booking-backed coaching work. The
  unrelated producer denial now passes, while unbooked production-room
  collaboration remains intact.
- Full Nest verification passes 224 suites and 1,174 tests; TypeScript passes;
  the Capture/App Store gate passes 1,007 checks; and the focused iPhone 17 Pro
  simulator journey passes. Production migration/deployment, a new TestFlight
  build, and physical-iPhone proof remain open.
- Architecture, defect evidence, retained-operation boundaries, verification,
  and release order are in
  `docs/coordination/2026-08-02-evidence-backed-weekly-review-operation.md`.

## Cloud cost-control checkpoint

- The supported Nest release paths now reuse an exact committed-source image
  before building, so retries and promotion do not pay for duplicate images.
- Artifact Registry has a conservative untagged-after-45-days cleanup policy
  evaluating in dry-run mode. No image deletion has been enabled; wait at least
  one day and inspect the proposed deletions before making that separate
  destructive decision.
- The cost auditor now covers every Cloud Run service and every
  traffic-serving revision in the region. This fixed a blind spot that had
  omitted the always-warm `studio-collab` service.
- Live `studio-collab` revision `studio-collab-00005-xht` reuses the existing
  image and serves 100% of traffic with zero minimum instances. Readback keeps
  `maxScale=1`, concurrency 80, timeout 3600 seconds, Cloud SQL, service
  account, IAM policy, and `/health` intact. No Cloud Build ran for the change.
- The post-change audit reads four services, 492 revisions, seven protected
  live digests, and zero total minimum instances. The deploy helper defaults to
  zero and a regression test prevents restoration of the former warm default.
- Full evidence and remaining cost decisions are in
  `docs/coordination/2026-08-01-cloud-cost-pipeline-consolidation.md`.

## Calendar bearer-log privacy checkpoint

- The production `_Default` Cloud Logging sink now has one enabled,
  exact-route exclusion for `studio` Cloud Run request logs matching
  `/api/calendar/feeds/<capability>`. It does not broaden the sink filter or
  disable ordinary request observability.
- A live paired probe returned HTTP 200 for an ordinary health route and HTTP
  404 for a synthetic invalid calendar capability. After Google's propagation
  window, Logging contained the ordinary request exactly once and the
  capability-style request zero times.
- Independent readback proves the base `_Default` filter and destination are
  unchanged, `_Required` remains enabled, and the named exclusion matches the
  checked-in release contract exactly.
- The operator now distinguishes an apply request from a real mutation, and
  tests prove it can only add or repair the named exclusion. Read-only
  verification remains mandatory in release preflight.
- Full provider evidence and the remaining rotation boundary are in
  `docs/coordination/2026-08-01-calendar-capability-log-privacy.md`.

## Production account-deletion worker checkpoint

- In-process account-deletion execution no longer belongs to public Nest. Staff
  review remains in Nest, which invokes a dedicated private concurrency-1 Cloud
  Run worker with an identity token and a second shared-secret check. Nest's
  legacy executor is forced false.
- The worker combines Cloud SQL, Firebase Authentication Admin, exact-bucket
  GCS deletion, and Resend access behind one private route. Nest retains the
  database and Firebase permissions its existing authentication/admin features
  require, but its deletion executor stays off. The GCS adapter rejects any
  otherwise-valid object URL outside
  `QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS`.
- Read-only readiness and explicit-confirmation deployment operators now prove
  exact source image, private service/IAM, dedicated identity, secrets,
  provider roles, concurrency, zero minimum instances, public policy pages,
  and Nest invocation. Neither operator can delete an account.
- Live readback proves both public policy pages are healthy and the public Nest
  executor is off. The dedicated worker, Resend/sender/shared secrets, worker
  IAM, exact-source image, schema readback, and disposable production proof are
  genuinely absent. No cloud or account state changed.
- Focused worker/client/route/allowlist coverage passes 16/16, broader deletion
  coverage passes 24/24, release operator coverage passes 11/11, strict
  TypeScript passes, the release-limit production
  build produces 157 routes including the internal worker, the Capture/App
  Store contract passes 949/949, and the live receipt is redacted mode `0600`.
  Full evidence is in
  `docs/coordination/2026-08-01-account-deletion-worker-boundary.md`.

## Account deletion local operation and isolated email checkpoint

- Recovered the owned local Nest/PostgreSQL/Firebase lifecycle and reran the
  real disposable-account integration. It passed 2/2 while proving actual
  user/Home Nest/Task deletion, collaborator blocking, failed-provider resume,
  receipt replay, deleted-token HTTP 401, and zero-residue cleanup.
- Account deletion now uses dedicated
  `QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY` and
  `QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM` variables. It cannot silently inherit
  generic site or coaching delivery credentials, validates the sender before
  provider contact, and preserves the immutable Resend idempotency key.
- The planned sender is `Quipsly <account@notify.quipsly.com>` with a
  domain-restricted sending-only key. The subdomain isolates provider records
  from root `quipsly.com` Google Workspace mail.
- The complete Quipsly suite passes 225 suites / 1,182 runnable tests, the local
  deletion operation passes 2/2, focused provider/route tests pass 13/13,
  worker operators pass 7/7, and strict TypeScript passes.
- Resend sign-in, DNS, secrets, image build, worker deploy, IAM, and production
  deletion were intentionally not performed. The App Store gate remains red
  until one disposable production account is independently proven deleted.
  Full evidence is in
  `docs/coordination/2026-08-02-account-deletion-local-operation-and-provider-contract.md`.

## Capture App Store submission-readiness checkpoint

- The credentialed read-only auditor remains bound to exact Build 25 and cannot
  mutate or submit. A separate exact-confirmation operator can configure only
  source-backed content rights, age rating, IDFA, Free pricing, and USA-first
  availability; it cannot upload screenshots, publish App Privacy, change DSA
  identity, create a review submission, submit, or release.
- Live Apple configuration and independent readback now prove the safe listing,
  App Review detail, editable 1.0 version, manual release type, exact Build 25,
  `USES_THIRD_PARTY_CONTENT`, 24/24 age-rating answers, `usesIdfa: false`, an
  active Free/USA price, and a complete 175-territory inventory with only USA
  enabled. Apple reports zero screenshots and no review submission.
- Provider debugging fixed three real API-boundary defects: Apple JWT scope is
  GET-only; compound-create resources require `${local-id}` IDs; and App
  Availability creation/readback requires the full live territory catalog plus
  the v2 200-item relationship endpoint. The expected pre-release
  `CANNOT_SELL` plus `AVAILABLE_FOR_SALE_UNRELEASED_APP` pair is no longer
  misreported as a legal failure.
- Provider checks remain separate from manual App Privacy publication, EU DSA
  trader verification, iPhone-only compatibility cleanup, physical Build 25
  acceptance, and production disposable-account deletion proof. The operator
  cannot turn those human/legal boundaries green by inference.
- Focused configuration/readiness coverage passes 12/12, the complete Apple
  operator suite passes 48/48, and the Capture static gate passes 949/949. The final redacted
  configuration and readiness receipts are mode `0600`; readiness exits 2 only
  for the preserved screenshot, privacy, DSA, physical-device, deletion, and
  compatibility gates. Full evidence is in
  `docs/coordination/2026-08-01-capture-app-store-submission-configuration.md`.
- Final verification exposed 11.98 GiB of repeated temporary screenshot
  `DerivedData`. The evidence assets were preserved, the regenerable trees were
  removed, and successful direct/exact-commit screenshot runs now clean that
  payload automatically while failed runs retain it for diagnosis.

## Source-grounded transcript packet note-lane checkpoint

- Nest now makes every persisted coaching/podcast packet purpose lane directly
  reviewable with approve-for-internal-use, needs-revision, reject, and reopen
  decisions. Review notes and status survive reload on the canonical summary.
- Capture reads the same saved lane projection, targets the canonical
  `callRoomId`, and exposes the bounded decision sheet in the Session recorder.
  Approval creates no canonical note, task, goal, client delivery, message,
  calendar event, Studio mutation, or publication.
- Operating the focused iPhone preview exposed and fixed a SwiftUI
  accessibility-identifier inheritance bug; the card, lane rows, sheet, and
  buttons now retain distinct identities.
- Three focused web/model/server suites pass 46 tests, TypeScript passes, the
  Capture/App Store static gate passes 933 checks, and the operated iPhone 17
  Pro Max simulator journey passes. No Cloud Run revision, TestFlight build, or
  production packet was replaced; eligible released transcript operation still
  waits on the transcript-worker/provider gate.
- Exact implementation and verification evidence are recorded in
  `docs/coordination/2026-08-01-app-store-calendar-transcription-batch.md`.

## Production Capture cross-device project-system checkpoint

- The compiled Build 25 iPhone product created a retained production Project,
  Task, document-kernel Note, active Goal, and one shared canonical Tag through
  the fixed `codex@dev.test` account. Stable IDs are preserved for longitudinal
  use; the Tag has three canonical assignments.
- The fail-closed operator requires the exact production origin, clean source,
  released Build 25 app hash, fixed Keychain identity, unique labels, and
  mode-`0600` evidence. It performed no recording, Session creation, invite,
  calendar action, publication, cleanup, or other external effect.
- The first rendered Nest readback found two genuine React hydration failures
  on focused Work routes. Work timestamps now use deterministic UTC server
  snapshots and localize only after hydration; the full Quipsly suite passes
  195 suites and 989 tests, TypeScript 7 passes, and all 150 production routes
  build.
- Exact release source `f1a403572cd5804a6ffb81a6a6112edf0b8809c2`
  passed exact-context preflight, Cloud Build
  `3154fb52-ef10-4b10-9df0-dd25917e6388`, in-image route inspection,
  zero-traffic generated-reviewer acceptance, promotion, and recovery.
  Revision `studio-00490-hex` now serves 100% from runtime digest
  `sha256:b84bc743747ee9016dec964afa3471c619bb8b2c294f04baa7089ace33670879`.
- Final rendered production readback proved the same Project, Note, Task, Goal,
  and Tag on desktop and phone width with no overflow, browser exceptions,
  server failures, product mutation, or external effect. The failed and fixed
  screenshot sets remain versioned as private evidence.
- Exact records, artifact hashes, release proof, commands, and the remaining
  physical-iPhone boundary are in
  `docs/coordination/2026-08-01-production-capture-cross-device-system.md`.

## Retained production Capture-session checkpoint

- A verified, Keychain-backed synthetic `.test` identity now owns the durable
  production podcast Session
  `QA Retained · Capture Build 25 longitudinal session · 2026-08-01`.
- The exact Session/call-room `cmsa2xxoo001i01s639zmnn5u` is `PLANNED`. Its
  dedicated synthetic participant accepted the current audio/video consent
  presentation with transcription off; fresh readback reports `GRANTED`,
  `canRecordNow=true`, `ready-to-capture`, and `ready-provider`.
- Before/after room diagnostics and one redacted 600-second token preparation
  proved no provider join, recording, media/storage mutation, invitation,
  calendar event, Stripe operation, or publication. The token is ephemeral;
  recordings and transcripts remain zero.
- A read-only rerun authenticated through Firebase and Quipsly's native-session
  boundary, read the Home Nest and ten retained Sessions, selected this exact
  Session by title, and passed participant, consent, lifecycle, and safe-record
  checks without creating a duplicate.
- The live proof now creates missing evidence directories, writes atomically,
  pins expected retained-session identity, and stores receipts as mode `0600`.
  Both live wrappers now default to read-only reuse instead of adding a new
  Session on every proof run; creation requires explicit opt-in.
  Exact evidence and the retained-artifact operating boundary are in
  `docs/coordination/2026-08-01-retained-production-capture-session.md`.
- The operation exposed a contradictory ready-state next action that still
  said consent was required. The server projection now says that joining alone
  does not start recording, and its regression test covers a consented first
  capture.
- Exact source `da2947700ec6ddcc1dcfa379c47133772fcf1ec0` passed 30/30
  Session evidence tests, strict TypeScript and 150 routes twice, Cloud Build
  `9cb2bfa2-819e-43eb-a2e2-8b7ee16e51a4`, in-image bundle inspection,
  zero-traffic retained-Session proof, generated-reviewer acceptance/cleanup,
  promotion, and recovery. Revision `studio-00488-tim` now serves 100% from
  platform digest
  `sha256:fc6b75eea4116c56cfd33f1bec8facabe315f1703a925030940daa2989d16c56`.
- Final production readback shows the same ten Sessions and exact target as
  `GRANTED`, `canRecordNow=true`, `ready-provider`, with the corrected action
  **Joining alone does not start recording** and no failed checks.
- This gives future Capture builds a stable longitudinal test world. Physical
  TestFlight installation, consented audio/video, upload, transcript, timeline,
  and same-ID Studio playback remain separate open boundaries.

## Episode Room editor navigation production checkpoint

- Exact source `811a29db16d1493032b2ccc285438bd5b45854ab` is serving
  100% of production as Cloud Run revision `studio-00486-son` from platform
  digest `sha256:a4b015fb43779799b1159c86073e75a086d1f20ed70f9fb3f90642de3081f9be`.
- The Episode Room now distinguishes **Edit timeline**, **Live cut**, and the
  Shared Watch **Review production timeline** return path instead of hiding the
  production editor behind one ambiguous Edit action.
- Exact-context preflight, strict TypeScript, the optimized 150-route build,
  Cloud Build `2804ad4c-3484-4b8e-816f-0e8a66d9d9f8`, in-image route
  inspection, zero-traffic generated-reviewer acceptance, cleanup, promotion,
  and post-promotion recovery all passed.
- Pushed test-harness commit `17f5d1a44db93b4592a5f2969cd78172612f46bc`
  closes the prior proof gap: every generated reviewer now creates a persisted
  episode and requires the rendered Episode Room to expose the exact timeline
  and live-cut destinations. A fresh production run passed and independently
  removed its generated Firebase and database artifacts.
- Exact evidence and remaining physical-device boundary are in
  `docs/coordination/2026-08-01-episode-room-editor-navigation-release.md`.

## Capture Build 26 public TestFlight checkpoint

- Exact source `283d522058bb036d3d81ae966ebc8939af92e55d` passed all
  54 serialized iPhone and Share Extension journeys plus signed archive/export
  inspection. The 22,376,036-byte IPA has SHA-256
  `ffc30e329e4f872bc384f8f4d02ed88ee098bf8921cd4e1a9f1d1131766264f3`.
- A sealed-candidate upload lane reverified the receipt, UI evidence, bytes,
  digest, signatures, profiles, entitlements, privacy manifest, and packaged
  metadata without repeating tests or rebuilding the artifact.
- Apple processed provider build `0ef2cf7a-43d1-49bb-800f-c08239730b96` as
  `VALID`. Independent readback proves both internal and external
  `IN_BETA_TESTING`, beta review `APPROVED`, membership in the internal and
  public-link rehearsal groups, and no non-exempt encryption.
- The open 100-person public page returns HTTP 200, names Quipsly Capture, and
  exposes the exact Apple handoff at
  `https://testflight.apple.com/join/XwRRcYUm`. Build 26 is the canonical
  installation target; Build 25 remains rollback history.
- The editable App Store 1.0 record now assigns the exact Build 26 provider
  binary. Fresh API readback passes identity, listing, review contact, content
  rights, age rating, IDFA, Free pricing, and USA-only availability without
  submitting the version or mutating manual legal declarations.
- The synthetic reviewer account passed production Firebase sign-in,
  verified-email, native bearer, Home Nest, and capture-session checks. A
  physical TestFlight installation and operated real-iPhone audio/video,
  recovery, upload, playback, alignment, and cross-device readback remain open.
- Exact Build 26 source also regenerated and visually passed all five 1320 x
  2868 App Store screenshot stories. The review exposed and fixed one singular
  archived-tag grammar defect in pushed source `c621af95`; that change is held
  for a later spaced release rather than triggering another immediate upload.
  Screenshot receipts remain submission-ineligible until signed/TestFlight
  physical-device recapture and approval.
  Evidence is in
  `docs/coordination/2026-08-02-capture-build26-public-release.md`.

## Capture Build 25 public TestFlight checkpoint

- Exact pushed source `4ef8ddbacbba7949b16607d8dae5454ff28e9082`
  passed the complete detached-source release preflight and two independent
  47/47 serialized iPhone and Share Extension suites with zero failures.
- The upload-bound signed IPA is 21,447,970 bytes at SHA-256
  `ffc296f70a5afbd78b834908eed1d29e4f8d3e750c0e87fa917792c48d082071`.
  Packaged app and extension identity, App Store profiles, entitlements,
  nested signatures, privacy manifest, camera and microphone purpose strings,
  background audio/CallKit modes, and export-compliance metadata all passed.
- App Store Connect accepted provider build
  `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`. A fresh independent readback reports
  `VALID`, externally `IN_BETA_TESTING`, beta review `APPROVED`, included in
  **Quipsly Capture Rehearsal**, automatic notification enabled, and the
  existing 100-seat public link enabled.
- Anonymous delivery-boundary readback returns HTTP 200 and Apple's title
  **Join the Quipsly Capture beta - TestFlight - Apple** at
  `https://testflight.apple.com/join/XwRRcYUm`. Build 25 is now the canonical
  installation target; Build 24 remains rollback history.
- Build 25 restores visible provider-runtime truth, explicitly distinguishes
  immutable Studio handoff from publishing or source editing, and carries the
  retained tagging/runtime hardening. Complete evidence and the remaining
  physical-device gate are recorded in
  `docs/coordination/2026-08-01-capture-build25-public-release.md`.
- This is exact-source simulator, package, upload, review, group, and public
  page proof. A physical TestFlight install, real iPhone audio/video recording,
  pause/resume, camera switching, process-death recovery, upload, playback,
  timeline alignment, and same-ID Nest/Studio readback remain open.

## Build 22 production and TestFlight release checkpoint

- The guarded production schema lane passed from exact backend source
  `12c97cbdfe8bfd19b74c557f7fba04dd935f5a23`: disposable full-chain
  migration, successful on-demand backup `1785529000879`, migration
  `20260731120000_add_session_outputs_and_delivery_events`, current ledger,
  and zero schema drift.
- The matching Nest revision `studio-00472-wey` passed authenticated
  zero-traffic acceptance before promotion and now serves 100% of production
  from immutable image digest
  `sha256:8d757ae0f6259ba39cbe5adfcde92d475b11f96316d9bbbfb711e60e0b3374c4`.
- Full Capture qualification found and fixed a real Session-creation handoff:
  canonical creation succeeded while the chooser stayed over Record. Both
  creation entry points now land directly on the selected Session's recorder
  without granting consent, joining a call, or starting recording.
- A second qualification exposed nondeterministic viewport occlusion in the
  largest-text rehearsal audit. The test now proves the actual Watch
  preparation control is hittable and ignores clipped-text reports only when
  the reported element frame crosses the known navigation/tab-bar viewport.
  Fully visible clipped text still fails.
- Exact native source `34354101340bca41f31ff576393a6aea841befe3`
  passed all 47 serialized iPhone and Share Extension journeys, signed archive,
  App Store export, privacy, entitlement, provisioning, and nested-signature
  inspection. The upload-bound IPA is 21,287,598 bytes at SHA-256
  `61e00fdd5ef385cebcd44a3ce3aa3e28befbb954bef300025395f3e6ee59ae49`.
- Independent App Store Connect readback identifies Build 1.0 (22) as provider
  build `81160b86-95c7-44b2-8cc9-4c29a7335929`, `VALID`, internally and
  externally `IN_BETA_TESTING`, beta-review `APPROVED`, and included in both
  controlled internal and public rehearsal groups.
- Anonymous readback confirms the open 100-person public page and exact Apple
  handoff at `https://testflight.apple.com/join/XwRRcYUm`. Build 22 is now the
  canonical install target; Build 20 is rollback history.
- Physical TestFlight installation, actual iPhone audio/video capture,
  interruption recovery, upload, playback, and same-ID Nest/Studio readback
  remain separate proof boundaries. Retained QA artifacts remain authorized
  under `docs/runbooks/quipsly-retained-dogfood.md`.

## Retained Work progress operation checkpoint

- Exact source `82c4223e1beb8ce936fa38b27b03ffac1b1d65db` adds a
  loopback-only rendered mutation lane for the fixed retained `.test` media
  operator and its durable Capture-to-Nest goal.
- Real operation exposed two same-titled goals whose current-versus-restored
  identity was unclear. Portable restore copies now have a visible **Restored
  copy** badge, recovery explanation, and distinct accessible heading while
  both histories remain intact.
- The same operation exposed unstable accessible names on the compact progress
  form and nondeterministic database readback across the two identities. The
  controls now have explicit names, canonical readback requires the one
  non-restored goal, and exact latest-note replay is refused.
- Operated the exact committed Work UI and appended one real 25% progress
  receipt. Independent readback proved count 3 to 4, actor/note/percentage and
  embedded/source receipt agreement, zero browser exceptions, clean session
  removal, no secrets/screenshots, no external effects, and preserved QA data.
- Focused Work tests pass 39/39, retained-operation tests pass 3/3,
  cross-surface contracts pass 176/176, TypeScript 7 passes, and the optimized
  150-route Quipsly build succeeds. Exact evidence is in
  `docs/coordination/2026-07-31-retained-work-progress-operation.md`.

## Schema pipeline hardening checkpoint

- Exact source `30264d5cbb8094f175c36fcd7693639648d3810f` replaces the
  contradictory chronological database instructions with one Prisma 7,
  migration-first operator contract. Shared, retained-QA, preview, staging,
  and production databases explicitly prohibit `db push`.
- Added a loopback-only, clean-commit fixture runner that derives one
  source-bound database, refuses reuse or replacement, replays every committed
  migration twice, requires zero schema diff and the transcript schema
  contract, then drops only that exact database after success.
- The committed runner passed against local PostgreSQL: all 33 migrations,
  idempotent replay, zero diff, 15 required transcript columns, 2 cascading
  foreign keys, and 4 indexes. Independent readback confirmed the exact
  fixture database was absent afterward.
- The redacted receipt is mode `0600`, contains no credential fields, and is
  bound to the exact commit. Documentation/helper tests pass 5/5, the complete
  cross-surface contract passes 173/173, and Quipsly TypeScript 7 typechecking
  passes.
- Disposable schema databases remain separate from retained product QA. The
  user explicitly permits durable `.test` identities and clearly labeled QA
  product artifacts for longitudinal operation under
  `docs/runbooks/quipsly-retained-dogfood.md`.
- This is local release-pipeline proof, not a production migration. Google
  Cloud authorization, guarded schema apply, matching zero-traffic Nest
  deployment, production parity, a fresh TestFlight candidate, and physical
  iPhone acceptance remain open. Exact evidence is in
  `docs/coordination/2026-07-31-schema-pipeline-hardening.md`.

## Capture accessibility and held Build 22 checkpoint

- Exact source `10d5ba8d709ec8a6479979d72866212e555bf4f7` hardens
  the shipping Today, Work, Library, Account, Record, consent, rehearsal, and
  transcript-review surfaces for the largest accessibility text size and
  Increase Contrast.
- Work now has an app-owned self-sizing search control, explicit keyboard
  dismissal, adaptive project identity/metrics, and a 44-point shared-tag
  management target. The Account identity card has one human-readable
  assistive-technology projection instead of exposing decorative or raw-email
  elements.
- The exact commit passes all 41 Capture Experience journeys and all 3
  Safari/Share Extension journeys on iPhone 17 Pro / iOS 26.3.1, plus 902/902
  native/App Store checks and 168/168 cross-surface contracts. The retained
  Work journey types and clears a real task query before continuing through
  the shared vocabulary and canonical project records.
- Quipsly Capture 1.0 (22) is a qualified, signed candidate from frozen source
  `8ec38f09cd5842ff67d346c0b8d6c41f557b8081`, but its receipt explicitly says
  no upload was attempted. Fresh Apple readback confirms Build 22 is absent.
  Its 21,141,551-byte IPA has SHA-256
  `2804812646db6caa37dfc7fb8badb7d2134b0047ef0205ac284d12e47c4520c1`.
- Build 22 stays held until the matching Nest schema/backend passes guarded
  deployment and production readback. Current Google Cloud and Firebase
  authorization checks require reauthentication. No physical iPhone is
  visible through USB or CoreDevice, so physical install/capture/recovery and
  same-ID Nest readback remain open.
- Build 20 remains the canonical external target. Fresh App Store Connect and
  anonymous public-link readback confirm it is valid, externally in beta,
  included in the open rehearsal group, and exposes Apple's exact install
  handoff. Exact evidence and loop-back commands are in
  `docs/coordination/2026-07-31-capture-accessibility-build22-hold.md`.

## Capture Build 21 internal checkpoint

- Quipsly Capture 1.0 (21) was built and uploaded from exact detached source
  `0c88e037d48c39797d8c532f3d635dce0b4b5877`.
- Two independent exact-source candidate runs each passed all 46 serialized
  iPhone and Share Extension journeys with zero failures, then passed source,
  privacy, entitlement, provisioning, nested-signature, and exported-IPA
  inspection.
- The upload-bound IPA is 21,141,478 bytes at SHA-256
  `c6531d42e8f22b1a72a1010d556190fb8d2532461abebfd0879d0fe9ff3baf00`.
- Independent App Store Connect readback identifies build
  `9bb30af2-423e-4164-a878-fcb8df00c78c` as `VALID`, internally
  `IN_BETA_TESTING`, included in **Quipsly Capture Internal**, and using no
  non-exempt encryption.
- Build 21 remains externally `READY_FOR_BETA_SUBMISSION` and is not in the
  **Quipsly Capture Rehearsal** public-link group. The read-only external plan
  is ready to update beta notes, enable automatic notification, assign the
  build, and submit it for review only after the matching Nest schema and
  backend pass zero-traffic production acceptance.
- Build 20 remains the approved external/public rehearsal target. Physical
  installation and real-device capture remain separate proof boundaries.
- The complete Build 21 release evidence is preserved outside Git at
  `/Volumes/My Passport/Quipsly Release Evidence/2026-07-31-build21`.
- Retained QA users and artifacts now follow
  `docs/runbooks/quipsly-retained-dogfood.md`, committed at `50c8a9e3`, so
  longitudinal product data is intentionally labeled, isolated, provenance
  bearing, and preserved without leaking credentials or implying external
  effects.

## Episode collaboration release

- Capture now exposes the canonical Episode Room conversation beside Manuscript
  and Watch in an episode-bound recorder session.
- The server derives the thread from a verified parent episode inside the
  authorized Nest. Editors can post, Viewers can read, and outsiders cannot
  disclose an episode or create an invented shadow thread.
- Web and iPhone posts carry stable retry identities. The native app keeps a
  read-only, account-partitioned, file-protected offline copy and clears it on
  account change or signout.
- Retained local and production QA users operated the rendered Episode Room,
  posted clearly labeled durable regression messages, retried one production
  post with the same UUID, and verified exactly one persisted copy.
- The release-target ledger and rehearsal runbook identify approved external
  Build 20. Fresh App Store Connect and anonymous public-link readback confirms
  it is `VALID`, `APPROVED`, externally `IN_BETA_TESTING`, assigned to the
  rehearsal group, and publicly available.
- Focused route and PostgreSQL retry/collision tests, complete Quipsly Jest, TypeScript 7,
  cross-surface contracts, the optimized 150-route build, App Store static
  checks, a native simulator build, and all 46 serialized deterministic iPhone
  and Share Extension journeys pass.
- Exact source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f` is deployed to
  production and distributed through TestFlight as Build 20. Physical install,
  real-device media, and genuine two-person use remain open. Exact evidence is
  in
  `docs/coordination/2026-07-31-episode-collaboration-readiness.md`.
- The retained local QA account also operated a complete rendered
  Nest → note/tag/task/goal → linked work → progress → Calendar → Today flow.
  Exact IDs, labels, UX observations, and the explicit local-only boundary are
  in
  `docs/coordination/2026-07-31-retained-capture-follow-through-dogfood.md`.

## Quipsly release checkpoint

- `nest.quipsly.com` is serving Cloud Run revision `studio-00470-has` from
  source `d410e03e14ed723ff4b1f66c50e1c620ab65cb9f`, built by Cloud Build
  `1a9872c0-05aa-48ed-81e0-f8aeecd88dea` and pinned to immutable image
  digest
  `sha256:5f2a5b2381ba2523bcfb1c0898873ce1c4e8a1ddbb5757cdf749d71fc7e38fad`.
- Episode Room can project an existing, same-Nest audio or video source from
  the canonical Media Vault into shared Watch without duplicating source
  bytes. Editors can control Watch and explicitly sync receipt-backed watched
  spans to the episode timeline; viewers remain read-only.
- A retained local QA identity has an operated Media Vault to Episode Room to
  Watch to timeline regression journey. The exact release evidence and scope
  boundary are in
  `docs/coordination/2026-07-30-episode-room-media-vault-watch-release.md`.
- Quipsly Capture 1.0 (20) is valid, approved, and externally
  `IN_BETA_TESTING`. It is assigned to the `Quipsly Capture Rehearsal`
  external group and available through the open 100-person public link at
  `https://testflight.apple.com/join/XwRRcYUm`.
- Exact saved Media Vault range playback is implemented and qualified at
  `c05ce5cd`, including distinct Watch/source identity, web and iPhone range
  clamping, shared-clock out-point handling under autoplay denial, and
  non-destructive timeline materialization. The retained local QA journey
  produced a source `4–12` / duration `8` derivative and left its durable test
  history in place.
- The saved-range slice is in production. Build 20 negotiates Watch
  protocol 2 and receives exact saved ranges. Legacy Build 18 keeps
  whole-source behavior and fails a selected range safely closed. The exact
  backend was previewed, reviewed with a generated real account, promoted, and
  read back before Build 19 was archived and uploaded.
- Build 20 passed 46/46 deterministic UI tests from an independent detached
  release worktree, plus distribution-signature, provisioning, privacy,
  entitlement, and IPA inspection. App Store Connect independently reports it
  `VALID`, beta-review `APPROVED`, and externally `IN_BETA_TESTING`.
- Physical TestFlight installation and real two-person camera, microphone,
  call, consent, saved-range Watch, upload, and editor-alignment rehearsal
  remain separate human proof boundaries. The exact evidence is in
  `docs/coordination/2026-07-30-episode-room-saved-range-readiness.md`.

## What The Repo Is Right Now

High Ground Studio is a monorepo with:

- a primary Next.js app in `apps/web`
- a Vite motion playground in `apps/motion-lab`
- a shared motion engine package in `packages/motion-engine`
- a Prisma/Postgres data model for identity, clients, memberships, coaching
  feature grants, and appointments
- a large content tree spanning published MDX, staging content, and raw manuscript/research material

## What Is Real And Working

- Google sign-in is wired through NextAuth in `apps/web/src/auth.ts`.
- App users are persisted in Prisma and merged by primary/alias email in `apps/web/src/lib/server/user-identity.ts`.
- Role-aware gating exists for team/internal access in `apps/web/src/lib/authz.ts` and `apps/web/src/lib/content-access.ts`.
- `/dashboard` renders signed-in client membership, manual coaching feature
  grants, appointment, recent coaching request, and converted appointment data
  from Prisma.
- `/dashboard?intent=coaching` renders the signed-in coaching request form and posts to `submitCoachingRequestAction`.
- `/dashboard` shows recent coaching request status, assigned coach when present, converted appointment summaries, Google Calendar add links for converted appointments, and a pay-what-you-can contribution CTA when `HGO_COACHING_DONATION_URL` and appointment data are present.
- `/team/clients` supports:
  - pre-provisioning client users
  - alias email capture
  - promoting existing users to clients
  - seeding membership plans
  - granting/updating memberships
  - seeding a manual coaching tool catalog
  - enabling, pausing, or disabling client-specific coaching feature grants
    outside subscription tiers
- `/team/coaching-requests` supports:
  - viewing the 50 most recent coaching requests
  - status counts for `NEW`, `CONTACTED`, `SCHEDULED`, `CLOSED`, and `DECLINED`
  - assigning a coach and saving internal notes
  - marking requests contacted, closed, or declined
  - converting eligible requests into appointments
- `/team/appointments` supports:
  - creating appointments
  - updating appointments
  - marking appointments canceled/completed
  - generated Google Calendar event-template links
  - a visible donation-link configured/missing indicator
- `/library` works as a curated index using hand-authored episode/reading metadata from `src/lib/site.ts` and `src/lib/reading.ts`.
- `/coaching` is a stable public front door for coaching offers and sign-in handoff.
- New coaching requests create/confirm the client role and client profile, store a `CoachingRequest`, and attempt a best-effort internal Resend email notification after the database transaction commits.
- Coaching request email notifications go to active users with `OWNER`, `TEAM_SCHEDULER`, or `COACH` roles and do not block the user success redirect if email fails.
- The live `apps/web` Cloud Run service now mounts `DATABASE_URL` from
  `web-cloudsql-database-url`, which targets the `web` database on Cloud SQL
  instance `high-ground-odyssey:us-central1:studio-postgres`. The immediate
  rollback is the previous Cloud SQL-backed revision; the older Neon-backed
  revision remains a deeper rollback anchor while the cutover gains runtime
  history.
- The live `apps/web` Cloud Run service is now reachable at
  `https://app.highgroundodyssey.com`, with Cloud Run managed TLS, the Google
  OAuth callback, and runtime `AUTH_URL` / `HGO_SITE_URL` aligned to that app
  domain. The generated Cloud Run URL remains an operational fallback, not the
  canonical user-facing origin.
- `/updates` is a public build journal for the High Ground Odyssey team and
  friends. It renders the same checked-in progress story data as protected
  `/team/progress`, and future agents can add entries with
  `pnpm progress:story:add`.
- The internal Learning to Lead Story Map can save database-backed Live Story Drafts attached to Story Candidates and Homer source blocks. These drafts are live app state, not canonical manuscript truth.
- The private Studio `/manuscript` desk can save and load manual server
  snapshots through Cloud SQL-backed `StudioManuscriptSnapshot` rows. The
  everyday UI keeps `Save manuscript`, `Copy phone link`, and `Load latest`
  visible in a Save and Share panel, while old snapshot/export/smoke/publish
  machinery is behind Dev Mode. The manuscript filter lens is available from a
  desktop top-bar Filter button and a mobile bottom-bar Filter button. The
  stable private route `/manuscript/live/latest` opens the newest saved server
  snapshot for an authorized Studio user. The browser-local draft remains the
  active working copy unless the user enters the live room; server snapshots are
  cross-device checkpoints and latest-backup anchors, not canonical manuscript
  truth. Chapter and episode boundary markers style their title lines in the
  editor, live room, and read-only live links; chapter labels use the written
  title such as Preface or Introduction instead of forcing `Chapter 1`.
- The private Studio live manuscript room at `/manuscript/collab/latest` is the
  current production-ish co-editing path. It uses a private token-gated
  Hocuspocus/Yjs room backed by Cloud SQL `ydocState`, presence, author and
  semantic marks, structure markers, safe latest-backup handoff links, and
  short-idle auto-save into the latest manuscript backup. Episode structure
  markers derive Wednesday publication dates from manuscript order, anchored on
  Episode 4 publishing June 3, 2026.
- The private Studio `/manuscript` desk now has a Manuscript Library MVP in
  `Backup` mode. A named `StudioManuscript` can group manual snapshots, mark a
  manuscript as `WORKING` or `SYNTHETIC`, and load the latest snapshot for that
  selected manuscript. Existing snapshots without a manuscript id remain
  loadable as legacy/orphan snapshots.
- The private Studio `/manuscript` desk now includes a Publish / handoff mode
  that derives browser-only readiness reports and Markdown exports from the
  existing browser-local draft, structure regions, author marks, cited
  quotations, quote review metadata, and manual snapshot status. These exports
  do not write server files or canonical public content.
- The private Studio `/manuscript` desk now includes a synthetic smoke draft and
  real-manuscript readiness gate. The smoke draft is fake text only and is meant
  to test marks, structure, quotes, quote reviews, manual snapshots,
  phone/second-browser loading, Recording / Reading mode, and Publish exports
  before real manuscript material enters Studio.
- The private Studio `/manuscript` desk now has mobile writing and semantic
  highlighting controls. Phone-width users can mark selected text by author,
  choose and apply semantic tags, mark cited quotations, enter semantic Focus
  View, and return to the manuscript surface without relying on the desktop
  sidebar.
- The private Studio `/manuscript` desk can mark chapter title blocks and
  derive chapter ranges from current manuscript order. The saved draft keeps a
  `chapterTitleBlocks` marker list, while the chapter map treats each title as
  the start of a chapter that continues until the next marked title.
- The current Manuscript Desk improvement roadmap is recorded in
  `docs/plans/studio-manuscript-desk-improvement-roadmap.md`, with competitive
  research in
  `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`. The
  roadmap preserves the long manuscript as the home surface and treats maps,
  semantic lenses, review queues, timelines, source bibles, and exports as
  projections around the same block-aware draft state.
- The private Studio `/manuscript` desk can generate a browser-only HGO episode
  projection JSON draft from synthetic/tagged manuscript metadata in Publish
  mode. The export is a projection draft/staged review draft, not raw
  manuscript draft JSON, not a server publish, not canonical public content,
  and not public-safe until citation/public-safety review is complete.
- Studio now has a local-only synthetic collaboration lab at
  `/manuscript/collaboration-lab`. It uses Yjs in browser/session memory to
  model two manuscript-shaped clients, synthetic block edits, synthetic tags,
  manual sync, snapshot export, and convergence checks. It is not connected to
  production `/manuscript`, does not write localStorage, does not call server
  routes, does not autosave, and does not enable real simultaneous editing.
- Studio has pure collaboration lab validation through
  `pnpm studio:collab:test`, `pnpm studio:collab:checkpoint:test`,
  `pnpm studio:collab:adapter:test`, `pnpm studio:collab:span:test`, and
  `pnpm studio:collab:agentic-smoke`. These use synthetic data only and write
  generated reports under ignored `artifacts/` paths.
- Studio has a local-only collaboration checkpoint bridge. It exports a Yjs lab
  client into `studio-collaboration-checkpoint-v1`, validates safety flags,
  imports the checkpoint into a new synthetic client, and confirms blocks, text,
  tags, empty blocks, and summaries survive. It is not a production manual
  server snapshot and does not touch production `/manuscript` save/load.
- Studio has a synthetic-only collaboration Manuscript adapter bridge. It
  converts `studio-collaboration-checkpoint-v1` into
  `studio-collaboration-manuscript-adapter-v1`, creates a valid synthetic
  `ManuscriptDraft` subset with title, ordered paragraph blocks, block ids,
  text, synthetic author/tag metadata, empty structure regions, and empty quote
  reviews, then converts back into a collaboration checkpoint/client. It is not
  a production Manuscript Desk import, does not call snapshot APIs, does not
  write localStorage, does not autosave, and does not touch manual snapshots.
- Studio collaboration now has synthetic span semantics. The local Yjs lab can
  add addressable synthetic spans over block text, sync them between Charlie and
  Homer clients, carry them through snapshots/checkpoints, and map
  non-overlapping spans into `semanticHighlightMark` ranges in the synthetic
  Manuscript adapter payload. The lab UI now leads with a shared long manuscript
  surface to reinforce that collaboration should happen over one manuscript
  stream, not disconnected cards.
- Studio collaboration now has synthetic local presence and manuscript margin
  awareness in `/manuscript/collaboration-lab`. Presence tracks Charlie and
  Homer active block/span/mode/last action in React state only and renders
  margin cues around the shared manuscript surface. Presence is explicitly not
  durable manuscript content and is excluded from snapshots, checkpoints,
  Manuscript adapter payloads, localStorage, server routes, and production
  manual snapshots.
- Studio collaboration now has synthetic span-anchored review notes in
  `/manuscript/collaboration-lab`. Notes can be authored by Charlie or Homer,
  marked `open`, `addressed`, or `archived`, and shown as margin/side-panel
  context around the shared manuscript surface. For this sprint they are
  React-state-only local annotations: not source text, not presence, not Yjs
  snapshot state, not collaboration checkpoints, not Manuscript adapter payloads,
  not localStorage, not server routes, and not production manual snapshots.
- Studio collaboration now has a synthetic annotation durability decision
  helper and lab UI summary. It compares annotation event log, checkpoint
  metadata, and separate annotation store options, then recommends event-log
  operations plus a separate annotation store for future durable review notes.
  Checkpoint metadata is explicitly not the primary recommended store because
  manual snapshots should remain rollback anchors, not comment warehouses.
- Studio collaboration now has a synthetic annotation event-log lab. It models
  review-note create, edit, and status-change operations, replays them into
  materialized annotation state, and can produce a safe future snapshot
  reference shape. The event log is pure/local only and is excluded from
  snapshots, checkpoints, Manuscript adapter payloads, localStorage, server
  routes, DB/schema, and production manual snapshots.
- Studio collaboration now has a synthetic materialized annotation-state lab.
  It derives current review-note state from the event log, indexes notes by
  span/block/status, and creates a safe annotation-state reference for future
  checkpoint linkage. It is not persistence and is excluded from localStorage,
  server routes, DB/schema, checkpoints, Manuscript adapter payloads, and
  production manual snapshots.
- Studio now has a private Content Management Studio route at
  `/content-studio`. It creates podcast, book, episode-page, monetization, and
  coaching project boards from templates, tracks source/shape/produce/publish/
  follow-through checklists, stores the active working state in browser
  localStorage, exports/imports JSON handoff packets with safety flags,
  generates selected-project production packets, emits valid staged HGO
  projection drafts for podcast and episode-page projects, and can save/load
  explicit server checkpoints through private Prisma-backed
  `StudioContentWorkspaceSnapshot` rows when the Studio database schema is
  applied. It can also save, list, and open individual durable project records
  through private Prisma-backed `StudioContentProject` rows for cross-device
  podcast, book, and episode-page working state. It can also refresh recent
  checkpoint history and load a specific checkpoint as a manual recovery/
  rollback action. These checkpoints and durable project records are manual
  working anchors, not autosave and not canonical publishing state.
  The route does not call provider
  APIs, publish public content, use real manuscript/HGO source material in
  tests, or replace existing HGO/WorldHub/coaching workflows. The broader
  Production packets are browser downloads/review payloads only: they do not
  call provider APIs, publish public pages, or certify public safety. The
  provider-neutral type/sample-data contract lives in
  `packages/content-studio-domain` for future shared packets and persistence.
  The Content Studio HGO handoff copies the full selected production packet into
  `/projection-stage/import` so HGO can extract the staged projection draft
  without losing packet context, and it links to the private HGO publish queue
  after staged artifacts are saved.
- WorldHub now has the first database-backed integration workspace at
  `/team/worldhub`. The page can initialize or refresh provider connection
  records for Stripe, Patreon, Google Calendar, merch storefront, merch
  fulfillment, Google Analytics, Google Search Console, Google AdSense,
  affiliate links, direct sponsors, Resend, and the app-owned cart boundary. It
  checks whether expected env names are present, stores only readiness metadata
  and env names, and shows current app-owned counts for memberships, future
  appointments, unsynced appointment candidates, carts, orders, fulfillment
  jobs, sync jobs, and provider events. New private Prisma models include
  provider connections, provider events, provider sync jobs, catalog items,
  offers, carts, orders, fulfillment jobs, SEO briefs, analytics snapshots, and
  monetization placements. `/team/worldhub` can now queue the next unsynced
  Google Calendar appointment jobs and, when `GOOGLE_CALENDAR_*` credentials
  are configured, create or update Google Calendar events and write
  `Appointment.googleEventId`. Stripe and Patreon webhook endpoints now verify
  provider signatures and store provider-event summaries in the WorldHub event
  inbox. This is still guarded integration plumbing: no checkout session
  creation, no automatic payment reconciliation, no Patreon entitlement
  mutation, no payment-card handling, no public publishing, and no merch
  fulfillment call is active yet.
- WorldHub Growth now has a private `/team/growth` desk for SEO briefs, manual
  analytics snapshots, AdSense/ad slot planning, affiliate/book recommendation
  placements, direct sponsor slots, and monetization research notes. The page
  can seed a starter foundation and a research library covering memberships,
  owned checkout, podcast subscriptions, video monetization, display ads, book
  affiliates, sponsorships, merch, SEO loops, and disclosure rules before
  Google Analytics, Search Console, AdSense, or affiliate-provider accounts are
  connected. The root web layout can load a Google Analytics tag from
  `HGO_GA_MEASUREMENT_ID`, can load AdSense Auto ads only when
  `GOOGLE_ADSENSE_CLIENT` and `HGO_ADSENSE_AUTO_ADS_ENABLED=1` are present,
  and serves `/ads.txt` from configured AdSense env values. Affiliate
  placements carry disclosure text in the private ledger; public affiliate
  publishing is still a later reviewed step.
- HGO has a browser-only `/projection-preview/import` route that accepts pasted
  projection JSON, validates lifecycle/visibility/citation state, and renders it
  with the same projection preview component without persisting or publishing it.
  It warns when Studio browser bridge drafts include pull quotes, staged
  status/visibility, unresolved citation state, or live/public state.
- HGO has a synthetic-only staged projection surface at `/projection-stage` and
  `/projection-stage/[slug]`. It uses the same projection renderer and a
  fixture-backed repository to show staged review/readiness architecture without
  replacing public `/episodes`, persisting projection artifacts, or using real
  HGO/manuscript content.
- HGO has a synthetic-only staged review gate at `/projection-stage/review`.
  It groups projection fixtures into blocked, needs-review, and live-safe
  states using pure promotion-readiness helpers. It makes blockers and warnings
  visible but does not offer a real publish action.
- HGO has a browser-first staged import review route at
  `/projection-stage/import`. It accepts pasted Studio/HGO projection JSON in
  browser state, can load copied JSON from the clipboard, validates it, runs
  the staged review gate against it, and renders it through the shared
  projection renderer with staged links. It also accepts full Content Studio
  production packets and extracts `hgoProjectionDraft` after packet safety
  checks. It can create a browser-created downloadable staged artifact JSON
  review packet containing the projection, validation warnings, review gate, and
  explicit `persisted: false` / `published: false` safety flags. Signed-in team
  operators can explicitly save that artifact to the private staged artifact
  store; anonymous visitors still only get browser review. It does not publish,
  replace public `/episodes`, or use real content in tests.
- HGO has a browser-only staged artifact inspection route at
  `/projection-stage/artifact`. It accepts pasted or clipboard-loaded
  `hgo-staged-artifact-v1` JSON, validates the artifact contract, validates the
  embedded projection, checks embedded review-gate id/slug/title/status/
  visibility identity, shows safety flags, and renders the embedded projection.
  It does not persist, publish, write local storage, verify public safety,
  replace public `/episodes`, or use real content.
- HGO has a browser-session staged artifact Store Lab at
  `/projection-stage/store-lab`. It imports validated `hgo-staged-artifact-v1`
  JSON into React state only, models future private-store lifecycle behavior,
  shows review status, promotion readiness, archive behavior, event logs, and a
  simulated promotion-candidate boundary. It does not persist, write
  localStorage/sessionStorage, call a server route, publish, replace
  `/episodes`, or use real content.
- HGO now has a private staged artifact store slice:
  - Prisma model: `HgoStagedProjectionArtifact`
  - API route: `/api/hgo/staged-artifacts`
  - team route: `/team/hgo-staged-artifacts`
    The API is team-gated, saves only validated `hgo-staged-artifact-v1` review
    packets, preserves embedded artifact JSON with `persisted: false` and
    `published: false`, stores server persistence metadata outside the artifact,
    and does not publish public pages. The team route exposes copy/download/open
    handoff controls for saved artifact JSON and derived private episode-page
    publish-candidate packets.
- HGO now has a private episode publish queue at `/team/hgo-publish-queue`.
  It derives `hgo-episode-publish-candidate-v1` packets from saved staged
  artifacts, groups them into ready/not-ready/archived review lanes, and keeps
  proposed routes, blockers, warnings, required human review steps, handoff
  packets, and rollback posture together. Each saved artifact also has a
  private `/team/hgo-publish-queue/[recordId]` review detail page that derives
  an `hgo-episode-publish-review-brief-v1` packet with proposed file targets,
  validation commands, safety flags, and future rollback notes. The detail page
  also derives an `hgo-episode-publish-draft-v1` packet with proposed
  frontmatter, a private MDX draft body, and copy/download controls for the
  packet, MDX draft, and frontmatter export. Its
  private `/team/hgo-publish-queue/[recordId]/preview` route renders the saved
  staged artifact through the shared HGO projection renderer before any public
  route work begins. It does not create public routes, mutate content files,
  publish pages, certify citation/public-safety review, mutate stored
  artifacts, or call providers.
- HGO private publish review can now save a durable DB-backed publish intent.
  The `/team/hgo-publish-queue/[recordId]` detail page exposes an explicit
  `Save Publish Intent` action for ready packets. That action creates one
  `HgoEpisodePublishCandidate` row linked to the saved staged artifact and
  stores the candidate packet, review brief, draft packet, frontmatter, and MDX
  draft as private review data. It is additive persistence only: it does not
  create public routes, write content files, replace `/episodes`, call
  providers, or mark the page live.
- HGO also has a private `/team/hgo-publish-draft-lab` route for portable
  `hgo-episode-publish-draft-v1` packets. A team operator can paste a packet,
  validate the private-review boundary, inspect the generated MDX draft, and
  copy/download frontmatter without touching public content or the database.
- HGO has a pure staged artifact contract test command,
  `pnpm hgo:artifact:test`, covering synthetic artifact creation, parser and
  validator state, invalid version, persisted/published safety failures,
  missing projection, review-gate mismatches, credential-marker rejection, safe
  file naming, and summary fields.
- HGO has a pure staged artifact Store Lab test command,
  `pnpm hgo:store-lab:test`, covering session-only import, invalid artifact
  rejection, persisted/published rejection, duplicate active artifact behavior,
  review status updates, simulated promotion-candidate gating, archive behavior,
  summary counts, lookup, and status grouping.
- HGO has a private staged artifact store plan in
  `docs/architecture/hgo-private-staged-artifact-store-plan.md`. The first
  additive model/API slice now exists, while public promotion, deletion,
  provider calls, live `/episodes` replacement, and real content workflows are
  still deferred.
- The repo now has an agentic Studio/HGO smoke command,
  `pnpm studio:hgo:agentic-smoke`, that uses synthetic data only to exercise
  Studio manuscript helper payloads, HGO projection generation, HGO validation,
  and machine-readable report output. It is API/helper-level for now because
  authenticated browser automation needs a safe test-auth or private storage
  state path.
- The repo also has an operator-assisted browser smoke command,
  `pnpm studio:hgo:browser-smoke`. It requires a private Playwright storage
  state at `artifacts/auth/studio-storage-state.json`; if that file is missing,
  it writes a machine-readable `blocked` report without opening a browser or
  performing server writes. When valid auth state is supplied, it may create
  synthetic-only Studio manuscript/snapshot records and then preview the HGO
  projection import.
- HGO has a no-auth browser smoke command,
  `pnpm hgo:projection:browser-smoke`, for the projection import/render path.
  It uses synthetic HGO projection JSON only, opens `/projection-preview/import`,
  confirms validation warnings and the shared renderer, checks
  `/projection-stage`, `/projection-stage/review`, `/projection-stage/import`,
  `/projection-stage/artifact`, `/projection-stage/store-lab`, and a staged
  detail route, verifies known real-content markers are absent, writes a
  machine-readable report, and performs no server writes. If `HGO_BASE_URL` is
  not set, it starts the web app locally on an available test port and shuts it
  down after the run.
- HGO also has a no-auth visual smoke command,
  `pnpm hgo:projection:visual-smoke`, for synthetic screenshot artifacts. It
  visits the projection preview map, import route, rendered import state, and
  synthetic projection detail routes, including Store Lab empty, imported,
  reviewed, and archived states, writes a route-matrix report, captures screenshots
  under `artifacts/playwright/hgo-projection-visual-smoke/`, checks known
  real-content markers are absent, and performs no server writes.

## Current Coaching Workflow

- `/coaching` is the public coaching front door. Its `Book a Session` calls to action send signed-in users to `/dashboard?intent=coaching` and anonymous users through sign-in with that dashboard intent as the callback.
- `/dashboard?intent=coaching` is the active signed-in intake surface. The form captures preferred contact method, optional phone, optional note, and an SMS consent notice if the user selects text follow-up.
- Submitting a coaching request writes Prisma state first, then attempts internal email notification. The primary user path succeeds even if the email attempt returns a structured failure.
- `/dashboard` shows the latest coaching request plus recent older requests. Converted requests show appointment summaries and Google Calendar links.
- `/team/coaching-requests` is the internal request queue and appointment conversion screen. Conversion creates an `Appointment`, marks the request `SCHEDULED`, assigns the coach, links `convertedAppointmentId`, appends internal scheduling notes, and revalidates `/team/coaching-requests`, `/team/appointments`, and `/dashboard`.
- `/team/appointments` remains the general internal appointment scheduling and editing screen. It can create appointments directly or manage appointments produced from coaching request conversion.
- Donation support is currently an external pay-what-you-can link controlled by `HGO_COACHING_DONATION_URL`.
- Google Calendar support still keeps link-generation through `buildGoogleCalendarEventUrl()` as the customer-facing fallback. The internal `/team/worldhub` page can now queue sync jobs and create/update Google Calendar events when dedicated `GOOGLE_CALENDAR_*` server credentials are configured. Appointment cancellation sync is not active yet.
- SMS/Twilio sending is not wired into the current coaching request flow. A server-only Twilio helper exists, but there are no active call sites from coaching actions.

## What Is Intentionally Not Finished

- Stripe checkout is not active.
- Stripe webhook event intake is active at `/api/worldhub/webhooks/stripe`, but Stripe checkout and payment reconciliation are not active.
- Full Stripe Checkout is not active for coaching. The current donation path is an external link, typically a Stripe Payment Link, not app-owned checkout/session/webhook state.
- The floating cart UI exists in layout, but checkout is placeholder-only client
  code in `src/components/cart/Cart.tsx`. WorldHub now has app-owned cart/order
  tables and provider readiness metadata, but no active checkout creation or
  payment reconciliation path yet.
- The episodes route is not on a fully settled content-loading architecture yet.
- SMS/Twilio notification delivery is not active.
- Google Calendar API synchronization is operator-triggered only from
  `/team/worldhub`. It can create or update events for eligible appointments
  when dedicated calendar credentials are configured, but automatic sync from
  appointment create/update/cancel actions is not active.
- Patreon webhook event intake is active at
  `/api/worldhub/webhooks/patreon`, but Patreon member/tier reconciliation and
  entitlement mutation are not active.
- Email notification delivery has no retry queue or persisted delivery status.
- Story Draft promotion into real `ManuscriptBlock` truth is not active.
- Story Draft revision history is not active.
- Studio Manuscript browser-local autosave in the classic `/manuscript` desk is
  not active.
- Studio Manuscript production simultaneous editing is active as an MVP in
  `/manuscript/collab/latest`, backed by the separate `studio-collab` Cloud Run
  service and a single warm instance. It is still intentionally simple: one
  shared latest room, manual/latest-backup recovery controls, and no general
  room list yet.
- Studio collaboration checkpoint lab payloads remain synthetic-only, but the
  live room now writes real latest manuscript backups through the authenticated
  checkpoint API.
- Studio collaboration Manuscript adapter payloads are synthetic bridge payloads
  only. They are not production imports, server snapshots, autosave state, or a
  collaboration-enabled replacement for `/manuscript`.
- Studio collaboration span semantics are synthetic text-offset lab semantics.
  They are not production comments, not real source spans, not DOM selections,
  and not wired to production `/manuscript`.
- Studio collaboration presence is local lab awareness only. It is not
  provider-backed, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`.
- Studio collaboration review notes are local lab annotations only. They are
  not source text, not persisted, not checkpointed, not stored in localStorage,
  and not wired to production `/manuscript`. A future production implementation
  should use annotation events plus a separate annotation store rather than
  checkpoint metadata as the primary durable comment store.
- Studio collaboration annotation event logs are also local lab contracts only.
  They prove operation replay and version references, but they are not persisted
  and are not embedded in production manual snapshots.
- Studio materialized annotation state is a local replay view only. It proves
  current-state indexing/query behavior, not durable storage.
- Content Studio keeps browser-local state as the fast working surface, and now
  has manual Prisma-backed durable project records for cross-device project
  save/list/load. It is not autosave, collaboration, a public publishing queue,
  or a provider integration.
- Studio Manuscript Library deletion, destructive cleanup, ownership transfer,
  and automatic orphan-snapshot migration are not active.
- Studio Manuscript publishing exports are working handoff artifacts, not a
  canonical publishing database or public projection pipeline.
- Studio Manuscript synthetic readiness checks are browser-local safety
  guidance. They do not write canonical content and do not replace the manual
  judgment required for the first real manuscript import.
- The Studio-to-HGO projection bridge is still manual, but no longer purely
  browser-only: Content Studio production packets can be reviewed in HGO, and
  team operators can explicitly save generated staged artifacts to a private
  server-side store. It does not create a live publish API, public deployment
  pipeline, autosave, collaboration layer, or public `/episodes` replacement.
- The HGO staged projection surface is synthetic-only. It is a review-stage
  architecture prototype, not a public publishing system or real staged content
  store.
- The HGO staged review gate is also synthetic-only. It prepares future
  staged-to-live promotion checks but does not publish, persist, or approve
  anything.
- The HGO staged import review route is browser-first and explicit-save only.
  Pasted or clipboard-loaded JSON is not autosaved, but team operators can save
  generated staged artifacts through the private API after validation. This
  writes Prisma review metadata and immutable artifact JSON, not public content.
- The HGO staged artifact inspection route is also no-persistence. It validates
  browser-created artifact JSON and renders embedded projection state, but it
  does not save, approve, publish, or verify real public-safety status.
- The HGO staged artifact Store Lab is session-only. It models private-store
  lifecycle state without writing localStorage, server state, Prisma rows,
  content files, or public routes.
- The private HGO staged artifact store is additive and team-gated. It does not
  publish, approve, delete, replace `/episodes`, or verify real public-safety
  status. Saved artifacts can be copied, downloaded, reopened in the artifact
  inspector, or turned into private publish-candidate handoff packets without
  mutating public content.
- Agentic Studio/HGO browser smoke does not automate Google OAuth and has no
  committed auth state. Operators must create private storage state locally
  before a full browser run. Missing auth state is a `blocked` result, not a
  product failure.
- The HGO no-auth browser smoke does not exercise Studio auth, manuscript
  library, or snapshot UI. It covers HGO projection import, staged review gate,
  staged projection routes, and rendering.
- The HGO no-auth visual smoke is a screenshot/report artifact pass for later
  human review. It does not exercise Studio auth, manuscript library, snapshot
  UI, real publishing, or real content.

## Current Stabilization Decisions

### 2026-08-01 production tag-taxonomy acceptance

- The canonical project-scoped tag model has now been operated against
  production through rendered Nest using the fixed retained `.test` account.
- The same retained Build 25 Project, Task, document-kernel Note, Goal, and Tag
  survived create-and-assign, rename with former-name lookup, merge preview,
  exact rollback, and final re-merge with stable identities.
- The canonical retained Tag still has exact Task/Note/Goal usage count three;
  the test source remains an archived redirect, and both historical names
  resolve to the canonical target.
- Evidence and boundary details are recorded in
  `docs/coordination/2026-08-01-production-tag-taxonomy.md`.
- Phone-width evidence exposed a long-label control that wrapped into an
  oversized pill. The local repair keeps visible `Manage` / `Close` text and
  preserves the full accessible label. It is queued for the next batched Nest
  release rather than triggering a one-change Cloud Build.

- The earlier Stripe checkout attempt was rolled back to a non-broken state.
- The episodes route currently uses a guarded loader in `apps/web/src/lib/source.ts`.
- The Fumadocs source is only enabled when `ENABLE_EPISODES_FUMADOCS=1`.
- That guard is temporary and reversible.

## Build Reality

Recently verified in local Codex sessions:

- `pnpm --filter web build` passes.
- `pnpm --filter web exec next build --webpack` passes in the current environment.
- `pnpm --filter web exec tsc --noEmit` passed during the 2026-05-07 coaching current-state sync.
- `pnpm --filter web exec next build --webpack` passed during the 2026-05-07 coaching current-state sync.

Session evidence:

- `docs/sessions/episodes-loader-guard-result.md`

Interpretation:

- both production build paths are currently green
- the older Turbopack/PostCSS failure described in session notes is now historical stabilization context, not the current repo state

## Content Reality

- `apps/web/content/publish` is the current published MDX surface and the only content directory explicitly wired into `apps/web/source.config.ts`.
- `apps/web/content/_staging` is a structured working/staging area and is not currently consumed directly by the live app code.
- `apps/web/content/_inbox` contains raw source material and research, not just ready-to-publish content, and is not part of the live content source path.
- `/library` and other curated discovery surfaces currently depend on hand-maintained metadata in `src/lib/site.ts` and `src/lib/reading.ts`, not dynamic enumeration of the content tree.

## Known Repo Friction

- The durable docs layer is new and should be kept current as repo memory evolves.
- Published MDX page source and curated discovery metadata are split across different files and must currently be kept aligned by convention.
- There are backup/scratch artifacts in the repo, including:
  - `apps/web/src/app/schedule/page.backup.tsx`
  - `pnpm-workspace.yaml.save`
  - `prisma.config.ts.bak`
  - many `.DS_Store` files

These should be treated as cleanup candidates later, not as authoritative product code.
