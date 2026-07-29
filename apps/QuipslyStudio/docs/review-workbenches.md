# Quipsly Studio review workbenches

These tools help humans and agents review podcast cuts and shorts without touching source media, exports, or publication state.

They are evidence lenses, not autopilot.

## Core rule

Whole source media stays intact. SHOW/SKIP/source choices are metadata. Review packets explain the current state, but they do not prove approval, export success, or publication.

## Start here

Run the review loop first:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-loop
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh studio-review-loop
```

The review loop creates a fresh read-only packet, points at `AGENT_NEXT_ACTION.md`, and prints suggested commands for the current focus lane.

If you only need the current state without creating a packet, run the conductor:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-conductor
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh studio-review-conductor
```

The conductor answers:

- What should I inspect next?
- Is the biggest risk cut rhythm, a selected decision, a selected short, or a normal review pass?
- What is the first safe action?

The conductor reads:

- `/editor_review_cockpit`
- `/selected_decision_intent_evidence`
- `/selected_short_quality`
- `/state`

It does not mutate anything.

## Selected decision workbench

Use this when the conductor points at a SHOW/SKIP decision or when a timeline decision feels odd:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-review-workbench
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh decision-review-workbench
```

Fastest agent/human start point:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-production-brief --markdown
```

This bundles the selected-decision workbench, edit-flow contract, and cover brief into one "what should I do with this cut?" packet. Use it first when reviewing a selected decision; drill into the full workbench, flow contract, or cover brief only when the production brief points there.

Smallest "what am I listening for?" card:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-human-cut-guidance --markdown
```

Use this when the production brief is too broad and the immediate question is whether the selected cut should be kept, softened, held, or left alone because the air/reaction carries meaning.

To preserve the current guidance as a review artifact without changing the edit:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-human-cut-guidance-save
```

By default this writes a timestamped card under `~/Movies/QuipslyExports/DecisionHumanCutGuidance`, which should resolve to the external-drive export folder on Charlie's machine.

To preserve the state contract, human-cut guidance, and production brief together as one handoff packet:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-review-packet-save
```

By default this writes a timestamped packet under `~/Movies/QuipslyExports/DecisionReviewPackets`.

Before recording notes, changing status, or asking Codex to revise the selected decision, confirm that the app state, intent evidence, and cut-intelligence endpoints agree about the same timeline boundary:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-state-contract-check --markdown
```

App-native JSON is also available while Studio is running:

```bash
curl http://127.0.0.1:8765/selected_decision_state_contract
```

This check is read-only. It does not mutate the session, export files, publish anything, or touch source media.

It shows:

- selected lane and decision type
- decision timing
- intent status
- edit-flow contract: selected decision, boundary, intent, cadence, split-edit, jump-cut, reaction-cover, and review-path readiness
- risk and confidence
- cut style and cover strategy
- why the cut exists
- tradeoff
- human rhythm note
- recent human/agent notes
- legacy revision trail
- structured revision ledger
- cadence guard
- J-cut, L-cut, reaction, cover, or preserve-air guidance
- preserve-air protocol: triggers, listen-for cues, and do-not rules
- safe follow-up commands for the edit-flow contract and selected-decision cover brief
- safe commands for adding notes or changing review status

Use it before changing a decision status. Listen at normal speed before marking a cut as Keep.

For a terse checklist instead of the full workbench:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-flow-contract --markdown
```

The edit-flow contract is advisory, not a grade. It exists to make the next safe action obvious: select the decision, verify the boundary, preserve cadence where it matters, consider J/L timing, cover jump cuts when needed, and record what a human or agent heard.

If the contract points at jump-cut or cover work, ask for a reversible cover brief:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-decision-cover-brief --markdown
```

The cover brief ranks visible whole-source lanes by boundary overlap, proxy/readiness hints, and likely role: reaction/camera cover, source clip/B-roll cover, 360 reframe cover, audio-only context, or parked context. It does not insert anything. Use it to choose what to cue or review next, then record the human/agent note before changing edit metadata.

### Record a selected-decision review

Use this to record a note/status on the currently selected decision. It is dry-run by default:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-record-review needs-listen "Listen at normal speed; possible clipped breath before Homer responds."
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh decision-record-review needs-listen "Listen at normal speed; possible clipped breath before Homer responds."
```

To actually call the running Studio metadata endpoints:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-record-review refine "Jump feels harsh; try reaction cover or preserve air." --apply
```

Allowed statuses:

- `needs-listen`
- `refine`
- `keep`
- `hold`
- `needs-human-ear`
- `needs-source-check`
- `needs-edit-change`

This records selected-decision review metadata only. It does not trim, split, export, publish, move clips, or mutate source media.

When applied, the recorder also captures selected-decision edit-flow contract and cover-brief snapshots before and after the note/status call. Use that receipt as training/debug evidence for whether cadence, jump risk, split-edit timing, cover strategy, candidate cover options, and review path improved or merely changed.

Decision review notes should be treated as training evidence only when they say what was heard or seen. A useful note explains the human-feeling tradeoff: reaction timing, jump-cut harshness, useful silence, clipped breath, warmth, awkwardness, pacing, or source-choice context.

The preserve-air protocol is the anti-overcleaning check. Before tightening a pause, J-cutting a reply, adding a reaction cover, or calling a gap dead air, reviewers should listen for breath, laughter, hesitation, awkward warmth, emotional reset, and whether the silence helps the next thought land.

