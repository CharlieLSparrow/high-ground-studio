# Human-flow cut review runbook

Quipsly Studio's human-flow review loop exists to make podcast edits feel human
without turning source media into chopped rubble. Whole synced sources stay
intact. SHOW, SKIP, cover, cadence, split-edit, and review decisions live as
transparent metadata or sidecar evidence until a human explicitly approves a
mutation step.

This runbook is for Codex, Mako, Charlie, Homer, and any future agent working on
Episode 4 or the Episode 1-3 proof lanes.

## What this workflow is for

- Find cut boundaries that deserve a human-speed ear pass.
- Explain why a cut, cover, pause, J-cut, L-cut, or hold is being suggested.
- Capture review decisions as sidecar receipts.
- Convert approved review decisions into dry-run metadata patch packets.
- Keep all source media untouched.
- Keep review evidence separate from actual timeline mutation.

## What this workflow is not

- It is not an export.
- It is not publication.
- It is not proof that a timeline changed.
- It is not permission to overwrite old exports.
- It is not permission to mutate original media.
- It is not an automatic apply path.

If a command says `review`, `decision`, `promotion`, `approval`, or `packet`, it
is evidence unless the command explicitly says it applies timeline metadata.

## Fastest safe path

Run this when Quipsly Studio is open and the local agent endpoint is available:

```bash
script/agentctl.sh human-flow-review-workbench
```

That command creates:

- a current human-flow review board,
- a timestamped review session,
- a reviewer-friendly start-here dashboard.

Then inspect the dashboard:

```bash
open ~/Movies/QuipslyExports/human-flow-review/human-flow-cut-review-board-start-here.html
```

If the app endpoint is not running, use the disposable demo to validate the
sidecar workflow without touching real edits:

```bash
script/agentctl.sh human-flow-demo-fixture
```

If you need a repeatable pass/fail check of the sidecar workflow itself, run:

```bash
script/agentctl.sh human-flow-smoke
```

The smoke command uses fake review cards. It proves the review machinery can
create sessions, record decisions, create a promotion plan, approve one action,
build an approved dry-run patch packet, and keep approved patches marked
`not_applied`. It does not prove anything about a real episode edit.

## Preservation-first review

Use this path when a proposed cut touches breath, laughter, hesitation,
awkward warmth, emotional reset, thinking time, or any silence that may be doing
human work.

```bash
script/agentctl.sh cut-preservation-brief --markdown
```

To save a timestamped reviewer handoff without changing the timeline:

```bash
script/agentctl.sh cut-preservation-brief-save
```

The preservation brief is a read-only lens over the same cut intelligence model.
It exists because Quipsly should not reward robotic silence deletion. A preserved
pause can be the joke, the tenderness, the leadership moment, or the place where
the listener catches up.

Treat this command as the first stop when the safer question is not "can we cut
this?" but "what meaning might we lose if we cut this?"


## Command map

### Check sidecar state from the running app

```bash
script/agentctl.sh human-flow-review-state
```

This asks the running Quipsly Studio agent endpoint for the current human-flow
sidecar state. It reads artifact existence, receipt counts, decision counts,
approval counts, approved dry-run patch counts, and the next safe command. It
does not generate, approve, apply, export, publish, or mutate timeline metadata.

### 1. Check where the pipeline is

```bash
script/agentctl.sh human-flow-pipeline-check
```

Use this after a break. It reports which rung exists and the next safe command.

### 2. Build the review workbench

```bash
script/agentctl.sh human-flow-review-workbench [mode] [limit] [output-dir] [basename]
```

Default output root:

```text
~/Movies/QuipslyExports/human-flow-review
```

Because `~/Movies/QuipslyExports` points at the external drive, large review
artifacts stay off the local SSD.

### 3. Create a review session from a board

```bash
script/agentctl.sh human-flow-review-session [board-json] [output-dir] [name]
```

This creates blank review receipts. It does not mean review happened.

### 4. Record a review decision

```bash
script/agentctl.sh human-flow-review-decision latest <boundary-id> <outcome> <reviewer> [notes] [audio] [visual] [cadence] [action] [follow-up]
```

Use outcomes like:

- `Keep the cadence`
- `Tighten gently`
- `Cover the jump`
- `Use a split edit`
- `Use context visual`
- `Needs human listen`

Decision receipts should describe what the reviewer heard or saw, not just
whether a cut felt good.

### 5. Generate a promotion plan

```bash
script/agentctl.sh human-flow-review-promotion-plan [latest|session-folder]
```

This maps review decisions to proposed metadata patches. Every patch still
requires explicit approval.

