# Quipsly OS board

Last updated: 2026-06-24

The Quipsly OS board is a read-only cross-lane dashboard for Studio, Nest,
Tower, Photo Grove, and 360 work. It exists to keep broad autonomous work
grounded in visible truth instead of scattered artifacts.

## Command

```bash
./script/agentctl.sh quipsly-os-board
```

Smoke command:

```bash
./script/agentctl.sh quipsly-os-smoke
```

Latest observed output:

```text
/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-103432-quipsly-os/index.html
```

## What it aggregates

- Studio podcast/video release runway from `/Volumes/My Passport/Episode_and_Shorts_Test`.
- Tower packet/receipt truth from review-board and human-review-ledger artifacts.
- Tower runway truth from the latest versioned publishing runway board.
- Nest writing/research source availability from the High Ground Odyssey book inbox.
- Nest writing/research workbench counts and draft-queue/action-card pointers.
- Latest Nest writing draft packet pointer and draft task ID.
- Latest Nest writing publication runway pointer and draft/platform/receipt counts.
- Photo Grove latest culling board from the Quipsly media workspace.
- Photo Grove review group counts and review-status metadata from the latest
  board.
- Photo Grove export-prep counts and handoff links from the latest culling
  session.
- 360 asset presence from external-drive Insta360 folders.
- Latest 360 proxy-prep manifest and managed proxy path when a proxy has been
  prepared.
- Latest 360 proxy-prep failure manifest and error summary when a source needs
  repair or companion routing.

## Rules

- The board reads existing proof artifacts; it is not a new source of truth.
- It does not upload, publish, approve, delete, mutate accounts, or mutate media.
- It keeps local readiness, human approval, and external receipt truth separate.
- If one lane stalls, use the board to move to the next safest lane instead of
  stopping the whole production machine.

## 2026-06-24 - 360 reframe packet surfaced on OS board

The operating-system board now includes the latest Studio360 reframe/export-prep packet in the `360 workflow` lane.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110055-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110055-quipsly-os/quipsly-os-board.json`

Latest 360 reframe packet shown by the board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-110050/360-reframe-packet.json`
- Counts: 91 groups, 182 recipes, 89 reframe-ready, 1 needs proxy, 1 needs media repair, 0 exports created.

## 2026-06-24 - 360 action cards on the OS board

The OS board now promotes Studio360 reframe/export-prep recipes into visible next-action cards instead of hiding them inside JSON details.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110919-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110919-quipsly-os/quipsly-os-board.json`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-110919-quipsly-os/START-HERE-Quipsly-OS.md`

360 action-card behavior:

- Attention cards appear first for source groups that need media repair or managed proxy creation.
- Ready cards follow for source groups that already have usable review sources.
- Each card includes group key, workflow status, reframe status, duration, review source kind/path, recipe ids, and an explicit safety note.
- Cards are review/prep intent only; they do not render, export, upload, delete, or mutate source media.

Validation:

- `python3 -m py_compile script/build_quipsly_os_board.py` passed.
- `bash -n script/agentctl.sh` passed.
- `./script/agentctl.sh quipsly-os-board` created the latest board.
- Board audit confirmed 8 action cards, including both attention and ready cards, and no false export/readiness claim.

## 2026-06-24 - Tower/social action cards on OS board

The OS board now includes Tower publishing/social action cards alongside the Studio360 action cards.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-111700-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-111700-quipsly-os/quipsly-os-board.json`

Tower action-card behavior:

- One card per episode is surfaced from the latest Tower runway.
- Cards expose review status, receipt slots, captured receipts, shorts readiness, and first receipt command template.
- Episode cards intentionally say what is safe next rather than implying publication.
- Captured receipt count remains 0, so the board must continue to report packet/readiness state only.

Validation:

- `python3 -m py_compile script/build_quipsly_os_board.py script/build_tower_publishing_runway.py` passed.
- `bash -n script/agentctl.sh` passed.
- `./script/agentctl.sh tower-runway` created the latest Tower runway.
- `./script/agentctl.sh quipsly-os-board` created the latest OS board.
- Audit confirmed 6 Tower cards, 8 360 cards, and no external receipt claim.

## 2026-06-24 - Photo Grove action cards on OS board

The OS board now includes Photo Grove action cards beside Tower and Studio360 cards.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-112451-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-112451-quipsly-os/quipsly-os-board.json`

Photo Grove card evidence:

- 8 Photo Grove cards are present.
- Priorities: 1 attention, 1 ready, 6 review.
- Cards cover routed review, pending cull, export-prep packet, and burst/sequence review actions.
- Photo counts remain honest: 60 total, 48 pending, 12 review, 0 selected for client proof.
- No original mutation and no client delivery/export copy are claimed.

