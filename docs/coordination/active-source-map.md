
## 2026-07-02 - QuipslyStudio native app source-of-truth correction

- Current native editor product surface: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`.
- Current run path: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/build_and_run.sh --verify`.
- Current app bundle under test: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app` with bundle id `com.highground.QuipslyMac`.
- Do not use the older `/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac/dist/QuipslyMac.app` as evidence for QuipslyStudio editor work. Generic Computer Use targeting by app name can accidentally resurrect that old shell.
- If a macOS removable-volume prompt blocks launch, inspect `UserNotificationCenter` rather than the Quipsly app process. The actual prompt owner can be found with CoreGraphics window listing; button names may be exposed under `System Events` process `UserNotificationCenter`.
- Launch contract: the Studio app should open metadata-first and not auto-load the previous external-media session. Agents must explicitly load sessions and then require `/state` readback proof.


### Verify contract update - 2026-07-02

`apps/QuipslyStudio/script/build_and_run.sh --verify` is now the preferred launch proof because it checks:

- only the active Studio bundle path is running as `QuipslyMac`
- no Quipsly macOS permission prompt is blocking launch under `UserNotificationCenter`
- a visible `Quipsly Studio` window exists via CoreGraphics
- the local AgentServer answers
- editor state is published

If generic app control opens `/Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac/dist/QuipslyMac.app`, that is the old shell and is not proof for active QuipslyStudio editor work.


## Structure-change principle - 2026-07-02

Repo/app structure is allowed to evolve. The rule is not "stick to old paths forever." The rule is: change structure on purpose, with awareness of the current live surface, the reason for the move, and the proof that agents are using the new truth.

Before moving, deleting, renaming, or replacing a surface, agents should identify:

- Current live surface: which app/script/route is actually active.
- Reason for change: what user/product pain the change solves.
- Replacement truth: where future agents should look first.
- Compatibility decision: whether old paths are archived, redirected, or removed.
- Verification path: the command, app state, endpoint, screenshot, or artifact proving the new surface works.

This is meant to prevent rabbit-hole drift, not prevent bold architecture changes.

### Map-not-commandment update - 2026-07-03

This source map is a navigation chart, not a cage. If the product surface, folder structure, launcher, or workflow needs to change, change it intentionally and then update the map with:

- what was live before
- what replaced it
- why the replacement is better
- how agents and humans prove they are using the new surface
- what old path should be ignored, archived, redirected, or removed

The anti-pattern is not change. The anti-pattern is rabbit-hole drift: following stale paths, abandoned prototypes, or convenient shortcuts without current situational awareness.

## Agent editing cockpit - 2026-07-02

Use `apps/QuipslyStudio/script/agentctl.sh playhead-context` for compact current-playhead readback before making edit decisions. It is the first-pass observe command for real agent editing because it returns only the active session, shared playhead, source readiness, selected decision, selected short, cut-awareness summary, and next safe actions.

Use `/state` for full diagnostics and `editor-loop-proof` for broad proof, but prefer `playhead-context` when the next action is source choice, decision review, short selection, or cut-intent work.

Current live store path for native session/project state is `apps/QuipslyStudio/Sources/QuipslyVideoCore/ProjectStore.swift`. Older references to `Sources/SharedUI/ProjectStore.swift` are stale and should not be followed.

## Playhead review artifacts - 2026-07-02

When an agent or human needs to capture the current editing context for review, use:

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/agentctl.sh playhead-context-markdown
./script/agentctl.sh playhead-context-save
```

Default external output, when mounted: `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/playhead-context`.

This is the durable receipt path for "what was visible at this playhead and what was the next safe action?" It is not an export, not a publication receipt, and not a source mutation.

## Selected decision review cards - 2026-07-02

