# Quipsly Editor Architecture Correction

> 2026-06-14 status note: this correction remains valid, but the current standalone native editor work is now centered in `apps/quipsly-video`. Read `docs/coordination/native-video-editor-control-room.md` before changing that app. This document explains the deeper source/decision correction that led to the native reset.

Date: 2026-06-11
Owner: Codex / Product Owner lane
Status: Active correction, not optional polish

## The mistake we are correcting

The Premiere rescue/import work preserved useful facts, but the Mac editor started treating Premiere-shaped timeline clips as the editor's working truth. That is wrong for Quipsly.

Premiere is an importer/translator. It is not the model.

The MVP editor model has always been:

- Source media stays whole and untouched.
- The episode timeline is an annotation layer over source media.
- Active/inactive ranges are edit decisions, not deleted media.
- Output-specific framing, crop, zoom, pan, opacity, audio gain, and shorts decisions belong to the output/edit decision layer, not to the source file.
- `Play All` reviews source timing and preserved inactive material.
- `Play Edit` plays the current active decisions.

## Current code correction

`LocalEpisodeEditSession.clips` must not be reintroduced as stored editor truth. Current local sessions should persist whole `sources` plus `editDecisions`. Some Mac UI/test names still say "clip" as compatibility vocabulary, but those should be treated as aliases over decisions until they are renamed.

New first-class MVP concepts were added in `apps/quipsly-mac/Sources/QuipslyMac/Models/LocalEpisodeEditModels.swift`:

- `LocalEpisodeSource`: whole imported media source.
- `LocalEpisodeEditDecision`: non-destructive visibility/timing instruction over a source.
- `LocalEpisodeEditSession.sources`: persisted source layer.
- `LocalEpisodeEditSession.editDecisions`: persisted decision layer.

The UI should consume `sources` and `editDecisions`, not raw compatibility `clips`.

## Rules for Antigravity / future agents

1. Do not make Premiere's timeline object model the Quipsly object model.
2. Do not promote `timelineClips` as the canonical editor truth without also preserving source and decision semantics.
3. If a feature changes what appears in the edit, it changes an edit decision or output transform, not the source media.
4. If a feature changes source availability, proxy, upload, sync, or metadata, it changes source records, not edit decisions.
5. Existing clip-named APIs can be used only as compatibility adapters over decisions until replaced.
6. Any export/publish path must be able to explain: source used, decision range, output target, transform, and whether inactive decisions were skipped.

## Immediate implementation queue

1. Finish renaming Mac Episode Editor visual layers from clip language to decision/source language.
2. Rename clip surgery UI to decision surgery UI.
3. Add a real persisted/staged JSON shape for `sources`, `syncMaps`, `editDecisions`, `outputs`, and `outputTransforms`.
4. Change Premiere promotion so it promotes a Quipsly edit graph, not only `timelineClips`.
5. Keep reversible import history and backups during migration.
6. Keep smoke assertions that Episode 1-3 have source count, edit decision count, active decision count, and inactive decision count.

## Mental model

Quipsly is not deleting clips. Quipsly is annotating source media.

Raw source is evidence. Edit decisions are labels. Outputs are render interpretations.

## 2026-06-11 product-owner correction

Do not preserve the clip-fragment structure for backwards compatibility if it blocks the MVP editor model.

If necessary, re-import the Premiere projects after the source/decision graph is corrected. The goal is not to keep a week of scaffolding alive. The goal is a lightweight Quipsly editor where:

- source media records are compact and stable;
- edit decisions are compact ranges over sources;
- output transforms belong to decisions/outputs;
- Premiere clip fragments are temporary import evidence only;
- bloated compatibility structures should be removed once the importer can write the Quipsly graph directly.

Agents should prefer deleting or replacing wrong architecture over layering UI around it.

## 2026-06-11 graph emission pass

The Premiere importer now emits `quipslyEditGraph`:

- `sources`: whole source media records.
- `syncMaps`: source-to-episode anchors.
- `outputs`: `program-16x9` and `shorts-9x16` starter outputs.
- `editDecisions`: active and inactive visibility ranges over source media.
- `transforms`: intentionally empty starter list for output-specific crop/zoom/keyframe work.

The Mac packet decoder knows this graph shape, and `LocalEpisodeEditSession` now prefers graph-native `graphSources` / `graphEditDecisions` when present. `LocalEpisodeEditClip` is demoted to legacy import-fragment scaffolding.

Validated in this pass:

1. Episode 1-3 Premiere packets were regenerated with `quipslyEditGraph`.
2. Local Episode 1-3 sessions load as stored `sources` plus stored `editDecisions`, not stored `clips`.
3. Real Mac Episode Editor smoke passed for Episode 1, Episode 2, and Episode 3.
4. Each smoke proved inactive Premiere skip decisions are preserved and visible in the timeline navigator.
5. Render-prep manifest smoke passed for Episode 1, Episode 2, and Episode 3.
6. Render-prep manifests use `decisions`, `decisionCount`, `activeDecisionCount`, `inactiveDecisionCount`, `includedDecisionCount`, and `skippedDecisionCount`.
7. Render-prep manifests preserve inactive decisions with `inactivePolicy: preserve-in-manifest-skip-in-output`.

Remaining root-removal work:

1. Rename Mac UI and store APIs from clip surgery to decision surgery.
2. Move all editing mutations to explicit decision operations, then delete fragment mutation paths.
3. Change Nest promotion to promote `quipslyEditGraph`, not `timelineClips`.
4. Remove old `timelineClips` reliance from web/Nest promotion once graph promotion exists.
5. Replace legacy smoke output names like `timelineClipCount` with decision names after downstream scripts are updated.

Do not preserve old packet compatibility if it slows this down. Re-importing is acceptable.