Validation:

- `python3 -m py_compile script/build_quipsly_os_board.py` passed.
- `bash -n script/agentctl.sh` passed.
- `./script/agentctl.sh quipsly-os-board` created the latest board.
- Audit confirmed Photo Grove cards exist, Tower cards still exist, Studio360 cards still exist, and source safety remains visible.

## 2026-06-24 - Nest writing action cards on OS board

The OS board now includes Nest writing/research action cards alongside Tower, Photo Grove, and Studio360 cards.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-113157-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-113157-quipsly-os/quipsly-os-board.json`

Nest writing card evidence:

- 10 Nest writing cards are present.
- Priorities: 8 ready, 2 review.
- Cards cover the writing workbench, latest draft packet, writing publication runway, and source-backed draft queue tasks.
- The cards preserve the core boundary: source files are read-only, drafts are previews, external publishing needs explicit receipt truth.

Cross-lane card evidence in the same board:

- Tower publishing/social: 6 cards.
- Nest writing/research: 10 cards.
- Photo Grove: 8 cards.
- Studio360: 8 cards.

## 2026-06-24 - Studio podcast/video action cards

The OS board now includes Studio podcast/video action cards, completing first-pass action-card coverage across all five current lanes: Studio, Tower, Nest writing/research, Photo Grove, and 360 workflow.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-114219-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-114219-quipsly-os/quipsly-os-board.json`

Studio card behavior:

- One card per Episode 1-6 current-best package is derived from release status, validation, review-board, and human-review-ledger evidence.
- Cards expose warning/blocker/review state, pending human-review artifacts, ready short counts, current version, and the review board path.
- Warning episodes stay reviewable but get attention-priority cards until a human explicitly accepts or repairs the warning.
- Review decisions stay separate from Tower receipt truth; a local package is not published until a real platform URL/provider receipt exists.

Cross-lane card evidence in the same board:

- Studio podcast/video: 6 cards.
- Tower publishing/social: 6 cards.
- Nest writing/research: 10 cards.
- Photo Grove: 8 cards.
- 360 workflow: 8 cards.

Safety boundary:

Studio action cards are local review/package guidance only. They do not mutate original media, publish externally, upload, schedule, or create fake receipts.

## 2026-06-24 - Cross-lane priority queue

The OS board now includes a top-level Start Here priority queue derived from the lane action cards.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-114804-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-114804-quipsly-os/quipsly-os-board.json`

Behavior:

- The priority queue is derived from existing lane action cards; it is not a separate source of truth.
- Attention cards sort above review cards, and cards with holds/warnings/pending review sort earlier inside their priority band.
- The queue is rendered in both the HTML board and `START-HERE-Quipsly-OS.md`.
- Lane sections remain below the queue with their full detail and paths.

Evidence:

- Latest board has 12 priority queue items.
- Priority mix: 7 attention, 5 review.
- Lane card coverage remains: Studio 6, Tower 6, Nest writing 10, Photo Grove 8, 360 workflow 8.

Safety boundary:

The queue is a triage map only. It does not publish, approve, upload, schedule, delete, overwrite, or mutate source artifacts.

## 2026-06-24 - Quick status command

Operators and agents can now inspect the latest OS board without manually opening JSON:

```bash
./script/agentctl.sh quipsly-os-status
./script/agentctl.sh quipsly-os-status --json --limit 3
```

Behavior:

- Reads the latest OS board pointer.
- Prints HTML, Markdown, and JSON paths.
- Prints the start-here priority queue.
- Prints lane status and action-card counts.
- Does not generate new artifacts or mutate anything.

Latest command evidence:

- Top action: Episode 6 Studio review hold/refine/reject resolution.
- Next action: Episode 6 Tower review-needs-work resolution.
- Warning actions: Episode 1 and Episode 4 Studio human-review warnings.
- Lane card counts: Studio 6, Tower 6, Nest writing 10, Photo Grove 8, 360 workflow 8.

## 2026-06-24 - Release review blocker report

The Studio/Tower review loop now has a generated blocker/warning report for human and agent operators.

Command:

```bash
./script/agentctl.sh release-review-blockers
./script/agentctl.sh review-blockers --episode 6
```

Latest whole-release report:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120511-review-blockers/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120511-review-blockers/review-blockers.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120511-review-blockers/review-blockers.md`

