# Photo Grove proof lane

Last updated: 2026-06-24

Photo Grove is Quipsly's local-first photo culling and review lane. It is inspired
by the practical "Aftershoot-like" job of getting through a pile of photos
without hurting the originals.

## Current proof

Command:

```bash
./script/agentctl.sh photo-grove-board "/Volumes/My Passport/Bender_Card_Backup/DCIM" 60
```

Latest observed output:

```text
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-091824-dcim/index.html
```

Latest counts:

- 60 RAW photos indexed.
- 60 thumbnails generated.
- 5 sequence review groups created.
- 60 grouped photos.
- 0 duplicate candidates.
- 60 pending review decisions.
- Originals mutated: false.

Generated artifacts:

- `manifest.json`: source-root, counts, photo metadata, thumbnail paths, safety truth.
- `index.html`: static culling/review board with thumbnails.
- `review-ledger.json`: pending keep/reject/rate/tag decisions.
- `review-ledger.md`: human-readable review table.
- `review-status.html`: current keep/reject/favorite/pending review status.
- `review-groups.json`: nearby sequence/burst comparison groups.
- `review-groups.md`: human-readable group list.
- `review-events.jsonl`: append-only review decision events.
- `ledger-versions/`: snapshots before metadata decision updates.
- `sidecars/*.json`: one sidecar per indexed photo.
- `export-packets/START-HERE-client-review-packet.md`: next-step review packet.
- `export-packets/photo-grove-review-candidates.csv`: portable culling CSV.
- `export-packets/START-HERE-review-export-prep.md`: current review/export-prep handoff.
- `export-packets/photo-grove-export-prep.json`: keeper/favorite/review/reject packet truth.
- `export-packets/photo-grove-export-prep.csv`: portable packet state for reviewers or agents.
- `export-packets/photo-grove-export-prep.html`: visual selected/pending/reject review surface.

## Current decision proof

Command:

```bash
./script/agentctl.sh photo-grove-decision 9784ca0a8638ba8e favorite 5 "test-favorite,proof-lane" codex "Proof decision: metadata-only favorite/rating smoke."
./script/agentctl.sh photo-grove-status latest
```

Earlier observed result:

- `_MG_5232.CR3` was marked `favorite` with rating `5`.
- `review-events.jsonl` has one event.
- `ledger-versions/` has a pre-change snapshot.
- `review-status.html` reports 1 favorite and 59 pending photos.
- Original photo files remain untouched.

The latest regenerated board resets the review ledger for a fresh 60-photo
proof session and carries the stronger `review-groups` metadata. That is
intentional: new scans create new versioned sessions instead of overwriting or
silently migrating old human decisions.

Latest group-decision proof:

```bash
./script/agentctl.sh photo-grove-group-decision sequence-001 review - "sequence-review,needs-human-cull" codex "Group decision smoke: route this sequence for human culling; originals untouched."
```

Observed result:

- `sequence-001` updated 12 photos from `pending` to `review`.
- The event includes before/after state for each updated photo.
- `review-events.jsonl` has one latest-session group event.
- `ledger-versions/` has a pre-change snapshot.
- `review-status.html` reports 12 review photos and 48 pending photos.
- Original photo files remain untouched.

Latest export-prep proof:

```bash
./script/agentctl.sh photo-grove-export-prep latest
```

Observed result:

- Export-prep packet: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-091824-dcim/export-packets/START-HERE-review-export-prep.md`.
- Export-prep HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-091824-dcim/export-packets/photo-grove-export-prep.html`.
- Counts: 0 favorite, 0 keep, 12 review, 48 pending, 0 reject, 0 selected for client proof.
- `copyPlanExecuted=false`, `originalsMutated=false`, and `externalDeliveryCreated=false`.
- A `/tmp` smoke marked one photo favorite and proved the export-prep packet refreshed to 1 selected client-proof candidate without touching originals.

## Product rules

- Original photos are never mutated.
- New scans create versioned session folders.
- Review decisions are metadata until an explicit export or delivery step runs.
- Duplicate and problem flags are review helpers, not automatic rejection.
- Sequence groups are comparison rails, not quality judgments.
- Publication, delivery, or deletion requires explicit human approval.

