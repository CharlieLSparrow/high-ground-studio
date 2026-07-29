# Studio Goal Review Board

`script/studio_goal_review_board.py` is a read-only board for the current Quipsly Studio goal: make Episodes 1-3, 5, and 6 useful proof lanes while Episode 4 waits on missing watched/source clips.

It answers the practical reviewer questions:

- Which version is current for each episode?
- Does the package have long-form 16:9 video?
- Does it have podcast audio?
- Does it have at least a practical first set of shorts?
- Does it have carry-forward shorts from an older version that need timing review before they can count as current?
- Does it include manifests, notes, sync/missing-media reports, and publication packet evidence?
- What is the next safest action?

Run it from the active Studio surface:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
script/studio_goal_review_board.py --format markdown
script/studio_goal_review_board.py --format json
```

Before changing editor architecture or following an older path, orient on the active-source contract:

```bash
script/agentctl.sh active-source-map
```

Human-readable source map:

```text
/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/coordination/active-source-map.md
```

The source map is a map, not a prison. Structure changes are welcome when they are intentional, documented, and proven through the narrowest useful running-app, endpoint, or script evidence.

Default package root:

```text
/Volumes/My Passport/Episode_and_Shorts_Test
```

Override the root when needed:

```bash
QUIPSLY_EPISODE_EXPORT_ROOT="/Volumes/My Passport/Episode_and_Shorts_Test" script/studio_goal_review_board.py
```

Write a handoff artifact without touching original media:

```bash
script/studio_goal_review_board.py --format markdown --write "/Volumes/My Passport/Episode_and_Shorts_Test/quipsly-studio-goal-review-board.md"
```

## Truth boundary

- Reads local package folders only.
- Does not mutate original media.
- Does not overwrite old exports.
- Does not upload, schedule, publish, or send anything.
- Does not claim human approval.
- Does not claim platform receipts.

Episode 4 is allowed to remain `blocked-on-source-clips` or `reviewable-until-clips-arrive` while the other proof lanes keep moving.

## Episode 4 full-sync branch board

Episode 4 now also has a focused branch board for the simplified `Full Sync.prproj`
recovery run. This board treats Premiere as sync evidence only and reports the
three local render branches without claiming human approval or publication:

```bash
script/agentctl.sh episode4-branch-board --markdown
script/agentctl.sh episode4-branch-board --json
script/agentctl.sh episode4-branch-board --markdown --write "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Full_Sync_Edits/20260709-episode4-full-sync-v001/episode4-branch-board.md"
```

Default run folder:

```text
/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Full_Sync_Edits/20260709-episode4-full-sync-v001
```

The branch board is intentionally read-only. It checks exact file paths, durations,
resolution, audio presence, A/V duration spread, target duration fit, manifest
truth fields, source-role mix, and next safest review action. It does not mutate
original media, overwrite versions, upload, schedule, publish, approve, or create
receipt truth.

## Decision rules from the first live run

The first live run on `/Volumes/My Passport/Episode_and_Shorts_Test` clarified the current queue:

- Episode 1 current `v004` is a duration candidate with 16:9 master, 9:16 master, and podcast audio, but it still needs a real shorts pass and package evidence.
- Episodes 2, 3, 5, and 6 are local-review-ready by package evidence. That means review can start, not that they are approved or published.
- Episode 4 is `reviewable-until-clips-arrive`: keep its current media state visible, preserve missing-source uncertainty, and do not let it stall the other proof lanes.
- A 9:16 master is not a short. Shorts must live in a shorts/clips/social package or be explicitly named as a short.
- Carry-forward shorts are useful review candidates, not native current-version shorts. They should reduce anxiety by preserving good prior work, but they must not inflate the current package's readiness.

Recommended next action when the board reports the same shape:

1. Review/re-align Episode 1 carry-forward shorts against `v004`, then export native current-version shorts into a non-overwriting package.
2. Keep Episodes 2, 3, 5, and 6 in human review flow.
3. Keep Episode 4 waiting visibly for missing watched/source clips.

## Episode 1 v004 carry-forward packet

Episode 1 `v004` now has a carry-forward review packet:

```text
/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/shorts-carryforward-review
```

That packet points to twelve Episode 1 `v003` shorts as candidates to review against `v004`. The board reports this as `needs-shorts-realignment-review`, not `review-ready-local`, because the shorts have not yet been regenerated or accepted as native `v004` exports.

Create a review workorder from that packet:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
script/shorts_carryforward_workorder.py
script/agentctl.sh shorts-carryforward-workorder
```