Latest Episode 6 focused report:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120512-review-blockers/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120512-review-blockers/review-blockers.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-120512-review-blockers/review-blockers.md`

Current evidence:

- Whole release: 6 episodes, 1 blocking review artifact, 23 pending review artifacts, 2 warning episodes.
- Episode 6: 1 blocking review artifact and 3 pending review artifacts.
- Episode 6 blocker is the `shorts` artifact on `hold` with note: `Tower command smoke: hold shorts for human review; no external publishing.`
- The latest OS board links the blocker report from the Studio lane details.

Safety boundary:

The report is read-only. It does not approve, publish, upload, delete, overwrite, mutate source media, or mutate accounts. It only explains current local review state and safe command templates.

## 2026-06-24 - Review blocker report becomes local review station

The review blocker report now embeds local video/audio preview controls for review artifacts where practical.

Latest preview-enabled whole-release report:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121149-review-blockers/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121149-review-blockers/review-blockers.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121149-review-blockers/review-blockers.md`

Latest preview-enabled Episode 6 focused report:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121150-review-blockers/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121150-review-blockers/review-blockers.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/blocker-reports/20260624-121150-review-blockers/review-blockers.md`

Evidence:

- Whole-release HTML contains 46 local video previews and 6 local audio previews.
- Media previews use `preload="metadata"`.
- Direct file links remain available under each artifact.
- Episode 6 smoke-test shorts hold remains visible.
- Latest OS board regenerated after the report update: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-121224-quipsly-os/index.html`.

Safety boundary:

Preview controls read local media for review only. The report still does not approve, publish, upload, delete, overwrite, schedule, mutate sources, or mutate accounts.

## 2026-06-24 - Photo Grove quality hints promoted to OS board

Photo Grove quality hints now feed the cross-lane OS board.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-123625-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-123625-quipsly-os/quipsly-os-board.json`

Photo Grove OS evidence:

- Photo quality counts are present in the Photo Grove lane details.
- The lane now includes a `Review photo quality hints` card.
- The card reports 33 sharpness/exposure/suspect-preview review candidates.
- The card links to `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-123157-dcim/quality-hints.json`.
- Originals remain untouched and no automatic cull decision is made.

## 2026-06-24 - Photo Grove cached session promoted

The OS board now points to a Photo Grove session generated after progress/cache hardening.

Latest cached Photo Grove session:

- Board HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/index.html`
- Manifest: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/manifest.json`
- Progress events: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/progress-events.jsonl`
- Export prep: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/export-packets/photo-grove-export-prep.html`

Latest OS board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-125627-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-125627-quipsly-os/quipsly-os-board.json`

Evidence:

- Fully cached Photo Grove regeneration completed in `2.95s` after the cache-population run.
- Cached session reports 160 photo fact cache hits, 160 thumbnail cache hits, and 160 quality cache hits.
- OS board still reports Photo Grove as `proof-board-ready` with 8 action cards.

## 2026-06-24 - Episode 6 false blocker corrected to diagnostic hold

The OS board now distinguishes confirmed content/package blockers from diagnostic review holds left by automation. Episode 6 no longer occupies the top queue as `review-needs-work`; it appears as a review item: `diagnostic-review-hold`.

Latest board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-131658-quipsly-os/index.html`

Top queue after regeneration starts with Episode 1 and Episode 4 warning review, then Photo Grove culling, then 360 repair/proxy work. Episode 6 remains visible as a safe review item and still needs a normal human/agent review decision before publication readiness.


## 2026-06-24 - 360 blockers narrowed to one true repair item

The 360 lane now separates usable reframe groups, true 360 media repair, and parked damaged/root-level sources. Current proof:

- Workflow packet: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/20260624-132725-360-workflow/index.html`
- Reframe packet: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-132901/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-132906-quipsly-os/index.html`

Current reframe truth: 43 groups are ready for reframe review, 1 true Insta360 group needs media repair, 10 damaged non-360/root-level sources are parked, and originals remain untouched.


## 2026-06-24 - Nest writing draft handoff clarified

Latest Nest writing proof artifacts:

- Draft packet: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260624-134745-episode-page-episode-1-preface/index.html`
- Writing runway: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingRunway/20260624-134745-writing-runway/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-134745-quipsly-os/index.html`

Draft packets now include a human/agent Start Here review section and top-level task/title/source-count fields. This keeps source-backed drafting useful without confusing draft readiness, manuscript canon, external publication, or receipt truth.


## 2026-06-24 13:58 MDT - OS board refreshed after warning-evidence pass

- Latest Quipsly OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-135802-quipsly-os/index.html`.
- Studio podcast/video remains `ready-with-warnings`, but the warning lane is now more actionable: Episode 1 and Episode 4 duration mismatches have explicit artifact comparisons and next safe review commands.
- Start-here queue still prioritizes Episode 1 and Episode 4 human review warnings before publication trust, followed by Photo Grove culling, 360 media repair, and Tower review/receipt tasks.


