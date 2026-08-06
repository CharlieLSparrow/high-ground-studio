# Session source-journey flight recorder

Date: 2026-08-06

## User promise

From one Session, a producer can understand what happened to every intended or
observed master without correlating several hidden tables: was it planned, did
Capture establish durable boundaries, were exact bytes retained, was a
source-bound transcript attempted, and is that exact asset in the current editor
take?

This is a read-only reconstruction. It does not create missing receipts, alter
media, enqueue transcription, change the editor plan, or start publication.

## Architecture

`buildSessionSourceJourneyProjection` joins existing projections rather than
introducing a second source-of-truth model:

- `SessionReadinessTopology` supplies declared sources, captured identities,
  expected-source bindings, and retention state.
- `SessionSourceEvidence` supplies exact RecordingAsset, finalization,
  verification, release, capture-boundary, and provenance evidence.
- `SessionFinishingEvidence` supplies the latest source-bound transcript attempt
  and canonical Episode assembly evidence.

The output is one ordered checkpoint set per source:

1. **Plan** — declared, waived/canceled, candidate review, bound, or missing.
2. **Capture** — complete start/stop boundaries, partial boundaries, or an
   explicit external-import boundary that claims no Capture history.
3. **Retain** — exact-byte verified and released, current, held/drifted, or
   missing.
4. **Transcript** — no attempt, running, held/failed, or completed with immutable
   provider segments. Completion is not a reference-transcript accuracy claim.
5. **Editor** — selected in the exact canonical assembly take, outside that
   take, or not relevant to a non-Episode Session.

The projection preserves five explicit limits:

- live call presence is not historical evidence;
- server bytes do not prove endpoint queue drain or safe deletion;
- a transcript attempt is not reference truth;
- editor materialization is not publication;
- the projection creates no source state.

## Boundary defect found and repaired

The retained QA room has four RecordingAssets in one capture group: two older
browser sources and two later recovered masters. Capture-group equality alone
therefore cannot prove membership in the current editor take.

Assembly evidence now carries `selectedRecordingAssetIds` from the materialized
source bindings. Source journeys use those exact identifiers. The capture-group
comparison remains only as a compatibility fallback for legacy test fixtures
that do not yet expose selected IDs.

This prevents a historically valid source from silently appearing in a later
take merely because both share a group identity.

## Retained operation

Run from the repository root against loopback PostgreSQL only:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-source-journey
```

The operation refuses remote database hosts and performs reads only. Against
retained room `cmsfpfwrt000db9xld8ppuon4`, it proved:

- two declared recovered masters;
- four retained source journeys;
- exactly two selected RecordingAsset IDs in the canonical editor plan;
- both selected sources have complete Editor checkpoints;
- both historical sources remain visible with Editor marked not applicable;
- no source state was mutated and publication was not started.

The honest reconstructed state is not all green. One recovered source currently
has no transcript attempt, while imported recovery sources cannot claim native
Capture start/stop receipts. Those are useful next-work signals, not reasons to
fabricate completion.

## Verification

The focused test set covers complete paths, unplanned observed sources, missing
planned masters, provenance drift plus failed transcription, external imports,
historical sources sharing a capture group, accessible rendering, assembly
evidence, finishing-cockpit behavior, and Session page integration.

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/app/(app)/sessions/[roomId]/session-source-journey.test.ts' \
  'src/app/(app)/sessions/[roomId]/session-finishing-cockpit-card.test.tsx' \
  'src/app/(app)/sessions/[roomId]/session-episode-assembly-evidence.test.ts' \
  'src/app/(app)/sessions/[roomId]/session-finishing-cockpit.test.ts' \
  'src/app/(app)/sessions/[roomId]/page.test.tsx'
pnpm --filter quipsly typecheck
node --test scripts/quipsly-retained-session-source-journey-operation.test.mjs
git diff --check
```

## Rendered-operation gap and exact loop-back trigger

The local Quipsly doctor passed health, auth-emulator, workers, and database
checks. The in-app browser then rejected control of the loopback page under its
URL security policy, so this checkpoint does not claim a rendered browser pass.
No alternate browser-control mechanism was used to bypass that boundary.

When localhost control becomes available again, open:

`/sessions/cmsfpfwrt000db9xld8ppuon4?mode=outputs`

Then verify the Source Journey section at desktop and narrow viewport widths:

- its heading and checkpoint lists are reachable by accessible names;
- all four retained journeys render;
- only the two recovered masters show Editor complete;
- the two historical sources show Editor not part of this path;
- expanding Evidence identities exposes exact plan, capture, and RecordingAsset
  IDs without leaking secrets;
- no browser console errors occur.

This rendered check is the next acceptance action for this slice; it is not a
reason to hold the independently verified read-only projection or its tests.