## Current limitations

- Image-quality scoring is intentionally conservative. The current environment
  does not include Pillow, OpenCV, or a vision model dependency, so blur/sharpness
  is marked as `not-scored` instead of pretending to be certain.
- RAW thumbnails currently depend on macOS `sips`. Smoke proved Canon `.CR3`
  thumbnails work on Charlie's machine, but future camera formats should stay
  fallback-safe.
- The current board is static HTML plus JSON/CSV artifacts. The next app-level
  step is to make these same review decisions editable inside Quipsly Studio or a
  dedicated Photo Grove app surface.

## Next best improvements

- Add a persistent Photo Grove panel to Quipsly Studio or a focused native app.
- Add dependency-backed sharpness/closed-eye/near-duplicate scoring when it is
  worth the dependency cost.
- Add client proofing packets with selected keepers, watermarked previews, and
  comment/rating receipts.
- Add app-level group keep/reject/rate/tag controls and keyboard shortcuts against the ledger.
- Add an explicit approved-derivative copy/export command that only copies
  generated previews or exported derivatives, never originals.

## 2026-06-24 - OS board Photo Grove action cards

The Quipsly OS board now surfaces Photo Grove culling/review actions directly.

Latest OS board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-112451-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-112451-quipsly-os/quipsly-os-board.json`

Current Photo Grove state shown on the board:

- 60 total photos.
- 60 RAW photos.
- 60 thumbnails generated.
- 5 sequence review groups.
- 12 photos routed to review.
- 48 photos pending cull/review.
- 0 keep/favorite/reject decisions.
- 0 client delivery/export copy actions.
- Originals remain untouched.

Photo action-card behavior:

- `Review routed photo group`: compare the current review-routed burst before deciding keep/favorite/reject/review.
- `Cull pending photo groups`: highlights remaining pending photos and favors group decisions first.
- `Open review/export-prep packet`: points to the current export-prep packet without creating delivery.
- `Review burst sequence-*`: exposes safe group-level commands from the export-prep packet.

Safety boundary:

Action cards expose metadata decisions only. They do not delete, move, overwrite, export delivery copies, or mutate original photo files.

## 2026-06-24 - Thumbnail quality hints for culling assistance

Photo Grove now creates local thumbnail-based quality hints during review-board generation.

Latest session:

- Review board HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/index.html`
- Manifest: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/manifest.json`
- Quality hints JSON: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/quality-hints.json`
- Quality hints Markdown: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/quality-hints.md`
- Export-prep HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/export-packets/photo-grove-export-prep.html`

Behavior:

- Analysis runs on generated thumbnails, not original RAW files.
- `ffmpeg signalstats` and `ffmpeg blurdetect` provide transparent metrics.
- Flags include suspect all-white previews, very-dark previews, exposure review candidates, and relative sharpness review candidates.
- Hints are review-routing aids only; they never decide keep/reject automatically.
- Quality analysis results are cached under `analysis-cache/thumbnail-quality-v2` to avoid repeating expensive thumbnail analysis for stable photo IDs.

Current evidence:

- 160 RAW photos indexed.
- 160 thumbnails created.
- 160 quality-hinted photos.
- 14 review groups.
- 24 sharpness-review candidates.
- 3 exposure-review candidates.
- 6 suspect preview candidates.
- 0 original mutations.
- 0 automatic cull decisions.
- Cache contains 160 quality records.

Known product lesson:

The first full quality pass took long enough to expose a real UX requirement: production Photo Grove should show progress and prefer background/incremental analysis rather than silent synchronous waiting.

## 2026-06-24 - Photo Grove progress and cache hardening

Photo Grove now records progress events and caches expensive derived work.

Changed behavior:

- `photo-grove-board` writes `progress-events.jsonl` into each session.
- The command prints live progress to stderr every 10 photos and at major stages.
- Quality analysis supports `--quality-mode cached|full|off`.
- Source metadata/facts cache lives under `analysis-cache/photo-facts-v1`.
- Generated thumbnail cache lives under `analysis-cache/thumbnails-v1`.
- Quality analysis cache remains under `analysis-cache/thumbnail-quality-v2`.
- Caches are keyed by stable photo ID from source path, size, and modified time.
- Cached data is derived metadata/preview material only; originals remain untouched.