## 2026-06-24 14:13 MDT - 360 repair tasks surfaced in OS board

- Updated `script/build_quipsly_os_board.py` so 360 blocked-media-repair cards look for matching repair packets in `/Volumes/My Passport/Quipsly Media Workspace/Studio360/media-repair-tasks`.
- Latest board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-141325-quipsly-os/index.html`.
- The 360 queue item for `20250905-110050` now points directly to `/Volumes/My Passport/Quipsly Media Workspace/Studio360/media-repair-tasks/20250905-110050-repair-needed.md`.
- No source media was mutated and no proxy/reframe retry was attempted on the damaged source.


## 2026-06-24 14:23 MDT - OS board refreshed after Tower/social evidence fix

- Latest Quipsly OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-142326-quipsly-os/index.html`.
- Tower/social boards now use audio sanity commands that write durable JSON evidence to the expected card paths.
- Episodes 1-3 shorts are materially easier to review because visual and objective-audio evidence is complete for all known exported/platform-packaged short candidates.


## 2026-06-24 14:26 MDT - OS board refreshed after duration repair-options pass

- Latest Quipsly OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-142626-quipsly-os/index.html`.
- Latest review blocker report now gives Episode 1 and Episode 4 non-destructive repair options instead of only duration-spread evidence.


## 2026-06-24 14:36 MDT - Studio warnings now link to duration review packet

- Latest Quipsly OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-143615-quipsly-os/index.html`.
- Studio podcast/video warning cards for Episode 1 and Episode 4 now include `durationWarningReviewHtml` pointing to `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-warning-packets/20260624-143202-duration-warning-review/index.html`.
- The Studio lane next action now starts with opening that packet, reviewing tail/mismatch snippets, and only then recording human review decisions.


## 2026-06-24 14:43 MDT - Photo Grove review batch promoted to runway

The Quipsly OS board now reads `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-review-batch.json` and surfaces a `photo-grove-first-review-batch` action card. This keeps photo culling aligned with the same production principle as Studio edits: originals stay intact, decisions are transparent metadata, and reviewers get one safe next action instead of a wall of raw files.

Latest regenerated OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-144307-quipsly-os/index.html`.


## 2026-06-24 14:46 MDT - Photo Grove queue order refined

Regenerated OS board after promoting the focused Photo Grove review batch above the generic pending-cull backlog. Latest board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-144601-quipsly-os/index.html`.

This keeps the first reviewer action concrete: open one focused batch, inspect thumbnails, then record metadata-only decisions.


## 2026-06-24 15:00 MDT - 360 board now follows latest repair evidence

The OS board now chooses the newest matching `Studio360/media-repair-tasks/<groupKey>*` packet for blocked 360 media-repair cards, instead of hardcoding the first `repair-needed` filename. Latest board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-150058-quipsly-os/index.html`.

The `20250905-110050` card now points to expanded evidence proving the second discovered candidate is byte-identical to the damaged source and still unreadable.


## 2026-06-24 15:15 MDT - Tower social command center linked from OS board

The OS board's Tower lane now includes the latest Tower social command center HTML/JSON/CSV pointers. Latest OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-151547-quipsly-os/index.html`.

The Tower next action now routes operators to clear review/warning rows first, then use platform packets only after explicit approval, then capture real receipts. This keeps Hootsuite-like queue management separate from actual publication truth.


## 2026-06-24 15:25 MDT - Nest writing session cockpit linked from OS board

The OS board's Nest writing/research lane now includes the latest writing session cockpit HTML/JSON/CSV pointers. Latest OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-152532-quipsly-os/index.html`.

The Nest next action now points to a concrete source-backed writing session cockpit instead of asking the user to interpret the full workbench first.


## 2026-06-24 15:37 MDT - Photo Grove client proof packet promoted

The OS board now reads `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-client-proof-packet.json` and surfaces `photo-grove-client-proof-packet` as a Photo Grove action card.