The workorder gives each carry-forward short an explicit review checklist, a local HTML review page, and outcome vocabulary: `accept`, `refine`, `reject`, or `hold`. It still does not copy media, publish media, approve media, or make old shorts count as native current-version exports.

Generate a visual contact sheet with derived review frames:

```bash
script/agentctl.sh shorts-carryforward-contact-sheet
```

Contact sheets are review aids only. They use derived thumbnails and do not change source media, export state, approval state, or publication truth.

Record a review decision without touching media:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
script/shorts_carryforward_record_review.py --index 1 --outcome refine --reviewer Codex --note "Good hook, but timing needs target-version check."
script/agentctl.sh shorts-carryforward-record-review --index 1 --outcome refine --reviewer Codex --note "Good hook, but timing needs target-version check."
```

Use richer creative dimensions when the decision should teach the editor:

```bash
script/agentctl.sh shorts-carryforward-record-review \
  --index 2 \
  --outcome refine \
  --reviewer Codex \
  --note "Good social candidate, but needs target-version timing review." \
  --hook-note "Opening idea is concrete enough for a short." \
  --pacing-note "Keep the human pause before tightening the tail." \
  --framing-note "Check face position in 9:16 before promotion." \
  --caption-note "Caption should not cover faces or the key visual." \
  --audio-note "Cadence matters more than removing every silence." \
  --ending-note "Needs a cleaner final beat or curiosity handoff." \
  --platform-fit-note "Likely useful for YouTube Shorts and Facebook; LinkedIn needs a more explicit lesson." \
  --risk-note "Carry-forward timing may drift from v004." \
  --tradeoff-note "Preserve warmth over maximum compression." \
  --confidence needs-human-review