Use this when a selected SHOW/SKIP decision needs a compact handoff card for Codex, Mako, Charlie, or future Quipsly review:

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/agentctl.sh playhead-decision-card
./script/agentctl.sh playhead-decision-card-save
```

This joins playhead context, selected decision intent evidence, and human-cut guidance into one Markdown/JSON packet. It is the preferred artifact for explaining why a cut exists, what cadence or jump-cut risk is present, and what next safe action should happen.

Important invariant: the card must keep sequence time and source time separate. Sequence time is the shared episode spine. Source time is the original/proxy media clock after sync offset.

## QuipslyStudio selected-decision review index

Current review-card workflow lives in `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh`:

- `playhead-decision-card-save` records immutable-ish evidence for the current selected decision.
- `playhead-decision-card-index --markdown` turns saved cards into a human/agent review queue.
- `playhead-decision-card-index-save` writes timestamped JSON/Markdown index artifacts.

Purpose: structure can move, but review truth must stay intentional. This map is a living decision record, not a cage. If a path, launcher, artifact folder, or UI surface changes, record what changed, why it changed, what replaced the old path, and what proof says the new path works. Saved cards are evidence; the index is the working view. This avoids treating duplicate artifacts as separate decisions and preserves the invariant that sequence time and source time are not interchangeable.

### Next selected-decision review target

`/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh playhead-decision-card-next` is the current shortcut for one actionable selected-decision review target. It reads the same card folder as `playhead-decision-card-index` and should remain a thin view over saved review evidence, not a separate source of truth.

### Selected-decision guidance status invariant

The selected-decision guidance surface must not say `needs-selected-decision` when state already contains a selected lane/tag. Current statuses:

- `needs-selected-decision`: no selected decision is present.
- `selected-decision-needs-guidance`: a decision is selected, but structured human-cut guidance is missing.
- `ready`: selected decision and structured guidance are both available.

Agent review commands should use observe-act-observe. In particular, after `seek` and `select-decision`, run `script/agentctl.sh state` before trusting the next dependent command, because the registered editor bridge can queue view work asynchronously.

### Saved next-decision handoff

`/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh playhead-decision-card-next-save` writes the current next selected-decision review target as JSON and Markdown. It is a durable handoff packet over the card index, not another truth source. Use it when a reviewer or agent needs one clear next cut to inspect after a session, crash, or handoff.

Latest validated next-decision handoff proof:

- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.md`
- `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/decision-card-next/20260703T040601Z-next-decision-review.json`

These files are review-board artifacts only. They are not publication receipts and not canonical timeline state.

## Studio shorts review handoff

Current shorts review workflow lives behind `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh`:

- `studio-next-shorts-review-batch` writes the local shorts review batch under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches`.
- `studio-next-short-review-handoff` reads that batch and shows one actionable short to review.
- `studio-next-short-review-handoff-save` writes a timestamped JSON/Markdown handoff under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-next`.
- `studio-next-short-watch-listen-brief` turns the ranked handoff into a checklist for watching/listening to the next short.
- `studio-next-short-watch-listen-brief-save` writes that checklist under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-watch-listen-briefs`.
- `studio-next-short-review-evidence` creates the concrete contact sheet, audio/cadence probe, and existing machine transcript-draft pointers for the same ranked short. Use `--short-id <id>` when an agent or reviewer needs evidence for a specific local short instead of the ranked next short.
- `studio-next-short-review-evidence-save` writes a combined packet under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-review-evidence-packets`.
- `studio-short-review-readback` gathers the ranked handoff, local decision ledger, latest evidence packet, and latest worksheet into one compact readback. Use it instead of writing one-off shell parsers when checking a short's current review state.
- Ledger-only shorts can be valid even when the cut-quality workbench is stale. In that case `studio-next-short-review-evidence` writes a one-short fallback workbench under `shorts-command-room/cut-quality-workbench/single-short-fallbacks/` so contact sheets and audio probes can still inspect the real media without mutating it.
- `studio-shorts-cut-quality-polish-workorder --short-id <id>` turns a short marked `refine` into concrete review/polish tasks for the next version. Use this before creating a v002 export so `refine` stays an actionable routing state, not a junk drawer.

Important path decision: the live batch builder currently lives in `apps/QuipslyStudio/script/experimental/build_studio_next_shorts_review_batch.py`, and `agentctl.sh` must call it through `script_path`. That is intentional structure, not a reason to blindly move the file. Stable commands belong at the `agentctl.sh` front door; still-forming builders may live in `script/experimental` as long as the launcher and docs name the current truth.

Boundary: shorts review handoffs are local review artifacts only. They do not approve, publish, upload, schedule, mutate accounts, mutate source media, overwrite versions, delete files, or create receipt truth.