Latest board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-153746-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-153746-quipsly-os/quipsly-os-board.json`

Current priority truth: the client-proof packet is visible, but it reports `not-ready-needs-cull` because 0 photos are selected and 160 are still pending. This keeps client delivery separate from local readiness and prevents false publication/delivery claims.

## 2026-06-24 15:54 MDT - Studio duration warnings translated into decisions

Added a Studio duration decision sheet on top of the existing duration-warning review packet. The sheet does not replace artifact evidence; it translates it into clearer reviewer actions.

Command:

```bash
./script/agentctl.sh studio-duration-decision-sheet
```

Latest decision sheet:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-decision-sheets/20260624-215415-duration-decision-sheet/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-decision-sheets/20260624-215415-duration-decision-sheet/duration-decision-sheet.json`
- Markdown: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-decision-sheets/20260624-215415-duration-decision-sheet/START-HERE-duration-decision-sheet.md`

The OS board Studio warning cards now say `Open duration decision sheet` and link warning cards to this latest sheet. Current guidance:

- Episode 1 v003: review the extra 2:09 video tail before approving either long-form video or podcast audio.
- Episode 4 v001: hold or refine podcast audio unless a human confirms the extra 33:44 audio is intentional.

No media was trimmed, approved, uploaded, published, or overwritten.

## 2026-06-24 16:05 MDT - Studio360 repair decision ledger

Added a metadata-only 360 repair/parking decision ledger so damaged groups can be routed without deleting or mutating media.

Commands:

```bash
./script/agentctl.sh studio360-repair-status
./script/agentctl.sh studio360-repair-decision 20250905-110050 park '<actor>' '<note>'
./script/agentctl.sh studio360-reframe-packet 120
```

Validation used a `/tmp` smoke ledger to park `20250905-110050` and confirmed the reframe packet changed that group to `parked-by-decision` with `parkedByDecision=1`, while originals remained untouched. The real Studio360 ledger currently has 0 decisions, so the real packet still correctly reports one active `blocked-media-repair` group.

Latest real reframe packet:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/reframe-prep/20260624-160502/index.html`
- Counts: 54 groups, 43 reframe-ready, 1 blocked-media-repair, 10 parked damaged sources, 0 parked-by-decision, 108 recipes.

Safety truth: repair decisions are sidecar metadata only. They do not move, delete, repair-in-place, upload, publish, or mutate originals.

## 2026-06-24 16:14 MDT - Tower review anomaly sheet

Added a Tower review anomaly sheet so diagnostic/test review decisions are visible and deliberate instead of silently blocking publication prep.

Command:

```bash
./script/agentctl.sh tower-review-anomalies
```

Latest anomaly sheet:

- HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-anomalies/20260624-221422-tower-review-anomalies/index.html`
- JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-anomalies/20260624-221422-tower-review-anomalies/tower-review-anomalies.json`

Current anomaly: Episode 6 `shorts` has a `hold` decision by `codex` with note `Tower command smoke: hold shorts for human review; no external publishing.` The sheet offers local commands to reset it to pending, replace it with a real hold, or approve after real review. No decision was changed.

The OS board Tower action card now says `Open review anomaly sheet` for Episode 6.

## 2026-06-24 16:26 MDT - Quipsly return brief

Added a re-entry layer over the Quipsly OS board for Charlie/Mako/Homer or an agent returning cold to the system.

Command:

```bash
./script/agentctl.sh quipsly-return-brief
```

Latest brief:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-222616-quipsly-return-brief/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-222616-quipsly-return-brief/quipsly-return-brief.json`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-222616-quipsly-return-brief/START-HERE-Quipsly-return-brief.md`
- CSV: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-222616-quipsly-return-brief/quipsly-return-queue.csv`

Counts: 5 lanes, 12 top queue items, 10 direct open targets, 5 attention items, and 7 review items. This brief reads board evidence only; it does not publish, approve, upload, schedule, mutate, delete, or capture receipts.

## 2026-06-24 16:35 MDT - Quipsly safe action deck

Added a safe action deck over the latest OS board. The return brief orients the human; the action deck gives copyable commands with safety classification.

Command:

```bash
./script/agentctl.sh quipsly-action-deck
```

Latest action deck:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-223500-quipsly-action-deck/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-223500-quipsly-action-deck/quipsly-action-deck.json`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-223500-quipsly-action-deck/START-HERE-Quipsly-action-deck.md`
- CSV: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-223500-quipsly-action-deck/quipsly-action-deck.csv`

Counts: 12 action cards, 31 command rows, 28 safe-local/open commands, and 3 approval-required receipt templates. Receipt templates are explicitly not runnable without exact external publication approval and real platform/provider evidence.

The latest return brief now includes the action deck as the first open target.

## 2026-06-24 Nest daily writing packet bridge

Added a source-backed daily writing packet over the existing Nest writing session cockpit.

Artifacts generated:
- Daily packet HTML: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingPackets/20260624-224900-daily-writing-packet/index.html`
- Daily packet JSON: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingPackets/20260624-224900-daily-writing-packet/daily-writing-packet.json`
- Daily packet markdown: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingPackets/20260624-224900-daily-writing-packet/START-HERE-daily-writing-packet.md`
- OS board HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-165049-quipsly-os/index.html`
- Action deck HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-225054-quipsly-action-deck/index.html`
- Return brief HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-225054-quipsly-return-brief/index.html`