### 6. Approve, reject, or hold a proposed action

```bash
script/agentctl.sh human-flow-review-approval latest <action-ref> approve|reject|hold|needs-more-evidence <reviewer> [notes]
```

Approval means the patch is allowed to enter a future apply packet. It does not
apply the patch.

### 7. Build the approved patch packet

```bash
script/agentctl.sh human-flow-approved-patch-packet [latest|session-folder]
```

This gathers only approved proposed metadata patches into a dry-run packet.
Every patch has:

- `applyState: not_applied`
- `requiresExplicitApplyCommand: true`

### 8. Generate the start-here dashboard

```bash
script/agentctl.sh human-flow-start-here
```

This writes JSON, Markdown, and HTML that explain the current state, next safe
command, guardrails, and artifact paths.

### 9. Smoke-test the sidecar workflow

```bash
script/agentctl.sh human-flow-smoke
```

Use this after changing the human-flow sidecar scripts. It is disposable and
fake-data-only, but it checks that the chain still hangs together:

- demo board,
- review session,
- review decisions,
- promotion plan,
- approval ledger,
- approved patch packet,
- start-here dashboard.

Passing smoke means the sidecar machinery works. It does not mean Episode 4 is
synced, edited, reviewed, exported, or published.

## Review rules for human-feeling cuts

Judge by ear first.

Use the waveform to find candidates, but listen at normal speed before trusting
a cut. Podcast rhythm is not only silence removal.

Preserve meaningful air.

Do not remove breath, hesitation, awkward warmth, comic timing, or thinking
pauses just because the waveform looks empty.

Use covers because they add meaning.

A reaction cover should add attention, warmth, humor, tension, or context. It
should not be wallpaper over every jump cut.

Use J-cuts and L-cuts for conversational handoffs.

Split edits are good when they make the exchange feel less mechanical. They are
bad when they make someone sound like they are interrupting a thought that
needed room to land.

Hold uncertain cuts.

If a boundary is ambiguous, mark it `Needs human listen` instead of forcing a
clean-looking but wrong edit.

## Episode 4 focus

Episode 4 remains the main proof lane. If its sync/media state is uncertain:

- mark uncertainty visibly,
- use review sidecars instead of forcing bad metadata,
- keep improving the tool on Episodes 1-3,
- return to Episode 4 when source evidence is clearer.

## Source truth boundaries

Source media truth:

- original camera/audio files,
- proxies derived from those files,
- sync metadata describing how sources align.

Edit truth:

- SHOW/SKIP decisions,
- source selection decisions,
- cover/context decisions,
- J-cut/L-cut metadata,
- cadence and review intent metadata.

Review sidecar truth:

- board cards,
- review receipts,
- review decisions,
- promotion plans,
- approvals,
- approved patch packets.

Publication truth:

- export manifests,
- platform receipts,
- URLs,
- upload/schedule confirmation.

Never collapse these into one vague `done` state.

## Future apply path

The current review pipeline intentionally stops before mutation.

Before building an apply command, require:

- an approved patch packet,
- a preview of every metadata patch,
- a backup or versioned branch of the edit metadata,
- an explicit apply command name,
- a clear undo or revert packet.

No future apply command should touch source media.

## Recovery

If the app is running and you want the editor's own read-only view of current
human-flow sidecar state:

```bash
script/agentctl.sh human-flow-review-state
```

If confused, run:

```bash
script/agentctl.sh human-flow-pipeline-check --markdown
```

If the pipeline has no real artifacts but you need to test the machinery:

```bash
script/agentctl.sh human-flow-demo-fixture
```

If scripts changed and you need a pass/fail mechanical check:

```bash
script/agentctl.sh human-flow-smoke
```

If the dashboard exists, open it first. It is the front door.

## Structured decision provenance

Every new Cut Intelligence recipe should carry both legacy human-readable
`revisionHistory` and structured `revisionLedger` entries. The string history is
for quick reading. The ledger is for agent tools, reviewer handoff, future
training data, and rollback/branch analysis.

A good revision ledger entry answers:

- who or what proposed the change,
- what action was proposed or taken,
- what evidence supported it,
- what status changed,
- what confidence changed.

This is how Quipsly stays more than a black box. An edit decision is not just
"the AI cut this." It is a visible claim with evidence, tradeoffs, review notes,
and a reversible metadata trail.

The selected-decision Cut Intelligence panel should show this trail as a concise
"Review trail" row. Agent payloads should expose the same data under
`reviewProvenance` and `revisionLedger` so Codex can inspect the decision without
scraping UI text.