The selected-short app-state brief and the ranked next-short local-package brief are intentionally separate. `selected-short-review-brief` describes whatever the running app has selected. `studio-next-short-watch-listen-brief` describes the next local export package to review even when the UI has no current selection. Do not merge those concepts unless the app state and local review queue are deliberately unified.

`studio-next-short-review-evidence` is an orchestration layer, not a new analysis truth. It should call the existing cut-quality contact-sheet and audio-probe tools for the current ranked short, surface any existing machine transcript draft from `shorts-command-room/transcript-workorders/<short-id>/`, then report the artifact paths and safe next commands. If a future structure move changes where those lower-level tools live, keep `agentctl.sh` as the stable front door and update this source map before relying on the new path.

If a short exists in the local review ledger but not the cut-quality workbench, treat that as a stale-index problem, not proof the short is invalid. The fallback workbench is metadata glue for review evidence only. Longer term, the note, worksheet, and transcript-intake front doors should become ledger-aware too so agents do not need direct Python escape hatches.

Cut-quality worksheet notes distinguish `review-evidence` from `system-check`. Review evidence can fill worksheet fields because it should come from actual watch/listen review. System checks are useful measurement hints from probes or scripts; they should appear in the worksheet but must not count as human/agent review completion by themselves.

### Shorts handoff and decision-ledger compatibility

The next-short handoff must only surface a short with commands that can actually move through the active local review ledger. If the latest shorts batch contains carry-forward or warning rows that are not present in `studio-short-review-decision-ledger`, the handoff should fall back to the first pending ledger-backed short instead of generating invalid record commands.

Do not advertise a copy-paste command containing `keep|refine|hold|reject` as a runnable shell command. The pipe character is a shell operator. Use separate runnable commands for keep, refine, hold, reject, and needs-more-evidence, plus a plain-English template if needed.

As of 2026-07-03, `studio-short-review-decision-ledger` intentionally merges:

- native current-version shorts from `shorts-command-room`
- latest shorts-review-batch rows such as Episode 1 carry-forward shorts

The merge key is the stable short id, for example `episode-1-short-01`. This keeps Episode 1, Episode 2, Episode 3, Episode 5, and Episode 6 review intent in one local ledger while preserving `reviewSource` so agents can tell whether a row came from the command room or the batch.

The next-short handoff ranks pending ledger-backed shorts by practical review value, not by file discovery order. The current sort favors:

- playable local files with audio and video
- pending or ready local-review status
- 9:16 platform shape
- useful social-short duration, especially 15-60 seconds
- lower `reviewPriority` values from the shorts command room
- lower-warning items when the practical value is otherwise similar

This keeps Episode 1 carry-forward shorts reviewable while allowing stronger current-version shorts from Episodes 2, 3, 5, and 6 to surface first.

## 2026-07-03 - Shorts transcript ASR uses latest intake sidecars before stale workbenches

Purposeful path update: `apps/QuipslyStudio/script/studio_shorts_transcript_asr_draft.py` now treats the transcript-intake workbench as one map, not the only source of truth. When an explicit `--short-id` is missing from the old workbench, the command checks the latest local transcript-intake sidecar for that short, then falls back to review-ledger workorder metadata.

Why: `episode-2-short-04` existed in the local review ledger and had a valid extracted audio sidecar, but stale generated indexes still said the short did not exist. That made the agent-facing ASR path brittle and created false blockers.

Boundary: this fallback creates or consumes derivative transcript/audio sidecars only. It does not mutate source media, normalize transcript truth, approve shorts, publish, upload, schedule, mutate accounts, overwrite old versions, or create receipt truth.

Use this pattern when widening Studio agent tools: prefer one deliberate ledger/latest-sidecar seam over adding unrelated per-tool exceptions.

## 2026-07-03 - Agent-facing short triage command

New front door: `apps/QuipslyStudio/script/studio_short_review_triage.py`, exposed through `./script/agentctl.sh studio-short-review-triage`.

Purpose: encode the repeated short-review ritual as one agent-safe lane. It creates/refreshes evidence, checks readback, creates transcript-intake and local ASR draft evidence when transcript evidence is missing, then returns a recommendation. It records no local review decision unless `--record-decision` is passed.

Useful forms:

```bash
./script/agentctl.sh studio-short-review-triage --json
./script/agentctl.sh studio-short-review-triage --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-review-triage --short-id episode-5-short-04 --record-decision --reviewer Codex --json
```

