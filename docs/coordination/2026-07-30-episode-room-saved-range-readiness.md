# Episode Room saved-range readiness

Prepared: 2026-07-30 MDT / 2026-07-31 UTC

## Exact source

- Feature commit:
  `c05ce5cd`
- Protocol-compatible Capture 1.0 (19) candidate commit:
  `579b80e6`
- Branch:
  `codex/quipsly-product-20260724`
- Current production remains:
  `6d4bdbfda5a39a275826502f872fb808aa78eda6` on
  `studio-00466-lib`
- Current TestFlight binary remains:
  Quipsly Capture Build 18

This slice is committed and qualified but is intentionally not deployed yet.
Build 18 predates the separate saved-range Watch identity. The candidate
therefore adds an explicit native `watchProtocol=2` negotiation boundary.
Build 18 continues receiving whole-source Watch clips. If a saved range is
selected, the legacy projection removes the unsupported range, returns an idle
read-only Watch, and sets `watchUpgradeRequired` instead of letting the old app
play outside the range. Build 19 receives the canonical range projection.

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

## Safe release order

1. Bump, archive, validate, and upload the compatible Quipsly Capture build.
2. Build the web image from exact commit `579b80e6`.
3. Deploy at zero traffic, run authenticated generated-user and Episode Room
   acceptance, and verify exact source/image readback.
4. Promote the backward-compatible backend before uploading Build 19.
5. Archive and upload Build 19 from that same exact commit.
6. Confirm App Store Connect processing and TestFlight availability.
7. Perform the real two-person iPhone/Mac rehearsal with a recording clock,
   exact saved range, receipt sync, and editor alignment.

Physical-device playback, a genuine two-person recording, TestFlight
installation, and production deployment remain separate proof gates.