```

Summarize the current review ledger:

```bash
script/shorts_carryforward_record_review.py --summary
script/agentctl.sh shorts-carryforward-review-summary
```

Ask for the next best pending review target:

```bash
script/agentctl.sh shorts-carryforward-review-next
```

Generate a focused card for that exact next target:

```bash
script/agentctl.sh shorts-carryforward-next-review-card
```

The focused card is the preferred entry point for reviewing the next carry-forward short. It embeds the local source short in the HTML page, shows start/middle/end frames in order, and asks for structured creative review notes before a decision is recorded. Reviewers should watch the playable short first; frames and metadata are navigation aids, not enough evidence by themselves.

Generate a batch review theater when comparison matters:

```bash
script/agentctl.sh shorts-carryforward-review-theater
```

The theater embeds every carry-forward candidate on one local HTML page, keeps the same structured creative review fields, and surfaces per-candidate commands. Use it when the reviewer needs to compare hooks, pacing, framing, or platform fit across multiple shorts before recording decisions.

The theater also includes a sticky review cockpit, candidate jump links, pending/reviewed labels, and copy buttons for structured commands. Copying a command is still only preparation: no decision is recorded until the command is run through Studio tooling.

Generate the cross-episode shorts command room:

```bash
script/agentctl.sh studio-shorts-command-room --max-embed-per-episode 8
```

The command room is the proof-lane overview for Episodes 1-3, 5, and 6. It links Episode 1's carry-forward theater, embeds a capped set of native current-version shorts for the other proof lanes, and keeps hidden overflow counts visible so large packages do not quietly disappear from review. It is read-only and does not record decisions.

Native current-version shorts in the command room are probed with `ffprobe` when available. The generated JSON, Markdown, HTML, and downstream native short decision ledger should show duration, aspect, audio/video presence, codec basics, and probe status. Probe facts are review evidence, not approval.

The command room also emits `recommendedNextShorts`. This is a transparent heuristic, not an AI approval: cleanly probed 9:16 shorts with audio and practical social duration are routed first. The recommendation includes the reason, likely platform fit, and a dry-run decision command so reviewers can start without guessing.

Open the shorts review front door:

```bash
script/agentctl.sh studio-shorts-review-start-here
```

The Start Here board is the current reviewer map for the native shorts ladder. It points humans and agents to the command room, recommended theater, next-short selector, focused packet, evidence drafts, evidence index, preflight/dry-run helper, and local review decision ledger. It also states the current active surfaces explicitly: `apps/QuipslyStudio` is the active Studio product surface, `/Volumes/My Passport/Episode_and_Shorts_Test` is the current Episode 1-6 review/export root, and older names or paths are archaeological unless an intentional migration note says otherwise.

This board is navigation, not a gate. It records no review decisions, approves nothing, publishes nothing, uploads nothing, schedules nothing, mutates no accounts, mutates no media, overwrites no exports, deletes nothing, and creates no platform receipt truth.

The Start Here board also links the active-source map so reviewers can tell the difference between active product truth, deliberate migrations, and stale archaeology.

The main Studio goal board now reads that Start Here artifact and surfaces it near the top of the board. This makes the path explicit:

```text
episode package state -> shorts front door -> focused short packet -> transcript/caption readiness -> transcript/caption workorders -> evidence draft -> preflight -> dry-run -> explicit local ledger record
```

If the Start Here board is missing or stale, refresh it first:

```bash
script/agentctl.sh studio-shorts-review-start-here --all
script/studio_goal_review_board.py --format markdown --write "/Volumes/My Passport/Episode_and_Shorts_Test/quipsly-studio-goal-review-board.md"
```

Generate a watch-first theater for those recommended native shorts:

```bash
script/agentctl.sh studio-recommended-shorts-review-theater
```

The recommended shorts theater embeds the top recommendation queue from the command room, shows media facts and current local review status, and exposes copyable dry-run commands before any local intent is recorded. It is intentionally a theater, not a gate: it helps Charlie, Mako, Homer, or Codex watch/listen and decide without creating approval, publication, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth.

Ask for the next recommended short without opening the whole theater:

```bash
script/agentctl.sh studio-recommended-short-next
script/agentctl.sh studio-recommended-short-next --json
script/agentctl.sh studio-recommended-short-next --short-id episode-2-short-01
```

The next-short command is the tiny steering wheel for humans and agents. It returns the selected short, media facts, a watch-first checklist, and safe dry-run commands. It is still read-only routing: no local review decision is recorded until a reviewer explicitly runs the decision command.

Create a focused review packet for the selected short:

```bash
script/agentctl.sh studio-recommended-short-review-packet
script/agentctl.sh studio-recommended-short-review-packet --short-id episode-3-short-01
```

The packet is the preferred watch/listen evidence surface for one short. It embeds the local video, shows media facts, reports whether transcript/caption candidates are available near the package, and asks structured questions about hook, cadence, meaning, framing, captions, audio, ending, platform fit, and risk/tradeoff. It still records no local review decision; use it to write specific evidence before running a dry-run or live local-intent command.

Check transcript and caption readiness across recommended native shorts:

```bash
script/agentctl.sh studio-shorts-transcript-readiness
```

The transcript readiness board looks for nearby timed captions, structured transcript candidates, text-only transcript/caption evidence, placeholder review captions, and missing word evidence for the recommended shorts. It is evidence routing, not transcript truth. Timed captions can help caption placement and rough word-aware review only when they contain usable spoken-word text. Readable scouting labels or timestamp-only SRT shells are placeholders, not semantic transcript evidence, and should be marked as needing word evidence instead of forcing caption-aware claims.

This board does not run ASR, import transcripts, burn captions, approve copy, record decisions, mutate media, publish, upload, schedule, or create receipts.

Create transcript and caption workorders from readiness:

```bash
script/agentctl.sh studio-shorts-transcript-workorders
```

The workorder board turns missing or weak word evidence into concrete sidecar tasks. It plans raw provider output, normalized transcript JSON, caption draft SRT/VTT, review notes, and transcript decision-ledger locations per short. Those paths are destinations for future transcript work, not evidence that the transcript already exists.

Workorders also cover shorts that already have timed-caption candidates by asking reviewers to verify timing, speaker sense, and caption-safe framing before using the text for cut or caption decisions.

Prepare transcript intake audio sidecars:

```bash
script/agentctl.sh studio-shorts-transcript-intake-batch --limit 12
```

The transcript intake batch reads workorders and creates versioned local audio sidecars from exported short files, plus JSON/HTML manifests. This is the bridge from "we need words" to "ASR/manual transcript review has concrete inputs." It does not run ASR, create transcript truth, record review decisions, mutate source media, publish, upload, schedule, or create receipt truth.

Latest proof: the current recommended-short caption pass found no usable spoken-word transcript evidence. Six shorts have missing word evidence and six shorts have readable review/scouting placeholder captions, so all 12 current recommended shorts route to create/link word-evidence workorders. The first transcript-intake batch created 12 audio-ready WAV sidecars under `/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/transcript-intake/20260702T194602Z-transcript-intake-batch`.

Open the cut-quality workbench:

```bash
script/agentctl.sh studio-shorts-cut-quality-workbench
```

The cut-quality workbench is a watch/listen-first editorial surface. It merges the recommended shorts theater, transcript readiness, and transcript workorders so a reviewer can ask better questions about hook, cadence, J-cuts, L-cuts, jump-cut covers, reaction beats, captions, crop, and platform fit. It does not judge a short as ready, generate words, edit timelines, export media, approve anything, or publish. It only turns scattered evidence into the next editing questions.

Pick one cut-quality target:

```bash
script/agentctl.sh studio-shorts-cut-quality-next
script/agentctl.sh studio-shorts-cut-quality-next --short-id episode-2-short-01
script/agentctl.sh studio-shorts-cut-quality-next --readiness caption-timing-review
```

The next-target command is the small steering wheel for the cut-quality loop. It returns one short, the exact watch/listen protocol, platform checks, editor questions, and safe commands for packet/evidence work. It is routing only and records no intent.

Create a visual cut-quality contact sheet:

```bash
script/agentctl.sh studio-shorts-cut-quality-contact-sheet
script/agentctl.sh studio-shorts-cut-quality-contact-sheet --short-id episode-2-short-01 --frames 8
```

The contact sheet extracts timestamped frames from one native short so reviewers can inspect hook frame, crop/framing, caption-safe space, jump-cut risk, reaction beats, and platform fit before writing worksheet notes. It creates versioned local JPEG/JSON/Markdown/HTML artifacts only. It does not edit timelines, export media, record intent, approve anything, publish, mutate media, or create receipt truth.

Index visual contact sheets:

```bash
script/agentctl.sh studio-shorts-cut-quality-contact-sheet-index
```

The contact-sheet index finds the latest visual packet per short and gives reviewers a stable front door instead of forcing them through timestamped folders. It is a status surface only; visual evidence still needs watch/listen review and worksheet notes before any local intent is recorded.

Create an audio/cadence probe:

```bash
script/agentctl.sh studio-shorts-cut-quality-audio-probe
script/agentctl.sh studio-shorts-cut-quality-audio-probe --short-id episode-2-short-01 --noise=-42dB --minimum-silence 0.35
```

The audio probe measures pause density, loudness, waveform shape, and cadence risk for one native short. It is evidence for human-feeling editing, not an automatic judgment. Use it to decide what to listen for before recording cadence, J/L cut, audio feel, or risk/tradeoff notes.

Index audio/cadence probes:

```bash
script/agentctl.sh studio-shorts-cut-quality-audio-probe-index
```

The audio-probe index finds the latest cadence packet per short and gives reviewers one stable place to compare silence density, pause counts, volume, waveform paths, and cadence warnings. It is still measurement only; listen before recording local intent.

Build a one-short cut-quality review packet:

```bash
script/agentctl.sh studio-shorts-cut-quality-review-packet
script/agentctl.sh studio-shorts-cut-quality-review-packet --short-id episode-2-short-01
```

The review packet is the preferred one-short cockpit once visual and audio evidence exist. It embeds the playable short, latest contact-sheet frames, waveform, detected pauses, editor questions, and safe note commands. It is still review evidence only: no approval, no timeline edit, no export, no publication, and no receipt truth.

Index one-short review packets:

```bash
script/agentctl.sh studio-shorts-cut-quality-review-packet-index
```

The review-packet index finds the latest merged cockpit per short. This is the easiest doorway for Charlie, Mako, Homer, or Codex when the question is: “Which short should I open and review now?”

Batch-build missing cut-quality evidence:

```bash
script/agentctl.sh studio-shorts-cut-quality-batch --limit 4
```

The batch command builds missing visual contact sheets, audio/cadence probes, one-short review packets, and indexes for the next ranked shorts. It is a conveyor-belt helper, not a decision-maker: it creates local evidence only and does not approve, edit, export, publish, upload, transcribe, overwrite prior packets, or create receipt truth.

Rank and prepare polish work:

```bash
script/agentctl.sh studio-shorts-cut-quality-refinement-queue
script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id episode-5-short-01
script/agentctl.sh studio-shorts-cut-quality-polish-note-preview --short-id episode-5-short-01
script/agentctl.sh studio-shorts-cut-quality-polish-cockpit --short-id episode-5-short-01
script/agentctl.sh studio-shorts-cut-quality-polish-cockpit-index
script/agentctl.sh studio-shorts-cut-quality-polish-batch --limit 4
script/agentctl.sh studio-shorts-cut-quality-polish-triage
```

The refinement queue ranks evidence-complete shorts into polish-first, review-then-polish, cadence-review-first, and hold-for-human-feel-review lanes. The polish workorder turns one short's frames, waveform, cadence facts, and platform checks into concrete hook, crop, caption, cadence, audio, J/L cut, and ending-payoff tasks. The note preview packages suggested worksheet note commands for copy/review, but does not run them. The polish cockpit gathers the playable short, representative frame, waveform, review packet, workorder, worksheet, note-preview bridge, and safe commands onto one local review surface. The cockpit index finds the latest cockpit per short so reviewers do not need to dig through timestamped folders. The polish batch creates missing polish surfaces for the next ranked shorts and refreshes the index. The polish triage board groups cockpit-ready shorts by lane and explains what to inspect first. These commands still do not record approval, edit timelines, export media, publish, upload, or create receipt truth.

Create a versioned cut-quality worksheet:

```bash
script/agentctl.sh studio-shorts-cut-quality-worksheet
script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id episode-2-short-01 --reviewer Mako
```

The worksheet is a local note-taking artifact for a single short. It gives the reviewer fields for hook, cadence, J/L cuts, jump-cut cover, reaction beat, captions, crop/framing, audio feel, ending payoff, platform fit, and risk/tradeoff. It creates new timestamped worksheet files and does not record any review decision.

Index cut-quality worksheets:

```bash
script/agentctl.sh studio-shorts-cut-quality-worksheet-index
```

The index finds every versioned worksheet, reports the latest worksheet per short, and shows which fields are still empty. It is how reviewers avoid losing worksheet evidence before turning specific notes into evidence drafts.

Capture a cut-quality field note:

```bash
script/agentctl.sh studio-shorts-cut-quality-note \
  --short-id episode-2-short-01 \
  --field hook \
  --note "The opening needs one more second of setup before the idea is clear."