Boundary: this command may create derivative contact/audio/transcript/caption evidence and may optionally write a local shorts review ledger decision. It must not mutate source media, externally publish/upload/schedule, mutate accounts, overwrite versions, delete files, create normalized transcript truth, or create receipt truth.

Why this matters: repeated manual recipes hide product friction. If a workflow is important enough for Codex to repeat, it should become an explicit, inspectable tool with a truth boundary.

## 2026-07-03 - Short refinement queue

New front door: `apps/QuipslyStudio/script/studio_short_refinement_queue.py`, exposed through `./script/agentctl.sh studio-short-refinement-queue`.

Purpose: convert local `refine` decisions into a ranked action queue for humans and agents. It reads the local shorts review ledger plus nearby evidence sidecars, then writes JSON/Markdown/HTML under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-refinement-queue/`.

Useful forms:

```bash
./script/agentctl.sh studio-short-refinement-queue --limit 12 --all
./script/agentctl.sh studio-short-refinement-queue --json
```

Current proof: the queue built successfully with 9 refine items. Top action clusters are pacing, transcript, captions, framing, audio, and endings. This points directly at the next production feature work: refine from promising v001 to better v002 exports instead of only reviewing first-pass shorts.

Boundary: refinement queue artifacts are local review/work-planning evidence only. They do not mutate source media, overwrite exports, upload, publish, schedule, approve, delete, mutate accounts, create normalized transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 refinement workorder

New front door: `apps/QuipslyStudio/script/studio_short_refinement_workorder.py`, exposed through `./script/agentctl.sh studio-short-refinement-workorder`.

Purpose: turn the top `refine` queue item into a source-safe v002 workorder with transcript anchors, target duration, edit recipe, next actions, and verification checklist. This is still planning/evidence, not export.

Useful forms:

```bash
./script/agentctl.sh studio-short-refinement-workorder --all
./script/agentctl.sh studio-short-refinement-workorder --short-id episode-5-short-02 --all
```

Current proof: regenerated the workorder for `episode-5-short-02` and the tool now flags a weak hook candidate instead of pretending ASR/context setup is publishable. Weak hooks should trigger source search/listen review, not automatic v002 export.

Boundary: workorders do not create exports, mutate source media, overwrite versions, publish, upload, schedule, approve, delete, mutate accounts, create normalized transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 candidate export proof

New front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_export.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-export`.

Purpose: render a new source-safe v002 candidate from a refinement workorder. This first proof trims an existing v001 derivative short using transcript timing, writes a new v002 candidate, and saves recipe/probe/audio-sanity evidence beside it.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-export --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-export --short-id episode-5-short-02 --json
```

Behavior proof:
- `episode-5-short-02` blocks by default because its hook candidate is weak.
- `episode-5-short-04` exported a new 18.2s 9:16 v002 candidate from the stronger accountability hook, with audio/video probe and audio sanity pass embedded in the manifest.

Current candidate:
`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T092653Z-episode-5-short-04-v002-candidate-episode-5-test-04-practical-insight.mp4`

Boundary: this is a derivative-v002 proof from an existing short export, not the canonical whole-synced-source edit path. It does not mutate originals, overwrite v001, publish, upload, schedule, approve, delete, mutate accounts, create normalized transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 candidate index

New front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_index.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-index`.

Purpose: make local v002 candidate exports discoverable and reviewable. It scans `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_*/v002/short-refinement-candidates/`, reads candidate manifests, and writes JSON/Markdown/HTML under `/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-index/`.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-index --all
./script/agentctl.sh studio-short-v002-candidate-index --json
./script/agentctl.sh studio-short-v002-candidate-index --all-candidates --all
```

Current proof: the index reports 2 current candidates: `episode-5-short-04` is an exported 18.2s v002 candidate with audio sanity pass and needs listen/watch review; `episode-5-short-02` is blocked weak-hook and should not be exported until a stronger phrase is found.

Boundary: candidate index artifacts are local review evidence only. They do not render media, approve, publish, upload, schedule, mutate originals, overwrite versions, delete files, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Short v002 candidate review ledger

New front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_review.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-review-ledger`, `studio-short-v002-candidate-review-dry-run`, and `studio-short-v002-candidate-review`.

