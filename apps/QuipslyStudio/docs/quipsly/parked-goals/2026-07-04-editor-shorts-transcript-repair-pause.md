# Parked goal: Quipsly Studio podcast/shorts editor sprint

Paused: 2026-07-04
Reason: Charlie is pivoting temporarily to coaching, capture, billing, scheduling, and iOS App Store readiness.

## Current active surface

- App/product surface: `apps/QuipslyStudio`
- Proof lane in active work: Episode 1 shorts and transcript sidecar
- Current goal remains unfinished. Do not mark it complete.

## Recent completed work

- `script/selected_short_story_repair_suggestions.py`
  - Added read-only sibling transcript lookup for selected short story repair.
  - Added transcript-grounded hook, middle turn, payoff, caption, and overlay scaffolds.
- `script/shorts_story_repair_board.py`
  - Added file-backed queue-level board for all Episode 1 shorts.
  - Flags weak/mismatched transcript alignment instead of over-trusting transcript text.
- `script/shorts_transcript_alignment_audit.py`
  - Added read-only audit that searches for best matching transcript windows per short.
  - Finding: Episode 1 shorts do not have a safe global transcript offset. Diagnosis: `mixed-or-stale-short-recipes`.
- `script/agentctl.sh`
  - Added `shorts-story-repair-board` route.
  - Added `shorts-transcript-alignment-audit` route.
  - Added `shorts-recipe-repair-workorder` route after resuming the editor goal.
  - Added `shorts-recipe-repair-next` route to pick one proof-watchable repair candidate at a time.

## New artifact files

- `docs/quipsly/current-state/episode-1-shorts-story-repair-board.md`
- `docs/quipsly/current-state/episode-1-shorts-transcript-alignment-audit.md`
- `docs/quipsly/current-state/episode-1-shorts-recipe-repair-workorder.md`
- `docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md`

## In-progress / not finished

- `script/shorts_recipe_repair_workorder.py` is now routed through `agentctl.sh` as `shorts-recipe-repair-workorder`.
- `script/shorts_recipe_repair_next.py` is now routed through `agentctl.sh` as `shorts-recipe-repair-next`.
- `shorts-recipe-repair-next` can now include safe seek commands and optionally jump the running Studio app:
  - `script/agentctl.sh shorts-recipe-repair-next --rank 3 --seek current`
  - `script/agentctl.sh shorts-recipe-repair-next --rank 3 --seek candidate`
  - `--seek` now tries to confirm the shared playhead through `/state` by default.
  - Treat `/state` confirmation as playhead proof only; visible/cadence judgment still requires monitor-wall review.
  - Use `--no-confirm-state` only when the app is unavailable and a packet-only command is needed.
- `Sources/SharedUI/ShortsRecipeRepairProofPanel.swift` now adds a read-only Studio shorts workbench card for the same repair packet.
  - It reads `docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md`.
  - It compares current vs candidate ranges, shows the story preview and allowed outcomes, copies safe commands, opens the packet, and seeks the shared Studio playhead.
  - It does not mutate short recipes, session metadata, source media, exports, uploads, approvals, or receipts.
  - Needs next compile/run proof through the real Studio app before it can be treated as validated UI.
- `script/shorts_recipe_repair_decision_template.py` now generates a proof-watch decision ledger from the same packet.
  - JSON: `docs/quipsly/current-state/episode-1-shorts-recipe-repair-decision-template.json`
  - Markdown: `docs/quipsly/current-state/episode-1-shorts-recipe-repair-decision-template.md`
  - It records allowed outcomes, current/candidate evidence, story preview, risks, reviewer-note fields, and an explicit `applyMutationAllowed: false` default.
  - It does not import or apply decisions. Recipe repair mutation remains a separate deliberate step after proof-watching.
- The generated workorder currently reports Episode 1 shorts as:
  - `keep-current-range`: 1
  - `proof-watch-candidate`: 6
  - `strong-repair-candidate`: 6
- The first next packet selects `Learning Why, Not Just What` as a strong repair candidate.
  - Current range: `1232.564375` -> `1273.397375`
  - Candidate range: `2596.88` -> `2637.713`
- Next intended step: proof-watch strong candidates against the whole synced sources before applying any short recipe metadata repair.

## Resume command suggestions

From `apps/QuipslyStudio`:

```bash
python3 -m py_compile script/shorts_recipe_repair_workorder.py
./script/agentctl.sh shorts-recipe-repair-workorder --markdown --save docs/quipsly/current-state/episode-1-shorts-recipe-repair-workorder.md
./script/agentctl.sh shorts-recipe-repair-next --markdown --save docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md
./script/agentctl.sh shorts-recipe-repair-next --rank 3 --seek current
./script/agentctl.sh shorts-recipe-repair-next --rank 3 --seek candidate
./script/agentctl.sh shorts-recipe-repair-next --rank 3 --seek candidate --no-confirm-state
python3 script/shorts_recipe_repair_decision_template.py --save
./script/agentctl.sh shorts-transcript-alignment-audit --markdown --limit 3
./script/agentctl.sh shorts-story-repair-board --markdown --limit 3
```

## Resume UI proof checklist

- Open Quipsly Studio.
- Switch the left workbench to `Shorts`.
- Confirm the `Proof-watch repair` card appears after transcript confidence and before the refinement queue.
- Click `Current` and `Candidate`; both should move the single shared playhead and keep Source Wall, Program Output, and Decision Timeline bound to the same sequence time.
- Record the proof-watch result in `docs/quipsly/current-state/episode-1-shorts-recipe-repair-decision-template.md` or regenerate a fresh template with `python3 script/shorts_recipe_repair_decision_template.py --save`.
- Only after proof-watching should any short recipe repair be applied.

## Product truth preserved

- Whole synced sources remain the desired model.
- Short recipes are metadata over the episode spine, not chopped media.
- Episode 1 short transcript alignment is currently not trustworthy enough for automatic caption/hook generation.
- Do not apply a global transcript offset to Episode 1 shorts.
- Repair short recipes individually or regenerate them from whole-source/transcript evidence.

## Replacement goal

The temporary replacement goal is documented at:

`/Users/wall-e/Dev/high-ground-studio/docs/quipsly/2026-07-04-coaching-capture-billing-goal.md`

## Restart trigger

Resume this parked goal when we return to Episode 1-6 editor/shorts quality, especially if Charlie wants transcript-backed shorts, Episode 4 clip weaving, or production-ready social exports.