```

Notes are versioned sidecars. The worksheet index counts `review-evidence` notes as filled worksheet fields, while `system-check` notes can prove tooling without polluting editorial evidence.

Preview evidence from worksheet notes:

```bash
script/agentctl.sh studio-shorts-cut-quality-evidence-preview --short-id episode-2-short-01
```

The evidence preview reads worksheet notes and produces a command preview for `studio-recommended-short-evidence-draft`. If no `review-evidence` notes exist, it says so and does not pretend the worksheet is ready. It creates a local preview packet only.

Index evidence previews:

```bash
script/agentctl.sh studio-shorts-cut-quality-evidence-preview-index
```

The preview index finds the latest evidence preview per short and shows whether it is ready for an evidence-draft command or still waiting on review notes. It is a status surface only.

Create a versioned evidence draft from that packet:

```bash
script/agentctl.sh studio-recommended-short-evidence-draft \
  --short-id episode-2-short-01 \
  --outcome refine \
  --summary "Good premise, but needs a clearer opening beat before it should move forward." \
  --hook-note "The idea is concrete, but the first two seconds do not yet frame the promise." \
  --cadence-note "Do not over-tighten the pause; it keeps the thought human." \
  --framing-note "9:16 crop should keep the speaker's eyes in the upper third." \
  --caption-note "Captions should sit below the face and avoid covering the microphone."