Validation:
- `python3 -m py_compile script/build_nest_writing_daily_packet.py script/build_quipsly_os_board.py script/build_quipsly_return_brief.py script/build_quipsly_action_deck.py`
- `bash -n script/agentctl.sh`
- `./script/agentctl.sh nest-writing-daily-packet 8`
- `./script/agentctl.sh quipsly-os-board`
- `./script/agentctl.sh quipsly-action-deck`
- `./script/agentctl.sh quipsly-return-brief`
- `./script/agentctl.sh quipsly-os-status --limit 8`

Proof:
- Daily packet counts: 8 selected tasks, 16 available sessions, 8 human-review-required, 0 source mutations, 0 external publishing, 0 receipt truth created.
- Nest lane now exposes `latestWritingDailyPacketHtml` and makes `nest-writing-daily-packet` the first Nest action card.
- Return brief includes `Nest daily writing packet` as an open target.
- Safe action deck includes the daily packet row with `open-local` and `safe-local` commands.

Safety truth: this is a work packet only. It does not edit source files, replace canonical manuscripts, approve copy, publish, upload, schedule, or create receipts.

## 2026-06-24 Photo Grove first-pass cull suggestions

Added a safe Aftershoot-like cull suggestion packet over the existing Photo Grove review batch. This packet arranges grouped review batches into a calmer inspection surface with thumbnail grids, quality-hint language, and metadata-only commands.

Artifacts generated:
- Cull suggestion HTML: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/cull-suggestions/20260624-225744-photo-cull-suggestions/index.html`
- Cull suggestion JSON: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/cull-suggestions/20260624-225744-photo-cull-suggestions/photo-cull-suggestions.json`
- OS board HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-165850-quipsly-os/index.html`
- Action deck HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-225850-quipsly-action-deck/index.html`

Validation:
- `python3 -m py_compile script/build_photo_grove_cull_suggestions.py script/build_quipsly_os_board.py script/build_quipsly_return_brief.py script/build_quipsly_action_deck.py`
- `bash -n script/agentctl.sh`
- `./script/agentctl.sh photo-grove-cull-suggestions 8`
- `./script/agentctl.sh quipsly-os-board`
- `./script/agentctl.sh quipsly-action-deck`
- `./script/agentctl.sh quipsly-return-brief`

Proof:
- Cull suggestion counts: 8 suggestion groups, 160 pending photos, 0 selected for client proof, 0 originals mutated, 0 metadata changed, 0 external publishing.
- Photo Grove lane now exposes `latestCullSuggestionHtml` and makes `photo-grove-cull-suggestions` a top Photo Grove action card.
- Safe action deck includes a metadata-only `photo-grove-group-decision` command for the first suggestion group.

Safety truth: suggestions are routing aids only. They do not decide keep/reject automatically, mutate originals, copy deliverables, upload, publish, or create client delivery.

## 2026-06-24 Studio duration repair queue

Added a repair/options queue over the existing Studio duration decision sheet. This converts duration warnings into review tickets with evidence commands and versioned repair options.

Artifacts generated:
- Duration repair queue HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-repair-queues/20260624-230641-duration-repair-queue/index.html`
- Duration repair queue JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-repair-queues/20260624-230641-duration-repair-queue/duration-repair-queue.json`
- OS board HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-171318-quipsly-os/index.html`
- Action deck HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-231323-quipsly-action-deck/index.html`
- Return brief HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-231324-quipsly-return-brief/index.html`

Validation:
- `python3 -m py_compile script/build_studio_duration_repair_queue.py script/build_quipsly_os_board.py script/build_quipsly_return_brief.py script/build_quipsly_action_deck.py`
- `bash -n script/agentctl.sh`
- `./script/agentctl.sh studio-duration-repair-queue`
- `./script/agentctl.sh quipsly-os-board`
- `./script/agentctl.sh quipsly-action-deck`
- `./script/agentctl.sh quipsly-return-brief`

Proof:
- Repair queue counts: 2 tickets, 1 major warning, 1 review warning, 0 source mutations, 0 versions overwritten, 0 external publishing, 0 receipts.
- Studio lane now exposes `latestDurationRepairQueueHtml`.
- `studio-00-duration-repair-queue` is first in the OS priority queue using explicit `queueSortRank: 0`.
- Safe action deck includes the repair queue and the first evidence clip open command.

Safety truth: repair queue is evidence and planning only. It does not trim, regenerate, overwrite, approve, publish, upload, schedule, delete, or capture receipts.

## 2026-06-24 Tower manual publishing calendar

Added a draft-only Tower manual publishing calendar over the existing social command center. This gives a Hootsuite-like planning surface while preserving the truth that nothing has been scheduled or published externally.

Artifacts generated:
- Manual calendar HTML: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-manual-calendar/20260624-232059-tower-manual-calendar/index.html`
- Manual calendar JSON: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-manual-calendar/20260624-232059-tower-manual-calendar/tower-manual-calendar.json`
- OS board HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-172104-quipsly-os/index.html`
- Action deck HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-232104-quipsly-action-deck/index.html`
- Return brief HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-232104-quipsly-return-brief/index.html`

