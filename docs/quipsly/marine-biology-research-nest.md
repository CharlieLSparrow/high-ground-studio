# Marine Biology Research Nest

Updated: 2026-06-07

## Purpose

`marine-biology-research` is a real beta Nest for collaborative marine photo research.

It should help researchers organize photographic archives before Quipsly attempts any heavy machine-learning pipeline. The current priority is source visibility, shared access, labeling workflow, and dataset readiness.

## Current Product Contract

The Nest must support these things now:

- A real `StudioProject` with slug `marine-biology-research`.
- Normal Nest sharing through `StudioProjectAccessGrant` and `/nests/marine-biology-research/access`.
- A starter research/study document that explains photo intake, organism identification notes, evidence capture, uncertainty, provenance, and future MLE planning.
- Media attachment through the normal Home Nest / working Nest asset model.
- Plain-language guidance that attached assets become visible to collaborators who can read the Nest.

## Workflow

1. Upload photos or video through the user Home Nest or a direct Marine Biology import path.
2. Attach selected assets to `marine-biology-research` so the research team can access them.
3. Use the living document to record batches, organisms, visible traits, uncertainty, reviewer notes, and source/provenance details.
4. Use media tags and clips to mark useful frames or segments.
5. Later, export a transparent dataset manifest for local MLE work.

## What Not To Overbuild Yet

Do not build a fake ML pipeline just because the Nest mentions MLE.

Before model training, the project needs:

- clear source manifests,
- stable asset attachment,
- human-reviewed labels,
- uncertainty notes,
- train/validation/test split decisions,
- local file availability rules,
- evaluation metrics agreed with the researcher.

The first MLE implementation should probably live in the native Mac app / Vision Lab, with Quipsly Nest acting as the collaboration, dataset, and review spine.

## Data Posture

This Nest should not make automated confidence judgements in the authoring UI. It should show what is available and linked: photos, labels, source notes, reviewers, uncertainty, and output manifests. Humans decide what the evidence means.
