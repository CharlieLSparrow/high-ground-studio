# Capture UI test lanes

Date: 2026-08-05

## Why this changed

The deterministic Capture suite had grown to 63 shipping UI journeys in one
serial `xcodebuild` process. A current local run took about one hour, exceeded
the 45-minute GitHub Actions timeout, and reported two late failures after the
shared simulator had accumulated state. Both failures passed when rerun alone.
That is useful flake evidence, not permission to add retries or weaken the app
assertions.

## New contract

`scripts/release/quipsly-capture-ui-test-plan.mjs` parses the shipping XCTest
source and owns two explicit lanes:

- `critical`: 14 reviewed journeys across navigation, the Episode 9 consent
  crash regression, recording consent boundaries, audio evidence, Shared
  Watch, rehearsal readiness, accessibility, Google login, support evidence,
  and the Safari share extension;
- `full`: every deterministic non-screenshot journey exactly once across four
  weighted shards (currently 72 journeys).

The planner contract tests fail when a shipping test disappears from discovery,
when a critical selector no longer exists, when a full shard duplicates or
omits a selector, or when the weight spread is no longer bounded. Screenshot
automation remains intentionally outside deterministic release qualification.

Fastlane defaults `ui_test` to the critical lane. The committed-source
`candidate` lane always requests `suite: full`, runs all four shards as separate
bounded `xcodebuild` processes, reinstalls the app at each local shard boundary,
and writes an owner-only aggregate evidence manifest. A sealed upload
revalidates that the manifest is source-bound,
complete, duplicate-free, and backed by four native result bundles. Legacy
native result bundles remain inspectable, but they cannot authorize sealed
upload because they do not bind source revision or complete selector coverage;
the candidate must be requalified into the manifest contract.

Each manifest shard also records the native `xcresulttool` summary. Creation
and sealed-upload reuse independently require `Passed`, zero failed, skipped,
or expected-failure tests, and an exact match between selected, total, and
passed test counts. The combined selectors must also equal the source-derived
full plan, rather than merely having the same count. Bundle presence alone is
not qualification evidence.

GitHub pull requests run only the critical lane. Manual workflow dispatch can
select `full`; only then are the four shards distributed across four macOS
runners. This keeps ordinary iteration below the paid full-suite cost while
retaining complete on-demand and release coverage.

## Current proof

The final corrected critical-lane run on the current worktree passed all 11
journeys with zero failures on an iPhone 17 Pro simulator running iOS 26.3.1.
The XCTest body took 185.423 seconds and the complete Fastlane lane took 258
seconds, versus roughly one hour for the previous monolith. It uninstalled the
shipping bundle before the shard and self-verified the manifest before the lane
returned success.

Evidence:

```text
/tmp/quipsly-capture-ui-critical-final-proof/0500f526a3c8-dirty/20260805T221259Z-79649/quipsly-capture-ui-test-evidence.json
```

This remains simulator evidence. It does not prove a TestFlight install,
physical iPhone capture, retained-media upload, playback, or cross-device
readback.

### 2026-08-23 refresh

The planner now follows the renamed familiar microphone-level journey, accepts
the conventional `pnpm ... -- --suite=...` separator, and no longer mistakes a
newly added shipping test for a broken shard merely because a historical total
was hard-coded in its own test. The meaningful invariant remains strict: all 72
discovered journeys appear exactly once in the four balanced full shards, and
every critical selector must exist in shipping XCTest source.

The current 14-test critical lane passed serially with zero failures in 264.423
seconds. The result bundle is
`/tmp/quipsly-capture-critical-serial-20260823.xcresult`. An earlier diagnostic
attempt allowed Xcode to create parallel simulator clones; several clones failed
to launch the XCTest runner even while two clones passed their journeys. The
committed GitHub and Fastlane lanes already specify serial execution, so the
parallel attempt is infrastructure diagnostics rather than product evidence.

The first complete sharded attempt provided additional product evidence. Even
after a clean app reinstall, the coaching follow-up unsaved-edit journey stalled
after dismissing the keyboard. A process sample showed the main thread cycling
through SwiftUI/AttributeGraph layout and lazy-stack placement. The follow-up
title used a vertically growing multiline field even though a title is
semantically one line; keyboard dismissal also inserted unsaved-state content
into the same lazy recorder layout. Replacing the title with a single-line,
rounded field and explicit Done submission removed the cycle. The exact journey
then passed alone in 67.704 seconds, and the neighboring canonical-source-change
journey passed alone in 65.161 seconds.

The final complete run passed every current deterministic journey across four
clean-install shards:

| Shard | Selected | Passed | Failed | Skipped | Expected failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 15 | 15 | 0 | 0 | 0 |
| 2 | 15 | 15 | 0 | 0 | 0 |
| 3 | 16 | 16 | 0 | 0 | 0 |
| 4 | 17 | 17 | 0 | 0 | 0 |
| **Total** | **63** | **63** | **0** | **0** | **0** |

Fastlane spent 772, 997, 753, and 1,062 seconds on the four shard actions. The
manifest self-verifier matched the combined 63 selectors to the exact current
source-derived plan and independently read all four native result summaries.
The exact formerly stalled journey passed in shard two in 67.462 seconds.

Full evidence:

```text
/tmp/quipsly-capture-ui-full-post-layout-fix/0500f526a3c8-dirty/20260805T223928Z-95250/quipsly-capture-ui-test-evidence.json
```

This diagnostic manifest deliberately says `0500f526a3c8-dirty`: it records
that the tested tree was uncommitted and verifies the current source-derived
selector plan, but it is not a committed candidate receipt. Candidate
qualification still reruns the entire full lane inside the detached exact
commit before archive/export.

## Operator commands

Fast local review gate:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh ui_test \
  suite:critical \
  device:'iPhone 17 Pro'
```

Complete local qualification diagnostic:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh ui_test \
  suite:full \
  device:'iPhone 17 Pro'
```

Independently re-read a manifest or legacy native bundle:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh \
  verify_ui_evidence \
  path:/absolute/path/to/quipsly-capture-ui-test-evidence.json
```

Inspect planned selectors without starting Xcode:

```bash
pnpm quipsly:capture:ui-test-plan -- --suite=critical
pnpm quipsly:capture:ui-test-plan -- --suite=full --shard=1 --shards=4
pnpm quipsly:capture:ui-test-plan:test
```