```

Evidence drafts are versioned beside the packet under `evidence-drafts/`. They generate a dry-run decision command and a recorded-intent template, but they do not mutate the review ledger. This is the handoff layer where review observations become reusable editing intelligence before any local decision is recorded.

Index existing evidence drafts:

```bash
script/agentctl.sh studio-short-evidence-draft-index
```

The draft index is the reviewer map after multiple evidence passes exist. It lists the latest draft per short, whether the evidence is specific enough for a dry-run or recorded local intent, the current ledger decision, and the next safest action. It keeps evidence visible without turning drafts into approval, publication, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth.

Ask for the next evidence draft to act on:

```bash
script/agentctl.sh studio-short-evidence-draft-next
script/agentctl.sh studio-short-evidence-draft-next --json
```

The next-draft selector chooses the safest pending evidence draft from the index and returns its dry-run command, record-template command, and next safest action. This is still routing only: it does not run the dry-run or record local intent.

Preflight, dry-run, or record local intent from the next evidence draft:

```bash
script/agentctl.sh studio-short-evidence-draft-record --json
script/agentctl.sh studio-short-evidence-draft-record --short-id episode-2-short-01 --dry-run --json
script/agentctl.sh studio-short-evidence-draft-record --short-id episode-2-short-01 --record --json
```

The record helper defaults to preflight. Preflight explains the selected evidence draft, specificity, command preview, and mutation contract without invoking the ledger. Use `--dry-run` to ask the local ledger for a mutation preview. `--record` is required before the local short review decision ledger can change, and the evidence draft must be specific enough for recorded intent unless a reviewer deliberately uses `--force`. A recorded local intent still means only “this short has review intent in the local ledger.” It is not publication approval, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth.

Latest proof: `episode-5-short-01` now has a corrected focused review packet, because empty timestamp-only SRT shells are classified as placeholder caption files rather than readable transcript evidence. It also has a `needs-more-evidence` evidence draft and a successful dry-run through `studio-short-evidence-draft-record`; the dry-run reported no ledger mutation, no media mutation, no external action, and no receipt truth. This is the desired seam: visual/audio/cadence evidence can become reusable review intelligence without pretending the spoken hook or ending payoff has been semantically approved.

Build the Studio-wide native short review decision ledger from that command room:

```bash
script/agentctl.sh studio-short-review-decision-ledger "/Volumes/My Passport/Episode_and_Shorts_Test"
```

This ledger records local short review intent for native current-version shorts only. It currently excludes Episode 1 carry-forward candidates because those use the separate carry-forward review theater and carry-forward decision ledger. The ledger may record `keep`, `refine`, `hold`, `reject`, or `needs-more-evidence`, but those are still local review decisions, not approval, publication, or receipt truth.

The recorder appends to a JSONL ledger and regenerates a current summary. Accepted candidates still require native target-version export before the board can count them as current shorts.

The main Studio goal board reads that summary and surfaces the recommended next review target directly under the episode. The board recommendation is routing, not approval: it tells the reviewer where to start, not what decision to make.

## Ledger vs summary truth

The board reports review ledgers separately from review summaries:

- `Review decision ledgers` means actual recorded reviewer decisions, normally the JSONL ledger created by `shorts_carryforward_record_review.py`.
- `Review decision summaries` means generated navigation/state files such as `review-decisions-summary.json` or `.md`.

This separation is intentional. A summary can help a reviewer find the next candidate, but it must not make the package look reviewed when no accept/refine/reject/hold decision has actually been recorded.

## 2026-07-02 - Shorts transcript intake workflow

Current recommended shorts now have a reversible transcript-intake ladder:

1. `script/agentctl.sh studio-shorts-transcript-intake-batch --limit 12` creates 16k mono WAV sidecars from exported shorts only.
2. `script/agentctl.sh studio-shorts-transcript-intake-index` indexes the latest sidecar per short.
3. `script/agentctl.sh studio-shorts-transcript-intake-next --json` selects the next audio-ready short and returns planned destinations for raw ASR output, normalized transcript JSON, SRT, and VTT.

Latest proof: 12 shorts indexed, 12 audio-ready, 0 needing audio intake, 12 still needing real word evidence. No ASR was run, no transcript truth was created, no media was mutated, and no external publishing or receipt truth was recorded.

## 2026-07-02 - Transcript intake workbench added

Command added: `script/agentctl.sh studio-shorts-transcript-intake-workbench --all`.

The workbench is the current safe bridge from exported short audio sidecars to future transcript/caption truth. It creates local worksheet files only when missing and preserves existing notes. Latest proof: 12 items, 12 audio-ready sidecars, 12 worksheets, 0 normalized transcript sidecars. Next action is ASR/manual transcript creation and review for one short at a time, then rerun transcript readiness.

## 2026-07-02 - First ASR draft proof

Command added: `script/agentctl.sh studio-shorts-transcript-asr-draft --run-asr --model base`.

Proof run: `episode-2-short-01` produced raw provider output, ASR draft transcript JSON, and draft SRT/VTT sidecars. Transcript readiness now reports this as `machine-draft-word-evidence`, and transcript workorders route it to `review-machine-draft-word-evidence` before any normalized transcript truth is created.

Current next action: continue generating ASR/manual word evidence for the remaining 11 recommended shorts, then review/promote drafts one at a time.

## 2026-07-02 - ASR draft coverage reached current recommended shorts

Current recommended shorts now have machine transcript/caption draft evidence across the transcript-intake workflow. Latest Start Here proof: 12 machine draft word-evidence items, 12 review-machine-draft workorders, 12 ASR draft transcripts, 0 create/link word-evidence tasks, 0 missing/placeholder word-evidence tasks.

Next safest action: review the machine ASR/caption drafts against the audio before promoting any words into normalized transcript truth or using them for caption-aware edit intent.

## 2026-07-02 - Transcript review surface improved

The transcript-intake workbench now surfaces ASR draft summaries directly in the board. Latest proof: 12 draft transcripts, 609 approximate words, 66 segments. The board still reports 0 transcript truth created and routes every current recommended short to machine-draft review before promotion.

## 2026-07-02 - Transcript review/promote proof

`episode-2-short-01` now has a normalized transcript sidecar accepted for edit-review context. Start Here proof: 1 normalized transcript edit-review item, 11 machine draft word-evidence items, 12 ASR draft transcripts total. The next safe action is to review/promote the remaining 11 machine drafts or mark specific drafts as correction-needed/held.

## 2026-07-02 - Transcript review cockpit proof

Command added: `script/agentctl.sh studio-shorts-transcript-review-cockpit --all`.

The cockpit is now the fastest way to review current recommended short transcript drafts. Latest readback: 12 review cards, 1 accepted-for-edit-review sidecar, 11 machine drafts needing review, 1 ledger event. Start Here now links the cockpit and preserves the next safest action: review the remaining machine ASR/caption drafts before promoting words into transcript truth or caption-aware edit intent.

## 2026-07-02 - Transcript-aware cut-quality review path

The shorts cut-quality workbench now reads the transcript review cockpit and exposes transcript status per recommended short.

Current readback:

```json
{
  "cutQualityItems": 12,
  "transcriptAcceptedForEditReview": 1,
  "transcriptMachineDraftNeedsReview": 11,
  "nextSafestAction": "Review machine ASR/caption drafts for 11 current recommended shorts before promoting words into transcript truth or caption-aware edit intent."
}
```

Next safest action: review the 11 machine ASR/caption drafts against audio, then promote each as accept-for-edit-review, needs-correction, or hold. Accepted transcript context may guide edit review, but final captions still require explicit human approval before publishing.

## 2026-07-02 - Semantic review queue added to Start Here

The Start Here board now includes a semantic review queue artifact door and counts for hook/cadence risks surfaced from transcript and cut-quality evidence.

Current readback:

```json
{
  "semanticReviewQueueItems": 12,
  "semanticGenericOpenerRisk": 6,
  "semanticAbruptEndingRisk": 2,
  "semanticReviewableHookCandidate": 5,
  "semanticDoorReady": true
}
```

Next safest action: review the 11 machine ASR drafts against audio, then use the semantic queue to record focused hook/cadence/ending notes before mutating any edit decision.

## 2026-07-02 - Semantic evidence note created for Episode 2 short 01

A local hook evidence note now exists for `episode-2-short-01`, generated from the semantic review queue and routed through the worksheet index.

Current readback:

```json
{
  "cutQualityWorksheets": 14,
  "cutQualityReviewEvidenceNotes": 6,
  "semanticReviewQueueItems": 12,
  "semanticGenericOpenerRisk": 6,
  "semanticAbruptEndingRisk": 2
}
```

Next safest action: continue reviewing machine ASR drafts against audio, then record specific evidence notes for the generic-opener and abrupt-ending risks before changing timeline decisions.

## 2026-07-02 - Semantic edit candidates now routed from Start Here

The Start Here board now exposes semantic edit candidates that translate transcript/cut-quality risks into timestamped audition points.

Current readback:

```json
{
  "semanticEditCandidateItems": 12,
  "semanticTestStrongerInPoint": 5,
  "semanticCheckEarlierOutPoint": 2,
  "semanticEditCandidatesDoorReady": true
}
```

Next safest action: audition `episode-2-short-01` around `19.40s` as a stronger hook candidate, or continue reviewing the 11 ASR drafts before using their text as semantic cut evidence.

## 2026-07-02 - First rendered semantic audition preview

Rendered one local audition preview for `episode-2-short-01` from the semantic candidate around `19.05s` to the end. The preview exists to test whether a stronger hook starts at `how you feeling about episode two?`.

Current readback:

```json
{
  "semanticEditAuditions": 1,
  "semanticRenderedAuditions": 1,
  "semanticWarningAuditions": 1,
  "semanticEditAuditionIndexDoorReady": true
}
```

Important finding: the preview is only about 3.53 seconds, which strongly suggests the existing short recipe is too setup-heavy or too late-ending. Next action should be to choose a better source span or treat this as a diagnostic failure, not promote it as a platform-ready short.

## 2026-07-02 - Short recipe repair queue exposes traceability gap

The shorts repair queue now routes failed auditions into concrete next actions and exposes missing source-range metadata.

Current readback:

```json
{
  "recipeRepairItems": 12,
  "recipeNeedsNewSourceSpan": 1,
  "recipeNeedsAuditionPreview": 6,
  "recipeMissingSourceRange": 12
}
```

Next safest action: do not polish `episode-2-short-01` as-is. Pick a better source span from Episode 2 or regenerate the short recipe with whole-source traceability. Also update future short package metadata so every short can map back to episode sequence/source in-out.

## 2026-07-02 - Shorts lineage status

Current shorts review ladder now includes `studio-shorts-lineage-audit` before local ledger review intent. This keeps review state honest: a playable MP4 is reviewable evidence, not canonical edit truth.

Readback from Start Here:
- Lineage audit items: `12`
- Fully traceable shorts: `0`
- Missing source range: `12`
- Needs backfill: `12`
- Lineage artifact door exists: `true`

Next safest production action: backfill source lineage from session/timeline metadata before trusting current shorts as repairable production objects. This is a visibility gap, not a publication receipt or export failure.

## 2026-07-02 - Shorts lineage backfill status

Current Start Here board now includes `studio-shorts-lineage-backfill` after `studio-shorts-lineage-audit`. The ladder now distinguishes three states:
- playable export evidence,
- recovered sequence/recipe lineage,
- fully source-lane traceable Quipsly-native recipe truth.

Readback from Start Here:
- Lineage audit items: `12`
- Needs lineage backfill: `12`
- Backfill items: `12`
- Partial backfills: `12`
- Backfills with sequence range: `12`
- Backfills with source lane: `0`
- Backfill artifact door exists: `true`

Next safest production action: infer or restore source lane/tag identity from saved session decisions before using these shorts for high-confidence automatic repair. Current backfill is useful for timeline review and semantic repair, but not yet enough to prove exact source camera/tag authorship.

## 2026-07-02 - Source-lane inference status

Shorts lineage backfill now recovers inferred source-lane authorship for all 12 current recommended shorts by comparing recovered recipe sequence ranges against saved session lane decisions in sequence time.

Current Start Here readback:
- Backfill items: `12`
- Explicit source-lane records: `0`
- Inferred source-lane records: `12`
- High-confidence inferences: `2`
- Medium-confidence inferences: `10`
- Partial backfills: `0`

Next safest production action: use inferred lane candidates to guide review and repair, then fix the export/recipe creation path so future shorts store explicit source lane and source tag identity. This is a good recovery layer, not a replacement for writing clean lineage at the source.

## 2026-07-02 - Export bridge lineage fix

Selected-short proxy exports now preserve sequence-time render ranges and separate explicit recipe lineage from rendered fallback evidence.

Current contract:
- Authored `sourceLaneId` / `sourceTagId` in a short recipe is canonical short lineage.
- `renderedVideoLaneId` in an export manifest is useful render evidence when authored lineage is missing.
- `rendered-video-lane-fallback` must not be counted as explicit source authorship.

Validation note: a controlled Episode 2 native-proof export rendered successfully to `/tmp/quipslystudio-short-export-lineage-smoke`, preserving `sequenceStartTime: 504.4` and `sequenceEndTime: 526.96`. The live app `load-session-wait episode-2-native-proof` endpoint timed out and should be treated as a separate agent-control hardening task.
