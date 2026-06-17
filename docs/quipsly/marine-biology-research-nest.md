# Marine Biology Research Nest

Updated: 2026-06-10

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
- A Visual Research Lab route at `/nests/marine-biology-research/visual-research` for reef-ball image/workbook review status.
- A local packet bridge from the Reef Ball Image Workbench to the Nest through `/api/nests/marine-biology-research/visual-research/packet`.
- Quipsly Mac Vision Lab controls for reading the local packet, opening the local workbench, opening the embedded Nest lab, and importing the packet with the saved Mac Nest session.

## Workflow

1. Upload photos or video through the user Home Nest or a direct Marine Biology import path.
2. Attach selected assets to `marine-biology-research` so the research team can access them.
3. Use the living document to record batches, organisms, visible traits, uncertainty, reviewer notes, and source/provenance details.
4. Use media tags and clips to mark useful frames or segments.
5. Later, export a transparent dataset manifest for local MLE work.

## Current Reef-Ball Bridge

The Chula Vista reef-ball photos remain on the local HDD by default. The local Reef Ball Image Workbench indexes the image folder, workbook rows, masks, duplicate stacks, row-review queues, and model-prep metadata. Its Nest packet is a review artifact: it can be imported into Quipsly as `StudioSourceUnit` evidence without copying the raw photos into the cloud.

### Important for web image rendering

For `/nests/marine-biology-research/visual-research` to show image previews on `nest.quipsly.com`, configure a reachable image host:

- set `REEFBALL_WORKBENCH_URL` (or `NEXT_PUBLIC_REEFBALL_WORKBENCH_URL`) in the Quipsly deployment
- set `REEFBALL_PUBLIC_MEDIA_BASE_URL` if local-host `previewUrl`/`thumbUrl` values should be rewritten to a public object store (example: `https://storage.googleapis.com/<bucket>/reefball-workbench-media`)
- if generating packets from the deployed Reef Ball Workbench, set `REEFBALL_PUBLIC_WORKBENCH_URL` so emitted `previewUrl`/`thumbUrl` point to that same host

Quipsly Mac is the preferred operator surface for this workflow:

- Vision Lab can register the HDD dataset and open the local workbench inside the Mac app.
- Vision Lab can open the Marine Biology Nest Lab inside the Mac app using the Mac web-session bridge.
- Vision Lab can read the local packet summary and import it to the Nest API when a Mac Nest profile is connected.
- The web Nest route also exposes read/import controls for operators using a browser on the same machine as the local workbench.

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

Raw research photos should stay on approved local storage until the team intentionally chooses an upload/export path. Imported Nest packets should summarize and link local evidence, not silently duplicate the original image library.
