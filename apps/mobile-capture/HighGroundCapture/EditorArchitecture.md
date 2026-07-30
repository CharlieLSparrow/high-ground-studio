# Capture-to-Studio Editing Boundary

Status: production boundary

Last reviewed: 2026-07-30

## Decision

Quipsly Capture is not a second nonlinear editor.

The iPhone owns consent-aware local recording, immutable-source preservation,
recoverable upload, exact capture-clock and source evidence, light review, and
an explicit handoff into the canonical Session. Nest owns collaborative
writing, episode state, review decisions, and shared workflow. QuipslyStudio
owns deep timeline editing, synchronized playback, reframing, export, and
publishing preparation.

This boundary avoids three competing timeline implementations and keeps
source-media truth independent from whichever editor renders it.

## Non-destructive contract

Capture may record marks, source segments, camera-switch boundaries, clock
samples, consent receipts, and alignment proposals. It never rewrites source
bytes to express an edit.

The canonical editing layer keeps stable source and lane identities. Editorial
decisions such as SHOW, HIDE, trims, transcript overlays, or reframing
keyframes are reversible projections over those immutable sources. Human review
is required before a proposal becomes an editorial decision.

## Handoff contract

A Capture-to-Studio handoff is valid only when:

1. the local source is finalized and independently playable;
2. its owner, Session, source profile, byte count, duration, and digest remain
   stable;
3. Nest has a canonical, idempotent source/handoff receipt;
4. Studio reloads the saved working session and reads back the same lane IDs,
   roles, offsets, fingerprints, and provenance;
5. proxy generation leaves the original unchanged; and
6. export or publication remains a later, explicit, reviewable action.

Capture must never label a placeholder, empty composition, missing asset,
simulated response, or receipt slot as an exported or published result.

## Retired implementation

The original iOS editor experiment included a sample timeline, 360 compositor,
hard-coded developer-machine media fallback, a publisher that simulated
success, and UI tests that expected the facade result. That closed graph was
unreachable from the production iPhone root and was removed from the target on
2026-07-30.

Future iPad editing work requires a separate product decision and the same
source, revision, provenance, performance, accessibility, export-verification,
and physical-device gates as QuipslyStudio. It may not re-enter Capture as an
unqualified prototype.
