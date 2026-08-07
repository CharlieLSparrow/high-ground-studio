# Canonical Episode edit handoff

Date: 2026-08-07

## Decision

The Episode collaboration space is Quipsly's primary editing experience. It
owns planning, chat, transcript navigation, edit intent, annotations, review,
and execution visibility. Advanced Studio remains a deep local execution and
inspection surface, not a second competing Episode.

The browser and native surfaces share one set of authorities:

1. Immutable recording and imported-media records own source identity.
2. `StudioEpisodeProduction.timelineJson` owns reviewed placement, source
   alignment, transcript placement, and source provenance.
3. `StudioEditBranch` owns attributable, revisioned edit intent such as program
   decisions and notes.
4. Local, device, or cloud workers execute the same edit manifest and return
   evidence-bound derivatives. Their location is an execution policy, not a
   different project or timeline.

This removes the dangerous alternative in which Capture materialization writes
one timeline while the browser branch quietly retains a stale copy of its
sources.

## Source projection rule

Every Episode edit read projects synchronized sources from the current
canonical Episode timeline. The shared branch contributes edit intent only.
Before a branch decision is saved, Quipsly reprojects the current source truth
inside the transaction and writes the resulting fingerprint with the operation.

Materialized Capture clips now support same-origin protected playback routes as
well as absolute released URLs. A failed protected playback request becomes an
explicit, non-destructive hold in the editor; it never silently behaves like
valid silence and never claims the edit was damaged.

## Transcript clock rule

Materialized transcript blocks carry two clocks:

- `time` is the reviewed Episode position used by the playhead and edit.
- `sourceStartSeconds` and `sourceEndSeconds` retain immutable provider/source
  provenance.

The browser must prefer Episode `time` when present. Source-only transcripts
remain explicitly labeled `source clock`; Quipsly does not infer an Episode
placement for them. Provider words remain immutable, and accepted review IDs
remain attached to the projection.

Program duration is the maximum of declared timeline duration, canonical source
extent, and timed transcript extent. A transcript-only Episode therefore stays
seekable through its final timed turn.

## Capture handoff UX

The Episode editor resolves a unique transcript source from the canonical
Capture materialization receipt. It does not ask a collaborator to guess among
several attached sources when the receipt already proves the answer.

For a selected Capture group, the editor renders one guarded handoff showing:

- exact protected-source count;
- transcript turn count or a truthful pending state;
- initial handoff, evidence update, current, or held status;
- source lanes created/reused and unrelated work preserved;
- the materializer's exact next action and blocker messages;
- a direct route back to source transcript review.

The write continues to use the existing conflict-safe materializer. It requires
an exact timeline fingerprint, complete source decode, and reviewed alignment
for every non-spine source. Existing human decisions, source bytes, and
publication state stay untouched.

## Operated evidence

Rendered local dogfood used an isolated verified test account with explicit
editor grants. No production identity or source was changed.

### Held take

`high-ground-odyssey / capture-take-materialization-qa-20260806`

- projected one canonical audio lane into the shared editor;
- exposed the exact Capture group without a query parameter;
- refused materialization because the source lacked an exact-byte complete
  decode receipt;
- changed the disabled action from the misleading `Take is current` to
  `Resolve held evidence`;
- surfaced the protected playback 409 as a recoverable source hold.

### Fully materialized take

`high-ground-odyssey-manuscript / capture-sync-rendezvous-qa-20260805`

- auto-selected the receipt-bound transcript source among six choices;
- projected two current Capture sources and four timed transcript turns;
- reported `No change`, reusing both source lanes and preserving another clip;
- rendered Episode and source clocks together;
- moved the playhead to Episode `11.71` for a segment whose retained source
  time is `12.96`;
- produced no new browser exceptions or hydration mismatches.

### Transcript-only duration

`high-ground-odyssey / deterministic-edit-evidence-20260803`

- increased the program extent from the accidental one-second fallback to the
  full 13-second timed transcript extent;
- moved the shared playhead to the retained Homer line at 10 seconds.

## Verification

- focused Episode, Capture, transcript, playback-hold, and Audio Evidence Map
  coverage: 22 tests passing;
- full Quipsly suite: 399 suites and 2,085 tests passing, with 44 suites / 139
  tests intentionally skipped;
- strict Quipsly TypeScript: passing;
- optimized Next.js build: passing, 191 routes generated;
- local Nest, Firebase Auth emulator, PostgreSQL, transcript worker, and media
  worker: healthy.

## Next architecture slices

1. Give the browser renderer a versioned edit manifest shared with Advanced
   Studio and all render workers.
2. Add an observed local-worker heartbeat and explicit `Run locally`,
   `Run in cloud`, and automatic-policy receipts.
3. Move proxy decoding, thumbnails, waveform tiles, and light previews toward
   browser/local execution where device capability allows; keep lossless
   mastering and long final renders worker-backed.
4. Add source restoration/relink UX that can satisfy a protected playback hold
   without weakening configured media-root or immutable-byte boundaries.
5. Continue toward transcript-driven ripple edits, multicamera grammar review,
   and reversible render/export manifests inside the Episode workspace.
