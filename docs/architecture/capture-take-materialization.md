# Capture take materialization

Status: implemented production contract with retained local dogfood
Last reviewed: 2026-08-06

## Outcome

Quipsly can turn one verified Capture take into an episode-editor projection
without changing source media, guessing synchronization or speaker identity, or
starting publication. The operation is explicit, conflict-safe, reversible,
and idempotent after the artifact has been saved and hydrated by the editor.

This is the boundary between capture truth and editorial truth:

- `RecordingAsset` owns immutable capture, consent, participant, device,
  checksum, storage-generation, and local clock evidence.
- `StudioMediaAsset` and `StudioEpisodeProduction.productionJson.importedMedia`
  own the reusable media attachment and episode source bin.
- reviewed alignment receipts own non-spine source placement.
- the canonical transcript plus accepted corrections own timed words.
- the episode timeline owns editorial lanes, mappings, and later human cuts.
- publication remains a separate reviewed operation.

Materialization is a projection. It does not transfer ownership among these
records.

## Readiness contract

The planner may produce three states:

| State | Meaning | Allowed action |
| --- | --- | --- |
| `blocked` | Required identity, media, spine, or reviewed placement evidence is missing or changed. | Inspect and repair evidence; do not write a timeline. |
| `media-ready` | Protected source lanes can be created, but transcript or unambiguous speaker-camera evidence is not complete. | Materialize media and continue review. |
| `assembly-ready` | Media, corrected transcript, and explicit participant-camera mappings are all available. | Materialize the complete starting assembly for human edit review. |

A single source is its own spine. With multiple sources, Quipsly requires an
explicit spine and a reviewed alignment for every non-spine source. Clock
proposals are not silently upgraded into reviewed placement.

## Identity and transcript rules

Each generated clip carries `quipsly-capture-take-source-v1` evidence:

- capture group and CallRoom identity;
- RecordingAsset, StudioMediaAsset, and stable source identity;
- source SHA-256 and storage generation when available;
- reviewed participant and device snapshot;
- camera position when the device reported it;
- reviewed alignment receipt, or the explicit spine-origin method.

Transcript blocks retain their transcript job, segment, RecordingAsset, source
clock, correction-review, participant, and user provenance. Provider words are
not rewritten by this operation. Corrected display text is projected from the
canonical transcript review surface.

A speaker is mapped to a camera only when a reviewed transcript participant has
exactly one camera in the take with the same participant identity. Zero cameras
or multiple cameras create visible review issues rather than a guess.

## Write and replay behavior

`GET /api/episode-production/capture-takes` inspects readiness. `POST` requires
a client request ID and the exact current timeline fingerprint. The server
rechecks access and source truth, then performs a serializable transaction with
an optimistic timeline and production-version check.

The write:

1. removes only the prior machine-generated projection for the same capture
   group;
2. reuses an existing materialized lane so human trims, track moves, names,
   transforms, and manual camera choices survive later transcript enrichment;
3. holds rather than silently recreating a materialized lane that a person
   removed;
4. creates or updates deterministic source lanes and transcript projections;
5. appends a `CaptureTakeMaterializationReceipt` and canonical timeline-save
   receipt;
6. records that source media remained unchanged and publication did not start.

Property order and editor-only defaults do not create replay churn. Exact
source-set evidence retains its existing fingerprint contract. A changed source
generation, checksum, or reviewed alignment holds the prior materialization for
review instead of silently replacing it.

## Operator surface

Opening the editor with `captureGroup=<id>` reveals **Build this take into the
episode**. The panel shows protected source count, reviewed placements,
transcript readiness, explicit speaker-camera mappings, blockers, warnings, and
the safety boundaries before a write.

After a successful operation, the editor consumes the returned canonical
artifact, preserves stable `sourceId` through hydration, and suppresses no human
edit. A recheck of an unchanged take renders a disabled **Take already
materialized** control.

## Verification checkpoint

On 2026-08-06 the retained High Ground Odyssey QA episode
`capture-take-materialization-qa-20260806` was opened in the rendered local
editor and operated through the guarded button. Database readback proved:

- one verified audio source became one timeline lane;
- the materialization receipt retained the capture-group and immutable-source
  evidence;
- no transcript or camera identity was invented;
- source media remained unchanged;
- publication did not start;
- an older projection missing stable `sourceId` converged once;
- after the editor hydration fix, waiting beyond the autosave window produced
  no redundant autosave receipt;
- reinspection was inert and the action control was disabled.

The fixture is synthetic retained evidence, not the physical-device acceptance
gate. The next real gate remains a new multi-device Capture session with actual
iPhone camera, separate audio, completed transcript, reviewed alignment, and
proof-watch/listen in the editor.

## Relevant implementation

- planner: `apps/quipsly/src/lib/episode-production/capture-take-materialization.ts`
- loader: `apps/quipsly/src/lib/server/episode-capture-take-materialization.ts`
- API: `apps/quipsly/src/app/api/episode-production/capture-takes/route.ts`
- editor panel: `apps/quipsly/src/app/(app)/editor/CaptureTakeMaterializationPanel.tsx`
- canonical artifact: `apps/quipsly/src/app/(app)/episode-production/episodeArtifact.ts`
- retained fixture: `scripts/quipsly-retained-capture-take-materialization-fixture.mjs`