Purpose: keep local v002 candidate existence separate from editorial review state. The v002 candidate index says what exists and what objective preflight found. The v002 candidate review ledger says what Codex, Charlie, Mako, or another reviewer decided after watch/listen review.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
./script/agentctl.sh studio-short-v002-candidate-review-dry-run episode-5-short-04 needs-listen Codex 'Objective preflight passed; needs human watch/listen before keep.'
./script/agentctl.sh studio-short-v002-candidate-review episode-5-short-04 needs-listen Codex 'Objective preflight passed; needs human watch/listen before keep.'
```

Current proof: `episode-5-short-04` has an exported 18.2s v002 candidate with audio sanity pass and a local `needs-listen` review event. `episode-5-short-02` remains blocked before review because the candidate index flagged a weak hook and no MP4 output exists.

Boundary: candidate review ledger artifacts are local review state only. They do not render media, approve externally, upload, publish, schedule, mutate originals, overwrite versions, delete files, normalize transcript truth, mutate accounts, or create receipt truth.

Process note: source maps are maps, not chains. Follow current live paths intentionally, and change paths or architecture when warranted, but document the reason and truth boundary instead of following stale paths or rabbit holes.

## 2026-07-03 - V002 candidate evidence and polish loop

New front doors:

- `apps/QuipslyStudio/script/studio_short_v002_candidate_evidence.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-evidence`
- `apps/QuipslyStudio/script/studio_short_v002_candidate_polish.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-polish`

Purpose: move from a vague `needs-listen` state toward concrete review and refinement evidence. The evidence command creates a contact sheet, media probe, audio/silence diagnostics, and next-action recommendation. The polish command can create a new non-overwriting v002b candidate from that evidence when a clear mechanical defect is found, such as trailing dead air.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-polish --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-index --all --json
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
```

Current proof: `episode-5-short-04` v002 evidence found a likely trailing dead-air section. The first v002b heuristic was too aggressive and produced a 5.7s candidate; it was preserved as a bad version rather than overwritten. The heuristic was corrected to prefer trailing-half silence, producing a newer 12.77s v002b candidate. The refreshed index now points at that v002b and reports `probe-pass` instead of a false audio warning.

Current candidate:

`/Volumes/My Passport/Episode_and_Shorts_Test/Episode_05/v002/short-refinement-candidates/episode-5-short-04/20260703T100050Z-episode-5-short-04-v002b-candidate-silence-tail-trim.mp4`

Boundary: this is still derivative short refinement proof, not canonical whole-synced-source editing. Evidence and polish tools do not mutate originals, overwrite previous versions, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.

Learning: ranking automatic trims by maximum time saved is dangerous. For short refinement, prefer trims that remove trailing dead air while preserving the core thought. Keep bad heuristic outputs as evidence, then supersede them with a newer candidate instead of pretending they never happened.

## 2026-07-03 - V002b lineage and transcript-aware evidence

Updated front doors:

- `apps/QuipslyStudio/script/studio_short_v002_candidate_index.py`
- `apps/QuipslyStudio/script/studio_short_v002_candidate_polish.py`
- `apps/QuipslyStudio/script/studio_short_v002_candidate_evidence.py`

Purpose: refined candidates must remain understandable. A v002b candidate now carries or recovers the hook clue, source candidate path, source evidence path, source review status, and source target version. Evidence packets also surface available machine ASR/caption sidecars as review clues.

Current proof:

```bash
./script/agentctl.sh studio-short-v002-candidate-index --all --json
./script/agentctl.sh studio-short-v002-candidate-review-ledger --json
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
```

Readback now shows `episode-5-short-04` v002b with:

- Hook clue restored: `Scott, I'd like to put you on the spot...`
- Source candidate path restored to the prior v002 candidate
- Source evidence path restored to the v002 evidence packet
- Review state still `needs-listen`
- Audio/video probe status `probe-pass`
- Transcript preview from the local ASR draft, clearly marked as machine draft requiring listen-check

Boundary: transcript evidence is a clue, not normalized transcript truth. Low hook/transcript overlap should warn reviewers to verify candidate lineage. This does not mutate source media, overwrite exports, upload, publish, schedule, approve externally, delete files, mutate accounts, or create receipt truth.