When agents or reviewers use `/selected_decision_intent_note`,
`/selected_decision_intent_status`, live-switch decisions, source-wall buttons,
program-ambiguity resolution, or Cut Intelligence recipe application, the app
should append a structured `revisionLedger` event as well as the legacy readable
history string. This keeps first cuts, human corrections, and agent revisions
usable as future editing evidence.

For day-to-day selected-decision review, prefer the memorable CLI aliases over
raw URLs:

```bash
script/agentctl.sh decision-listen Codex "needs an ear pass"
script/agentctl.sh decision-refine Codex "needs timing, cover, cadence, or source-choice refinement"
script/agentctl.sh decision-keep Codex "reviewed for now; not publication approval"
script/agentctl.sh decision-hold Codex "hold for human context or uncertainty"
```

These commands queue metadata-only review-state changes on the selected decision.
They should append structured `revisionLedger` entries and never mutate source
media, exports, or external publication state.

## Selected decision briefs

When a specific SHOW/SKIP decision is selected, generate a compact review packet
before changing it:

```bash
script/agentctl.sh decision-review-brief --markdown
script/agentctl.sh decision-review-brief-save
```

The brief includes the selected lane, tag timing, cut style, cover strategy,
tradeoff, review question, preservation warning, checklist, review evidence,
revision ledger tail, and safe next commands. It is read-only and should be used
as the handoff between quick timeline work and thoughtful review.

Use this whenever a cut is emotionally or rhythmically ambiguous, or before
turning a selected decision into training-quality evidence.

Agent safe-command payloads should advertise `decision-review-brief` beside
`decision-listen`, `decision-refine`, `decision-keep`, and `decision-hold` so a
reviewer packet is always one command away from a selected decision.

## Selected short briefs

For shorts, use the same evidence-first review habit:

```bash
script/agentctl.sh selected-short-review-brief --markdown
script/agentctl.sh selected-short-review-brief-save
```

The selected-short brief gathers hook, pacing, caption/overlay, 9:16 framing,
cut-risk, platform variant, text-burn safety, export-proof, warnings, and safe
next commands into one read-only packet. Use it before marking a short Keep,
Refine, Reject, or ready for a posting packet.

## Selected short review-mode workflow

Use this when a short recipe is selected and the reviewer needs the next sane action without reading the full quality payload.

### Fast read

```bash
script/agentctl.sh selected-short-review-mode
```

Alias:

```bash
script/agentctl.sh shorts-review-mode
```

This is read-only. It inspects the selected short quality passport and reports:

- recommended review mode, such as join-rhythm, hook, pacing, caption-framing, cut-craft, export-proof, or publication-sanity
- why that mode should come first
- the first action a human or agent should take
- whether the short is one continuous pull or a multi-segment highlight
- internal join checks when the short has multiple segments
- the first few checklist items

### Full handoff artifact

```bash
script/agentctl.sh selected-short-review-brief --markdown
script/agentctl.sh selected-short-review-brief-save
```

Use the brief when the review needs to be handed to Charlie, Mako, Homer, or another agent. The brief is still evidence and guidance, not publication approval.

### Review boundary

The review-mode command does not approve, export, publish, trim, delete, or mutate source media. It only tells the reviewer where to start. Status changes still require explicit commands or UI action:

```bash
script/agentctl.sh shorts-review-selected keep "reviewed for now; not publication approval"
script/agentctl.sh shorts-review-selected refine "needs hook, pacing, caption, framing, or cut-overlap refinement"
script/agentctl.sh shorts-review-selected reject "not strong enough for this platform batch"
```

### Suggested reviewer loop

1. Select or open the next short candidate.
2. Run `selected-short-review-mode`.
3. Do the recommended first pass.
4. If the short has multiple segments, proof every join before judging caption copy.
5. If the short is continuous, tune the hook, start, end, and payoff before adding more complexity.
6. Save a brief if another reviewer needs context.
7. Mark Keep, Refine, or Reject only after the actual review pass.

### Product principle

Shorts remain recipes over the Episode Spine. The source media stays whole; the short recipe, review mode, notes, export proof, and platform packet are metadata around that source truth.

## Selected decision review-mode workflow

Use this when a SHOW/SKIP decision is selected and the reviewer needs the first sane review pass without reading the full evidence payload.

### Fast read

```bash
script/agentctl.sh selected-decision-review-mode
```

Alias:

```bash
script/agentctl.sh decision-review-mode
```

This is read-only. It inspects the selected decision evidence and reports:

- recommended review mode, such as preserve-air, cadence-hold, high-care, split-timing, cover-check, intent-metadata, or normal-listen
- why that review mode should come first
- the first action a human or agent should take
- cadence guard and human-flow guidance when available
- safe next commands for Listen, Refine, Keep, or Hold

