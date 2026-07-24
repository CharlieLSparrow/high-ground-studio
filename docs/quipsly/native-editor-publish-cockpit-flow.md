# Native Editor Publish Cockpit Flow

Status: active implementation note.

## Purpose

The native editor goal is not complete at export. The operator needs one calm cockpit that shows:

- 16:9 episode master for YouTube and Patreon.
- 9:16 short derivatives for YouTube Shorts, Instagram, Facebook, and LinkedIn.
- Podcast audio handoff for Spotify and Apple Podcasts.
- Receipt proof that distinguishes exported artifacts from real publication.

## Current product rule

Quipsly separates four truths:

1. Edit truth: SHOW/SKIP markers, crop metadata, and source choices over whole lanes.
2. Artifact truth: local files exported and probeable.
3. Upload intent: packets, copy, thumbnails, captions, platform metadata.
4. Publication proof: real URLs, scheduled links, provider IDs, or receipt JSON.

The app should never collapse those into one vague "done" state.

## This pass

- Added a Ship Map readiness deck in the Publish Workbench.
- The deck shows four output families: 16:9 episode, 9:16 shorts, podcast audio, and receipt proof.
- The deck uses status language a tired human can understand: load episode, needs prep, ready, needs receipt, proved.
- The deck remains safe for Codex because it is derived from existing receipt/artifact helpers and has a stable accessibility identifier:
  - `quipsly.ship.outputReadinessDeck`
- Added one safe primary action per Ship Map tile. These actions prepare release packets, social queues, podcast handoffs, mission JSON, or missing-proof checklists. They do not mark anything published.
- Added an Artifact Truth panel with a stable accessibility identifier:
  - `quipsly.ship.artifactTruthPanel`
- The Artifact Truth panel shows release prep phase, release folder, publish packet, social queue, podcast handoff, and human/Codex cockpit readiness without claiming platform publication.

## Next hardening targets

- Add richer direct actions from each tile: reveal artifact, open packet folder, copy platform-specific posting checklist, capture receipt.
- Surface deeper artifact-level export progress in the same cockpit so long renders do not look frozen.
- Done: `script/agentctl.sh ship-map-smoke` proves `/state` publication handoff truth agrees with `/publication_mission_control` for status, lane readiness, publication completion, receipt gaps, and deliverable coverage.