## 2026-07-03 - V002 candidate review theater

New front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-review-theater`.

Purpose: turn candidate evidence into a calm reviewer surface. The theater embeds the local candidate MP4, contact sheet, hook clue, machine transcript preview, warnings, next safest action, and copyable review commands. It does not record the review itself.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
./script/agentctl.sh studio-short-v002-candidate-review-theater --reviewer Mako --html
```

Current proof: generated a review theater for `episode-5-short-04` v002b:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T102355Z-short-v002-candidate-review-theater.html`

The generated HTML contains an embedded local video tag, contact sheet image, transcript preview, truth boundary, and copyable `keep`, `refine-again`, `reject`, and `hold` commands.

Boundary: the theater is a review surface, not a decision writer. It does not approve, record decisions, mutate media, overwrite versions, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Exact-candidate ASR boundary fix

Updated front doors:

- `apps/QuipslyStudio/script/local_transcript_provider.py`
- `apps/QuipslyStudio/script/studio_short_v002_candidate_transcript.py`
- `apps/QuipslyStudio/script/studio_short_v002_candidate_evidence.py`

Purpose: exact-candidate ASR must not mistake media manifests for transcripts. The local transcript provider now accepts only transcript-shaped JSON sidecars, normalizes SRT/VTT sidecars to Quipsly JSON, and lets the candidate transcript wrapper fail loudly when a provider returns JSON without usable transcript text. Evidence packets now label existing empty candidate transcript sidecars as failed evidence instead of treating them as review-ready transcript clues.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-transcript --short-id episode-5-short-04 --provider auto --model base --json
./script/agentctl.sh studio-short-v002-candidate-evidence --short-id episode-5-short-04 --json
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Current proof: regenerated exact-candidate ASR for `episode-5-short-04` v002b after the sidecar filter fix. The transcript preview now starts with the expected hook: `I'd like to put you on the spot a little bit here...`. Regenerated evidence now reports transcript source `candidate-specific-asr`, transcript status `candidate-machine-draft-needs-review`, no automated warnings, and recommendation `needs-listen`.

Current exact transcript:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-transcripts/episode-5-short-04/20260703T111318Z-episode-5-short-04-candidate-transcript.json`

Current evidence:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-evidence/episode-5-short-04/20260703T111406Z-episode-5-short-04-v002-candidate-evidence.json`

Current review theater:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T111405Z-short-v002-candidate-review-theater.html`

Boundary: candidate-specific ASR is still machine draft review evidence, not caption truth, keep approval, upload permission, publication receipt, or normalized transcript truth. Do not record `keep` unless a human or verified reviewer actually watches/listens.

## 2026-07-03 - Review theater agent readback schema

Updated front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py`.

Purpose: the review theater is for humans and agents. Its JSON now includes stable top-level `reviewer`, `selectedShortId`, `selectedCandidate`, and `agentReadback` fields so automation can see the current candidate, transcript status, recommendation, warning count, and review commands without guessing from nested page data.

Useful form:

```bash
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Current proof: regenerated the Episode 5 short-04 theater at:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T112816Z-short-v002-candidate-review-theater.html`

Validated readback:

- `agentReadback.shortId`: `episode-5-short-04`
- `agentReadback.transcriptStatus`: `candidate-machine-draft-needs-review`
- `agentReadback.warningCount`: `0`
- `agentReadback.recommendation`: watch/listen before `keep` or `refine-again`

Boundary: the agent readback is navigation and review assistance only. It does not record a decision, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, approve externally, mutate accounts, or create receipt truth.

## 2026-07-03 - V002 candidate index review-state join