Validation:
- `python3 -m py_compile script/build_tower_manual_publishing_calendar.py script/build_quipsly_os_board.py script/build_quipsly_return_brief.py script/build_quipsly_action_deck.py`
- `bash -n script/agentctl.sh`
- `./script/agentctl.sh tower-manual-calendar`
- `./script/agentctl.sh quipsly-os-board`
- `./script/agentctl.sh quipsly-action-deck`
- `./script/agentctl.sh quipsly-return-brief`

Proof:
- Manual calendar counts: 48 draft rows, 18 draft dates, 6 episodes, 8 platforms, 48 blocked-by-review, 0 ready-for-manual-post-after-approval, 0 captured receipts.
- Tower lane now exposes `latestTowerManualCalendarHtml` and includes `tower-manual-publishing-calendar` as a Tower action card.
- Return brief includes `Tower manual publishing calendar` as an open target.

Safety truth: this is a local draft calendar only. It does not schedule, publish, upload, mutate accounts, approve, or capture receipts.

## 2026-06-24 23:34 UTC - Studio360 repair preflight is first-class board truth

Added the blocked 360 media-repair lane to the Quipsly OS board stack so damaged Insta360 source work is visible, evidence-backed, and safely actionable instead of being hidden inside repair-task folders.

Artifacts:
- Repair preflight: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/repair-preflight/20260624-233437-360-repair-preflight/index.html`
- OS board: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-173442-quipsly-os/index.html`
- Action deck: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ActionDecks/20260624-233442-quipsly-action-deck/index.html`
- Return brief: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ReturnBriefs/20260624-233442-quipsly-return-brief/index.html`

Evidence:
- `./script/agentctl.sh studio360-repair-preflight 8` reported 1 blocked repair ticket, 2 candidate files, 1 needs-redownload-or-source-recopy case, 0 originals mutated, 0 exports created, and 0 external publishing.
- The latest OS board priority queue now includes `360-repair-preflight` before the older raw repair-card entry.
- The return brief includes a `Studio360 repair preflight` open target.
- The action deck includes one `360-repair-preflight` row with safe local open/status commands.

Safety truth: this is a repair/preflight packet only. It does not repair, overwrite, delete, upload, publish, park, or export any media.

## 2026-06-24 23:40 UTC - Studio duration repair queue embeds playable evidence

The Studio duration repair queue now renders local video/audio snippet players directly in the repair queue page, reducing review friction for Episode 1 and Episode 4 duration spreads.

Latest artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-repair-queues/20260624-234007-duration-repair-queue/index.html`

Evidence:
- Episode 1 `v003`: 5 review snippets, 2:09 spread, all paths present.
- Episode 4 `v001`: 4 review snippets, 33:44 spread, all paths present.
- OS board, action deck, and return brief regenerated after the queue update.

Safety truth: this improves review clarity only. It does not make repair decisions, create new export versions, or mutate source/release files.

## 2026-06-24 23:45 UTC - Photo Grove cull worksheet added

Photo Grove first-pass cull suggestions now include a reviewer worksheet for each suggested group. This gives humans/agents copyable metadata-only commands for route-to-review, keep-after-inspection, and reject-after-inspection without executing any decision automatically.

Latest artifact: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/20260624-125437-dcim/cull-suggestions/20260624-234511-photo-cull-suggestions/index.html`

Evidence:
- 8 suggestion groups.
- 3 worksheet rows per group.
- 160 photos still pending, 0 selected for proof.
- `originalsMutated=false`, `metadataChanged=false`, `clientDeliveryCreated=false`, `externalPublishing=false`.

Safety truth: worksheet commands are guidance only until a reviewer intentionally runs a metadata-only decision command.

## 2026-06-24 23:53 UTC - Tower review command sheet promoted to first queue item