### Full selected-decision artifact

```bash
script/agentctl.sh decision-review-brief --markdown
script/agentctl.sh decision-review-brief-save
```

Use the brief when the decision needs to be handed to Charlie, Mako, Homer, or another agent. The brief is evidence and guidance, not approval.

### Review boundary

The review-mode command does not approve, export, publish, trim, delete, or mutate source media. It only tells the reviewer where to start. Status changes still require explicit commands or UI action:

```bash
script/agentctl.sh decision-listen Codex "needs an ear pass"
script/agentctl.sh decision-refine Codex "needs timing, cover, cadence, or source-choice refinement"
script/agentctl.sh decision-keep Codex "reviewed for now; not publication approval"
script/agentctl.sh decision-hold Codex "hold for human context or uncertainty"
```

### Suggested reviewer loop

1. Select a SHOW/SKIP decision.
2. Run `selected-decision-review-mode`.
3. Do the recommended first pass.
4. If the mode is preserve-air, use Play Through and prove the removed span is not human cadence.
5. If the mode is split-timing, listen around the boundary by ear before judging the visual switch.
6. If the mode is cover-check, compare Program Output against source monitors and confirm the cover earns its keep.
7. Save a decision brief if another reviewer needs context.
8. Mark Listen, Refine, Keep, or Hold only after the actual review pass.

### Product principle

Long-form decisions remain metadata over whole synced sources. Review mode tells a human or agent where attention should go first; it is not a hidden approval engine.

## Editor review cockpit workflow

Use this when a reviewer or agent needs one calm starting point for the current editor state.

### Fast read

```bash
script/agentctl.sh editor-review-cockpit --markdown
```

Alias:

```bash
script/agentctl.sh review-cockpit --markdown
```

The cockpit reads the compact editor-loop proof, selected-decision evidence, and selected-short quality passport. It returns a single operator-facing summary with:

- editor/session status
- shared playhead state
- selected-decision review mode
- selected-short review mode
- cut rhythm audit counts and first high-risk rhythm finding
- selected short recipe structure
- the recommended first focus
- an action ladder
- do-not-do-yet boundaries
- safe next commands

### Save a handoff snapshot

```bash
script/agentctl.sh editor-review-cockpit-save
```

Optional:

```bash
script/agentctl.sh editor-review-cockpit-save /absolute/output/folder basename --markdown
script/agentctl.sh editor-review-cockpit-save /absolute/output/folder basename --json
```

The default save location is:

```text
~/Movies/QuipslyExports/ReviewCockpits
```

Snapshots are timestamped so old review states are not overwritten. Use saved snapshots when handing a pass to Charlie, Mako, Homer, or another agent.

### How to use the cockpit

1. Open or load the relevant Studio session.
2. Select a SHOW/SKIP decision or short recipe if you want focused guidance.
3. Run `editor-review-cockpit --markdown`.
4. Follow the `Start here` section before reading every other detail.
5. Follow the `Action ladder` in order: inspect first, capture evidence, then change review status only after inspection.
6. Save a cockpit snapshot when another reviewer needs the same current truth.
7. Use focused briefs only when the cockpit points to them:
   - `script/agentctl.sh decision-review-brief --markdown`
   - `script/agentctl.sh selected-short-review-brief --markdown`

### Boundary

The cockpit is a read-only decision aid. It does not approve, export, publish, schedule, upload, trim, delete, or mutate source media. It should never be used as a receipt-backed publishing claim.

### Product principle

The cockpit should reduce systems anxiety. It is the friendly front door to review evidence: one clear start, one reversible next action, and explicit guardrails against treating smart suggestions as finished work.

## Cut rhythm audit

Use this when the edit feels technically valid but emotionally suspicious:

```bash
script/agentctl.sh cut-rhythm-audit --markdown
```

Save a timestamped handoff copy with:

```bash
script/agentctl.sh cut-rhythm-audit-save
```

If the audit is too broad, start with the ordered queue:

```bash
script/agentctl.sh cut-rhythm-review-queue high 10 --markdown
```

Save the queue for handoff with:

```bash
script/agentctl.sh cut-rhythm-review-queue-save
```

For a complete handoff folder with audit, queue, JSON, and a start-here README:

```bash
script/agentctl.sh cut-rhythm-review-packet
```

If you do not know which packet to open, list recent packets first:

```bash
script/agentctl.sh cut-rhythm-packet-index --markdown
```

For the lowest-friction reviewer entry point, start with the newest packet and first queue item:

