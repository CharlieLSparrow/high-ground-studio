# Conflict-safe Episode evidence update

Date: 2026-08-06

## Product problem

A new exact-source transcript correctly made the retained Episode's prior
machine projection stale. The underlying write contract already preserved
human clip edits and rejected unsafe source changes, but the user-facing path
had two gaps:

1. the Session linked a ready update to Guided sync rather than the take update;
2. the editor offered a generic materialization button without explaining the
   exact effect on an existing take.

That combination hid safe capability behind the wrong mental model. It also
made a mature enrichment operation look like a first import.

## Contract and UX repair

Every successful capture-take plan now includes a deterministic impact preview:

- operation: first materialization, evidence update, or no change;
- prior materialization state;
- source lanes created and reused;
- transcript blocks added and replaced;
- unrelated clips and transcript blocks preserved;
- manual speaker-camera mappings preserved and generated mappings added.

Blocked plans expose no hypothetical impact. The plan remains a projection over
the exact current canonical timeline; it writes nothing.

The editor now labels an existing changed take **Update this take with new
evidence**, shows those counts, and offers **Update episode with current
evidence**. It also states that the server will recheck the timeline fingerprint
before writing. The existing API retains its serializable transaction,
optimistic production timestamp and timeline fingerprint checks, immutable
source boundaries, and canonical timeline-save receipt.

Session routing now distinguishes the work:

- `READY_TO_MATERIALIZE` → `#capture-take-materialization`;
- `BLOCKED` or missing evidence → `#guided-sync-wizard`;
- `MATERIALIZED_MEDIA` or `MATERIALIZED_ASSEMBLY` →
  `#automated-edit-evidence`.

## Retained rendered operation

The local retained High Ground Odyssey Episode was in
`READY_TO_MATERIALIZE` after the DJI backup transcript completed. Before the
write, the rendered editor and server agreed on this exact preview:

- zero source lanes created;
- two protected source lanes reused;
- four current transcript turns added;
- three stale machine transcript turns replaced.

The operation clicked the user-visible guarded update. Post-write readback
converged to `MATERIALIZED_MEDIA` with both recovered sources showing complete
Transcript and Editor checkpoints. The remaining speaker/camera warning stayed
visible; no camera mapping or assembly-ready claim was invented.

Actual playback then proved both protected source URLs returned bytes and
advanced together in the Remotion player. Pause stopped both. The operation
observed zero browser exceptions, did not mutate source media, did not start
publication, and cleared the rendered QA session. A second full rendered replay
reported **Take already materialized**, performed no new write, and repeated the
two-source play/pause proof successfully.

## Verification

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/lib/episode-production/capture-take-materialization.test.ts' \
  'src/app/api/episode-production/capture-takes/route.test.ts' \
  'src/app/(app)/editor/CaptureTakeMaterializationPanel.test.tsx' \
  'src/app/(app)/sessions/[roomId]/session-episode-assembly-evidence.test.ts'
node --test scripts/quipsly-retained-materialized-capture-playback-operation.test.mjs
QUIPSLY_RETAINED_CAPTURE_PLAYBACK_OPERATION=1 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  node scripts/quipsly-retained-materialized-capture-playback-operation.mjs
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
  pnpm quipsly:retained:session-source-journey
pnpm --filter quipsly typecheck
git diff --check
```

The rendered operation is intentionally retained and idempotent. A replay must
show **Take already materialized** and must not append another projection.