The Tower lane now exposes a local review-command sheet and promotes it ahead of manual calendar work. This keeps the production ladder honest: local artifact review decisions first, then manual publishing preparation, then real external receipt capture only after explicit approval.

Latest artifact: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-command-sheets/20260624-235349-tower-review-command-sheet/index.html`

Evidence:
- 6 episodes.
- 24 local review rows.
- 23 pending rows.
- 8 warning rows.
- 48 receipt slots.
- 0 captured receipts.
- OS board priority queue now starts with `tower-review-command-sheet`.

Safety truth: this is a local review worksheet only. It does not approve, publish, upload, schedule, mutate accounts/media, or capture receipts.

## 2026-06-24 23:58 UTC - Nest daily writing tasks materialized as draft packets

The latest daily writing packet now has real source-backed draft output behind its selected tasks. Eight draft packets were generated and the writing publication runway now tracks 12 total draft packets.

Latest writing runway: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingRunway/20260624-175802-writing-runway/index.html`
Latest daily packet: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DailyWritingPackets/20260624-235802-daily-writing-packet/index.html`

Evidence:
- 12 draft packets.
- 12 pending human review.
- 60 platform draft items.
- 48 receipt slots.
- 0 unsafe packets.
- 0 captured receipts.

Safety truth: these are draft previews with source trails, not canonical manuscript replacements or external publications.

## 2026-06-25 - Validation report becomes part of the operating-system map

The Quipsly OS board now carries a latest validation pointer, and the return brief surfaces that report as an open target. This keeps the board honest before long autonomous runs: agents can quickly see whether linked artifacts exist, required lanes are present, priority actions are populated, and safety boundaries still say what they should say.

Current validation artifact:

- `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/ValidationReports/20260625-001002-quipsly-os-validation/index.html`

Current validation result:

- `passed`, `25` checks, `0` failures, `0` warnings, `106` declared paths inspected.

This does not approve or publish anything. It is a truth map for local readiness and artifact consistency.

## 2026-06-25 - Studio duration repair work orders added to the OS map

Studio duration warnings now have a work-order layer in addition to evidence queues. The work orders are intentionally non-mutating: they show candidate v-next commands and required human confirmation before any repaired version is created.

Current work-order artifact:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-repair-workorders/20260625-001944-duration-repair-workorders/index.html`

Current scope:

- Episode 1 `v003` duration spread work order.
- Episode 4 `v001` major duration spread work order.
- `7` candidate commands, `0` executed commands.

This routes around warnings safely while preserving the rule that local readiness, human approval, and publication receipts are separate truths.

## 2026-06-25 - Nest writing runway grows to 16 draft packets

The Nest writing/research lane now has a broader source-backed draft runway without changing canonical source files.

Current writing runway:

- `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingRunway/20260624-182408-writing-runway/index.html`

Current counts:

- `16` draft packets.
- `80` platform draft items.
- `64` receipt slots.
- `0` unsafe packets.

This is still review-prep, not publication. It exists so Charlie can come back to a clearer writing queue instead of a pile of ambiguous source files.

## 2026-06-25 - Photo Grove command sheet and fast-loop return brief fix

Photo Grove now has a compact cull command sheet generated from the latest first-pass suggestions.

Current command sheet:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/CommandSheets/20260625-003127-photo-grove-command-sheet/index.html`

Current counts:

- `8` groups.
- `24` metadata-only commands.
- `8` safe first actions.
- `0` original mutations.
- `0` client deliveries.
- `0` external publications.

The return brief generator now creates unique session directories when multiple briefs are generated in the same second, preventing fast automation from colliding with itself.

## 2026-06-25 - Tower planning refreshed with no false publication truth

Tower now has fresh manual-calendar and social-command-center artifacts for the Episode 1-6 runway.

Current Tower planning artifacts:

- Manual calendar: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-manual-calendar/20260625-003531-tower-manual-calendar/index.html`
- Social command center: `/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/20260624-183535-tower-social-command-center/index.html`
- Review anomalies: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-anomalies/20260625-003535-tower-review-anomalies/index.html`

Current Tower truth:

- `48` draft-only schedule rows.
- `0` external schedules created.
- `0` captured receipts.
- `1` review anomaly: Episode 6 shorts held by Codex.

## 2026-06-25 - Fast-loop artifact names hardened

Several Quipsly OS artifact generators now use microsecond timestamps so autonomous runs can generate multiple boards/briefs/decks in quick succession without folder collisions.

Why this matters:

- Agents move faster than the old second-level timestamp assumption.
- Collision failures look scary but are not product logic failures.
- Unique local artifact paths make return brief, action deck, validation, and board evidence more reliable during long unattended work.