Performance evidence:

- First post-refactor cache-population run: 160 photos in `213.96s`; quality cache hits 160, fact cache hits 0, thumbnail cache hits 0.
- Fully cached run: 160 photos in `2.95s`; fact cache hits 160, thumbnail cache hits 160, quality cache hits 160.
- Latest cached session: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim`.
- Latest cached session progress file: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/progress-events.jsonl`.

Latest cached session counts:

- 160 RAW photos.
- 160 thumbnails.
- 160 photo fact cache hits.
- 160 thumbnail cache hits.
- 160 quality cache hits.
- 14 review groups.
- 24 sharpness-review candidates.
- 3 exposure-review candidates.
- 6 suspect preview candidates.
- 0 original mutations.

Next UX target:

The CLI path is now fast after cache warm-up, but the product still needs a visible app-level progress surface and background/incremental analysis so first-time imports do not feel frozen.

## 2026-06-24 - Export-prep triage groups

Photo Grove export prep now includes quality triage groups. These are attention-routing cards, not automatic cull decisions. The current proof packet is:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/export-packets/photo-grove-export-prep.html`

Current proof counts: 160 photos, 160 pending, 35 quality-review candidates in export prep, no selected client-proof photos yet, no copy plan execution, and no original mutation. The next useful human/agent workflow is to review triage groups first, then record metadata-only group or photo decisions.


## 2026-06-24 14:03 MDT - Culling packet review modes

- Added `recommendedReviewMode` to Photo Grove quality triage groups so each burst/sequence names the actual reviewer job: `source-inspection`, `burst-comparison`, `keeper-selection`, or `metadata-review`.
- The generated HTML and Markdown export-prep packets now expose safe group-level metadata commands for top triage groups.
- Latest packet: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/export-packets/photo-grove-export-prep.html`.
- Current counts remain conservative: `160` total photos, `160` pending, `35` quality review candidates, `0` selected, `0` originals mutated, and `0` copy plan executed.
- First review groups now route as: `sequence-001` source-inspection, `sequence-011` burst-comparison, `sequence-002` source-inspection, `sequence-010` burst-comparison.


## 2026-06-24 14:43 MDT - Focused first review batch

The Photo Grove proof lane now emits a small, reviewer-friendly batch from quality triage groups instead of asking a human to inspect the whole ingest at once.

Latest packet:
- HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/review-batches/20260624-144019-photo-review-batch/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/review-batches/20260624-144019-photo-review-batch/photo-review-batch.json`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/review-batches/20260624-144019-photo-review-batch/START-HERE-photo-review-batch.md`

This is intentionally conservative: quality hints route attention, but keep/reject/favorite/review decisions remain explicit metadata-only sidecar actions.


## 2026-06-24 14:51 MDT - Source inspection added to review batch

The focused Photo Grove review batch now includes source paths and Finder reveal commands for sample photos. This matters because RAW thumbnail analysis can be misleading: the packet can route a reviewer to inspect the actual source file without copying, deleting, editing, or approving anything.

Latest upgraded packet:
- HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/review-batches/20260624-145113-photo-review-batch/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/review-batches/20260624-145113-photo-review-batch/photo-review-batch.json`


## 2026-06-24 15:37 MDT - Client proof packet runway

Photo Grove now creates a dedicated client-proof packet from the latest review metadata without copying deliverables or mutating originals.

Command:

```bash
./script/agentctl.sh photo-grove-client-proof latest
```

Latest packet:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/client-proof-packets/20260624-153746-photo-client-proof/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/client-proof-packets/20260624-153746-photo-client-proof/photo-client-proof-packet.json`
- CSV: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/client-proof-packets/20260624-153746-photo-client-proof/photo-client-proof-queue.csv`
- Status: `not-ready-needs-cull`
- Counts: 160 total, 160 pending, 0 selected, 160 quality-attention routed.

Safety truth: this is a readiness packet only. It does not copy files, create client delivery, upload, publish, approve, delete, or mutate originals. The correct next action is metadata-only culling/selection before any external delivery packet exists.