```bash
script/agentctl.sh cut-rhythm-start-here --markdown
```

For the preferred reviewer desk with latest packet, focused item, current ledger state, and safe next commands:

```bash
script/agentctl.sh cut-rhythm-review-workbench --markdown
```

For a broader status board across recent packets:

```bash
script/agentctl.sh cut-rhythm-review-status --markdown
```

To also move the playhead near that item:

```bash
script/agentctl.sh cut-rhythm-start-here --scrub --markdown
```

The default packet location is:

```text
~/Movies/QuipslyExports/CutRhythmPackets
```

Because `~/Movies/QuipslyExports` points at the external drive, these packets should land in the external review/export area without changing the app's media model.

The audit is a read-only listening map. It looks for:

- same-source jump-cut risk
- micro SKIP spans that may chop cadence
- long SKIP spans that may need a bridge or reset
- multiple SHOW sources at the same time that need explicit composite intent
- J/L-cut candidates around direct source switches
- long same-source runs that may deserve reaction cover or reframing

This is guidance, not approval. A finding means "listen here at normal speed", not "automatically change this cut." The safest loop is:

1. Run `script/agentctl.sh cut-rhythm-audit --markdown`.
2. Run `script/agentctl.sh cut-rhythm-review-queue high 10 --markdown` if there are many findings.
3. Pick the first high or medium queue item.
4. Scrub/play that span in Quipsly Studio.
5. Use the queue item's suggested review mode and status command as the starting point.
6. Mark the selected decision with `decision-listen`, `decision-refine`, `decision-keep`, or `decision-hold`.
7. Only mutate the edit after the human-flow concern is visible and understood.

The audit must not publish, export, overwrite, delete, or mutate original media.

When using `cut-rhythm-review-packet`, open `AGENT_WORK_ORDER.md` first if the packet is being handed to Codex, Mako, or another reviewer. It restates the source-safety boundaries, lists the first queue items, and defines "done" as reviewed metadata/status rather than automatic edit changes.

The packet also includes `REVIEW_LEDGER_TEMPLATE.json` and `REVIEW_NOTES_TEMPLATE.md`. Use these to record what the reviewer actually heard and saw before turning a rhythm finding into a Listen, Refine, Keep, or Hold decision. The useful future-training data is not "the heuristic fired"; it is "the heuristic fired, a reviewer checked it, and this was the human tradeoff."

After a reviewer fills in the ledger, summarize the packet with:

```bash
script/agentctl.sh cut-rhythm-review-summary /absolute/packet-folder --markdown
```

The summary is still read-only. It tells you how many items are reviewed, which ones need a human ear, and which ones may deserve edit-decision revision notes.

When reviewed ledger entries are ready to become proposed metadata actions, generate a promotion plan:

```bash
script/agentctl.sh cut-rhythm-review-promotion-plan /absolute/packet-folder --markdown
```

The promotion plan is still read-only. It proposes `decision-listen`, `decision-refine`, `decision-keep`, `decision-hold`, and `decision-intent-note` commands, but it does not run them. Because those commands apply to the currently selected decision in Quipsly Studio, the reviewer must select the matching span and approve the proposed command first.

To focus one queue item while reviewing in the app:

```bash
script/agentctl.sh cut-rhythm-focus-item /absolute/packet-folder 1 --markdown
```

The focus output includes copyable `cut-rhythm-record-review` examples for common outcomes: real problem, deliberate choice, false positive, and needs human ear.

To move the shared playhead to that item's first span without changing the edit:

```bash
script/agentctl.sh cut-rhythm-focus-item /absolute/packet-folder 1 --scrub --markdown
```

By default, scrub starts two seconds before the suspicious span so the reviewer has pre-roll context. Override that with:

```bash
script/agentctl.sh cut-rhythm-focus-item /absolute/packet-folder 1 --scrub --pre-roll 5 --markdown
```

Scrubbing is navigation only. It is safe in the same way clicking the timeline is safe: it changes what the reviewer is looking at, not the edit decision itself.

After listening, record the review outcome in the packet ledger:

```bash
script/agentctl.sh cut-rhythm-record-review /absolute/packet-folder rhythm-001 real-problem --reviewer Mako --status refine --listen "The visual jump feels abrupt after hearing the lead-in." --tradeoff "A reaction cover would preserve cadence while hiding the jump." --edit-change-needed
```

Allowed outcomes are `real-problem`, `deliberate-choice`, `false-positive`, `needs-human-ear`, `needs-source-check`, `needs-edit-change`, and `unreviewed`. This command only updates packet review evidence and writes a backup plus receipt. It does not change the edit.