## Shorts review workbench

Fastest agent/human start point for a selected short:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-short-production-brief --markdown
```

This bundles selected-short story contract, cut-flow evidence, proof readiness, platform target readiness, and the next safe metadata action. Use it first when deciding whether a short needs hook/story repair, cut-flow proof-listen, proof export, platform packet work, Keep, Refine, or Reject.

Smallest "would a real viewer keep watching?" card:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-short-human-review-guidance --markdown
```

Use this when the production brief is too broad and the immediate question is whether the selected short has enough hook, pacing, caption/framing, platform fit, and human cadence to Keep, Refine, or Reject.

For machine-readable app truth, the running AgentServer also exposes `GET /selected_short_production_brief`. The CLI JSON path prefers that endpoint when available and falls back to the Python workbench builder for older app state.

To preserve the current selected-short guidance as a review artifact:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-short-production-brief-save
```

By default this writes a timestamped Markdown brief under `/Users/wall-e/Movies/QuipslyExports/ShortProductionBriefs`, which should resolve to the external export drive. Use `--json` when another agent needs machine-readable evidence.

If the app, CLI, or saved brief appear to disagree about the selected short, run the read-only contract check:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh selected-short-state-contract-check --markdown
```

This compares `/state`, `/selected_short_quality`, and `/selected_short_production_brief` so agents can detect stale state or mismatched selected-short focus before changing review metadata.

Use this when refining a selected short:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-review-workbench
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh shorts-review-workbench
```

It shows:

- selected short title and hook
- duration and review status
- quality score
- short-form story contract: opening promise, middle turn, payoff, caption/face safety, human edit flow
- hook, pacing, caption, framing, platform, and proof status
- Cut Intelligence overlap
- strengths, risks, and next actions
- whether the short has a clear hook -> turn -> payoff

Use it before export or platform packet work. A technically complete short is not automatically a good short.

The short-form story contract is the anti-generic-clip check. A postable short should have a reason to stop scrolling, a turn or development in the middle, and an ending that rewards the hook. If the contract is weak, refine the recipe before treating platform metadata as readiness.

### Record or run a selected-short review action

Use this to preview a selected-short action. It is dry-run by default:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-record-review needs-refine --note "Bridge between segments feels abrupt; verify hook -> turn -> payoff."
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh shorts-record-review needs-refine --note "Bridge between segments feels abrupt; verify hook -> turn -> payoff."
```

To actually call the running Studio selected-short action endpoint:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-record-review sharpen-hook --apply
```

Allowed actions:

- `needs-refine`
- `fill-hook`
- `sharpen-hook`
- `draft-copy`
- `draft-platform-pack`
- `draft-all-platform-packs`
- `copy-platform-pack-json`
- `save-platform-pack-json`
- `copy-polish-prompt`

This targets selected-short review/prep actions only. It does not export, publish, upload, overwrite files, move clips, or mutate source media.

When applied, the recorder captures selected-short story-contract and selected-short production-brief snapshots before and after the action. Use that receipt as training/debug evidence for whether hook/turn/payoff clarity, cut-flow risk, proof readiness, platform packet readiness, and the next safe action improved or merely changed.

## Review packet

Create one shareable evidence folder:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh studio-review-packet
```

Default output:

```text
/Users/wall-e/Movies/QuipslyExports/StudioReviewPackets
```

That local path is expected to point at the external drive.

Each packet contains:

- `README.md`
- `AGENT_NEXT_ACTION.md`
- `studio-review-packet.json`
- `studio-review-conductor.md`
- `studio-review-conductor.json`
- `decision-review-workbench.md`
- `decision-review-workbench.json`
- `shorts-review-workbench.md`
- `shorts-review-workbench.json`

Use packets when handing review context between Codex, Charlie, Mako, Homer, or another agent.

Do not edit old packets to pretend they are fresh. Create a new packet.

## Review packet index

List recent packets:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet-index
```

Agent front-door equivalent:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh studio-review-packet-index
```

It shows:

- packet folder
- focus lane
- first action
- selected decision summary
- selected short summary
- endpoint warning count
- first file to open

Use the index when you are resuming work and need to know what review evidence already exists.

## Saved single-lens packets

The individual workbenches can also save their own packet folders:

```bash
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-review-workbench --save
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-review-workbench --save
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-conductor --save
```

Use these when you only need one focused artifact instead of a combined packet.

## Safe review loop

1. Run `studio-review-conductor`.
2. If focus is cut rhythm, use the cut rhythm queue or packet tools.
3. If focus is selected decision, run `decision-review-workbench`.
4. If focus is selected short, run `shorts-review-workbench`.
5. Listen or watch in the real app when the tool says the issue requires ears or eyes.
6. Record notes/status as metadata only.
7. Create a fresh `studio-review-packet` when handing off or resuming later.

## What these tools must not do

- Do not mutate original media.
- Do not overwrite previous exports.
- Do not publish externally.
- Do not claim receipt-backed publication.
- Do not auto-approve cuts.
- Do not treat scores as truth.
- Do not hide uncertainty.

## Why this exists

Quipsly Studio is not trying to be a traditional chopped-clip NLE. The core invention is:

- whole synced sources stay visible and intact
- decisions live as transparent metadata
- humans and agents can inspect why a cut or short exists
- edit quality improves through review notes, revision history, and human-feeling rhythm checks

The workbenches are the agent-readable side of that same product idea.
