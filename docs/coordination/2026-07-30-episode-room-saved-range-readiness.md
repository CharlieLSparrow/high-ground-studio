# Episode Room saved-range Watch release

Released: 2026-07-30 MDT / 2026-07-31 UTC

## Exact source

- Feature commit:
  `c05ce5cd`
- Protocol-compatible Capture 1.0 (19) candidate commit:
  `579b80e6`
- Branch:
  `codex/quipsly-product-20260724`
- Production source:
  `579b80e6c0d21cbc35e88df856d169ac93bc34c1`
- Production Cloud Run revision:
  `studio-00468-bav`
- TestFlight binary:
  Quipsly Capture 1.0 (19), external state `IN_BETA_TESTING`

Build 18 predates the separate saved-range Watch identity. Build 19 therefore
adds an explicit native `watchProtocol=2` negotiation boundary. Build 18
continues receiving whole-source Watch clips. If a saved range is selected,
the legacy projection removes the unsupported range, returns an idle read-only
Watch, and sets `watchUpgradeRequired` instead of letting the old app play
outside the range. Build 19 receives the canonical range projection.

## Product behavior

- Every saved Media Vault clip is offered as an exact in-to-out range beneath
  its immutable source.
- A range has its own `watchId`, while its timeline derivative continues to
  reference the original `assetId`.
- Whole-source Watch and any number of saved ranges can coexist without
  copying source bytes or creating duplicate imported-media rows.
- Shared position remains absolute source time. A 4-to-12-second range starts
  at source second 4, ends at source second 12, and materializes an 8-second
  derivative with `sourceStart: 4` and `sourceEnd: 12`.
- Web and iPhone seek, private preview, shared playback, selection, removal,
  and end-of-range handling clamp to the exact range.
- The web room closes the range from the authoritative shared clock even when
  local browser autoplay is blocked. Local media time remains authoritative
  while media is actively playing.
- Old whole-source Episode Room JSON remains readable through the
  `watchId || assetId` compatibility projection.

## Operated acceptance

The retained `Quipsly Media QA` account exercised the rendered local product:

1. Added the retained `Canonical tag focus QA` Media Vault range without
   removing the whole source already in Watch.
2. Selected the range and verified the shared slider opened at `0:04` with an
   out point of `0:12`.
3. Started a fresh rehearsal pass.
4. Reproduced browser autoplay denial.
5. Verified the shared clock still ended the room at `0:12`.
6. Synced the receipt-backed span.
7. Read PostgreSQL back directly:
   `status: ended`, range `4–12`, segment `4–12`, one timeline row,
   timeline duration `8`, and timeline source `4–12`.
8. Opened the protected episode editor. Because this synthetic QA episode has
   only a one-second protected recording baseline, the eight-second Watch
   derivative was safely held for alignment review instead of being forced
   onto an invalid baseline.

The test identity, Nest, source, saved clip, Watch history, and timeline
derivative remain intentionally retained for longitudinal regression testing.

## Qualification

- Focused Episode Room tests: 31/31.
- Real PostgreSQL Media Vault integration: 4/4.
- Complete Quipsly Jest: 189 active suites / 943 tests.
- Cross-surface release contracts: 168/168.
- Shared native Episode Watch contract: 43/43.
- Quipsly TypeScript 7 typecheck passed.
- Optimized Next.js build passed for all 150 routes.
- Quipsly Capture built successfully for generic iOS Simulator with LiveKit
  linked.
- Git whitespace validation passed.

## Production and TestFlight evidence

- The full detached-worktree Capture preflight passed from exact source
  `579b80e6c0d21cbc35e88df856d169ac93bc34c1`.
- Cloud Build `0c4370ab-37f1-4aa7-8983-49ad23e87f39` built the bounded
  111.3 MiB committed context and verified six required route bundles inside
  the final image.
- Cloud Run revision `studio-00468-bav` was deployed at zero traffic from
  image
  `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio@sha256:180f73aa1a4221a4796dbae7e0c059bc2a678be49476b00719fdc56fb36364b4`.
- The generated reviewer exercised Firebase login, native session exchange,
  Home Nest, Sessions, Projects, writing, editor, recorder, Research,
  Publishing, logout, and both public hosts against the immutable preview.
  Cleanup independently verified deletion of the temporary Firebase and
  PostgreSQL identity and its two grants, Home Nest, and membership.
- Promotion moved only `studio-00468-bav` to 100% traffic. Post-promotion
  recovery, domain, billing, Cloud SQL, public-route, recent-error-log, and
  108-check mobile Capture contracts passed.
- The no-upload candidate lane and the upload lane each passed 45/45
  deterministic iPhone UI tests from separate detached worktrees.
- The upload-lane IPA is 20,902,385 bytes with SHA-256
  `b6c407919c6b5fdd8015266120658c94d311937f828b78b47762f0adada14bd4`.
  App and Share extension signatures, App Store provisioning, privacy
  manifests, usage descriptions, entitlements, and 1.0 (19) version parity
  passed inspection.
- App Store Connect build `035197ff-36a1-4658-b5a7-b45a910eac16` is `VALID`,
  internal-ready, and `IN_BETA_TESTING` externally with no non-exempt
  encryption.
- External beta review is `APPROVED`. The build is assigned to the
  `Quipsly Capture Rehearsal` group, auto-notify is enabled, and the
  100-person public link remains open:
  `https://testflight.apple.com/join/XwRRcYUm`.
- Independent anonymous readback returned HTTP 200, matched the Quipsly
  Capture title and heading, and exposed the exact Apple TestFlight handoff.

## Remaining human proof

The release is available for TestFlight installation. A physical install,
real camera/microphone capture, genuine two-person call and consent flow,
front/back camera operation, exact saved-range playback on both participants,
receipt sync, upload, and editor alignment remain separate human rehearsal
gates. They must not be inferred from simulator, Cloud Run, or App Store
provider state.