Updated front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_index.py`.

Purpose: the candidate index now joins candidate manifests with the local review ledger so manifest/render state and review state stay separate. Rows include `status`, `candidateStatus`, `reviewStatus`, `reviewer`, `reviewedAt`, and `reviewNotes` instead of making agents infer review truth from export state.

Useful form:

```bash
./script/agentctl.sh studio-short-v002-candidate-index --all --json
```

Current proof for `episode-5-short-04`:

- `status`: `v002-candidate-exported`
- `candidateStatus`: `v002-candidate-exported`
- `reviewStatus`: `needs-listen`
- `targetVersion`: `v002b`
- `audioSanityStatus`: `probe-pass`
- `outputExists`: `true`
- `nextSafestAction`: listen/watch with sound before any keep or publish decision

Boundary: index review-state join is readback only. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Short v002 review queue

New front door: `apps/QuipslyStudio/script/studio_short_v002_review_queue.py`, exposed through `./script/agentctl.sh studio-short-v002-review-queue`.

Purpose: answer "what should be reviewed next?" without making reviewers or agents infer priority from scattered artifacts. The queue reads candidate manifests, the local v002 review ledger, and evidence sidecars, then writes a versioned review queue under the release review board.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-review-queue --reviewer Codex --json
./script/agentctl.sh studio-short-v002-review-queue --reviewer Mako --html
./script/agentctl.sh studio-short-v002-review-queue --reviewer Codex --limit 5 --all
```

Current proof:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-review-queue/20260703T121139Z-short-v002-review-queue.json`

Readback:

- items: `2`
- watch/listen next: `1`
- blocked: `1`
- next short: `episode-5-short-04`
- readiness: `watch-listen-next`
- transcript status: `candidate-machine-draft-needs-review`
- next action: watch/listen with sound, then record `keep` or `refine-again`

Behavior note: blocked/missing-output candidates remain visible but do not outrank actionable watch/listen items. This encodes the "do not stall; keep progressing elsewhere" fallback rule.

Boundary: the queue is readback and routing only. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Short v002 quality brief

New front door: `apps/QuipslyStudio/script/studio_short_v002_quality_brief.py`, exposed through `./script/agentctl.sh studio-short-v002-quality-brief`.

Purpose: explain a candidate short's review tradeoffs before a human or agent records a local decision. The brief reads the review queue, evidence packet, exact-candidate transcript clue, and audio diagnostics, then summarizes hook quality, vertical/platform fit, cadence/silence signals, risks, blockers, and explicit review commands.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-quality-brief --reviewer Codex --json
./script/agentctl.sh studio-short-v002-quality-brief --short-id episode-5-short-04 --reviewer Mako --html
```

Current proof:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T122046Z-episode-5-short-04-quality-brief.json`

Readback for `episode-5-short-04`:

- readiness: `watch-listen-next`
- review state: `needs-listen`
- review bias: `listen-for-keep`
- hook label: `strong-human-hook`
- duration: `12.8s`
- risk count: `0`
- blocker count: `0`
- next action: watch/listen with sound; if hook and ending land, record `keep`

Boundary: the quality brief is an evidence-backed review aid only. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Quality brief edit-decision explanation

Updated front door: `apps/QuipslyStudio/script/studio_short_v002_quality_brief.py`.

Purpose: the quality brief now explains candidate edit intent and tradeoffs from sidecar metadata. For v002b candidates, it can describe the operation, source candidate, what was preserved, what was removed, why it was removed, and what a reviewer should check before recording `keep` or `refine-again`.

Useful form:

```bash
./script/agentctl.sh studio-short-v002-quality-brief --short-id episode-5-short-04 --reviewer Codex --json
```

Current proof:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T122713Z-episode-5-short-04-quality-brief.json`

Readback for `episode-5-short-04`:

- edit operation: `trailing-silence-trim`
- removed: about `5.4s`
- preserved: beginning through about `12.7s`
- tradeoff: derivative v002b proof, not canonical whole-source edit path
- review checks: ensure ending feels complete, no meaningful pause/reaction was clipped, compare source candidate if abrupt

Boundary: edit-decision explanation is inferred from local manifests/evidence and helps review. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - V002 source-vs-polished candidate comparison

New front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_compare.py`, exposed through `./script/agentctl.sh studio-short-v002-candidate-compare`.

Purpose: compare a polished v002b candidate against its source v002 candidate using local ASR evidence. This answers whether a trim removed likely dead air or cut off words/reaction. Quality briefs now cite the latest comparison when one exists.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-candidate-compare --short-id episode-5-short-04 --provider auto --model base --json
./script/agentctl.sh studio-short-v002-quality-brief --short-id episode-5-short-04 --reviewer Codex --json
```

Current comparison:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-comparisons/episode-5-short-04/20260703T125230Z-episode-5-short-04-candidate-comparison.json`

Current updated brief:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-quality-briefs/20260703T125304Z-episode-5-short-04-quality-brief.json`

Readback for `episode-5-short-04`:

- comparison bias: `tail-likely-safe`
- removed-tail word count: `0`
- next action: tail comparison found no obvious removed speech; still listen once before keep

Boundary: comparison uses machine ASR as review evidence only. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth.

## 2026-07-03 - Review theater comparison panel

Updated front door: `apps/QuipslyStudio/script/studio_short_v002_candidate_review_theater.py`.

Purpose: the review theater now pulls in latest source-vs-polished comparison evidence when available. The HTML page shows current candidate, source candidate, contact sheet, transcript clue, source comparison summary, removed-tail word count, warnings, and review commands in one place.

Useful form:

```bash
./script/agentctl.sh studio-short-v002-candidate-review-theater --short-id episode-5-short-04 --reviewer Codex --json
```

Current proof:

`/Volumes/My Passport/Episode_and_Shorts_Test/review-board/short-v002-candidate-review-theater/20260703T125910Z-short-v002-candidate-review-theater.html`

Readback for `episode-5-short-04`:

- comparison status: `candidate-comparison-ready`
- comparison bias: `tail-likely-safe`
- removed-tail word count: `0`
- source candidate visible in theater: `20260703T092653Z-episode-5-short-04-v002-candidate-episode-5-test-04-practical-insight.mp4`

Boundary: the theater still does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, normalize transcript truth, mutate accounts, or create receipt truth. It only makes comparison review easier.

## 2026-07-03 - V002 decision rehearsal front door

New front door: `apps/QuipslyStudio/script/studio_short_v002_decision_rehearsal.py`, exposed through `./script/agentctl.sh studio-short-v002-decision-rehearsal`.

Purpose: show what `keep`, `refine-again`, `hold`, and `reject` would mean before anyone writes to the local v002 candidate review ledger. This is a speed tool, not bureaucracy: it makes consequences visible so humans and agents can make the next reversible choice with less anxiety.

Useful forms:

```bash
./script/agentctl.sh studio-short-v002-decision-rehearsal --short-id episode-5-short-04 --reviewer Codex --all
./script/agentctl.sh studio-short-v002-decision-rehearsal --json
```

Boundary: decision rehearsal artifacts are dry-run review aids only. They do not record decisions, mutate source media, overwrite exports, upload, publish, schedule, approve, delete, mutate accounts, create normalized transcript truth, or create receipt truth.

## 2026-07-03 - Short v002 candidate review truth

`apps/QuipslyStudio/script/studio_short_v002_candidate_export.py` is the source for rendering derivative v002 short candidates. Explicit hook-rescue exports may clear current weak-hook warnings only when the new candidate has explicit start/end plus hook override; the old warning must remain inspectable in `qualityWarningHistory`.

Current review chain for v002 shorts:

1. `studio-short-v002-candidate-export`
2. `studio-short-v002-candidate-index`
3. `studio-short-v002-candidate-review-ledger`
4. `studio-short-v002-candidate-transcript`
5. `studio-short-v002-candidate-evidence`
6. `studio-short-v002-review-queue`
7. `studio-short-v002-decision-rehearsal`

If the queue and evidence disagree, refresh the index and review ledger before regenerating transcript/evidence. The queue should describe the current artifact, not stale warnings from an older candidate for the same short id.

### Short-specific review artifact routing

`studio-short-v002-decision-rehearsal --short-id <id>` must honor the requested short even when global `latest-*` pointers belong to a different candidate. The rehearsal script now resolves the latest short-specific quality brief and extracts the matching row from an all-candidates review theater payload. This prevents false `needs-fresh-evidence` states caused by global pointer drift.

## 2026-07-03 - QuipslyStudio v002 short review refresh

Active command: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh studio-short-v002-review-refresh`.

Purpose: Refresh v002 short review truth in one intentional path instead of making agents remember fragile script order. The command rebuilds candidate index, ledger, transcript/evidence, quality brief, review theater, queue, and decision rehearsal readbacks.

Important boundary: source maps and runbooks are living contracts, not railroad tracks. Change them when architecture changes on purpose, but do not follow stale paths or hidden scripts by accident.

Proof from 2026-07-03 run: `short-v002-review-refresh-ready`, two queue items, zero failed steps, no source media mutation, no old export overwrite, no external publishing, and no receipt truth created.
