# Quipsly Native Editor Redesign Principles

Status: working doctrine, not frozen dogma.

This document records the current design direction for the native Quipsly editor so future agents do not drift back into a generic NLE, a debug dashboard, or a chopped-clip workflow.

## Core product truth

Quipsly edits whole synced source lanes with reversible metadata on top.

- Source lanes stay whole.
- SHOW decisions tell Play Edit what appears.
- SKIP decisions tell Play Edit what to jump over.
- Play Through shows the continuous synced source-time truth.
- Proxies power preview and editing.
- Originals are protected unless the user explicitly grants access.

The UI must keep this truth visible without making the editor feel scary.

## Visual language

The current design direction is warm, nature-driven, and professional.

- Honey means output, SHOW, Play Edit [Space], and visible program truth.
- Clay means skipped gaps, recovery, and attention.
- Creek means shared playhead, navigation, sync, and source-time truth.
- Moss means ready, proxy-safe, and publish progress.
- Sage and lichen are quiet support colors.
- Forest, soil, bark, and night form the studio surfaces.
- The center monitor area should feel like a clearing: calm, readable, and visually dominant.
- The timeline should feel like a map of the episode spine, not a pile of chopped clips.
- The left workbench should feel like a tool shelf: compact, stable, and secondary to the edit.
- The right Source Grove should feel like synced evidence cards: always visible, useful, and never alarmist unless media is genuinely blocked.

Do not add random blue/red/yellow UI accents unless they map back to this vocabulary.

## Main surfaces

Program Output is the hero.

It shows what the edit currently outputs. In Play Edit [Space], no-SHOW gaps should be blank or intentionally slated, not silently showing a random source.

Source Grove is the always-awake camera shelf.

It shows every synced source at the shared playhead. It exists so editors can choose between cameras without hiding tracks or cutting media.

Episode Trail Map is the timeline.

It is a truth map, not a pile of clips. It must make active vs inactive vs skipped state easy to understand while preserving whole-source lanes.

At low zoom, dense decision imports should become soft readable overlays and coverage rails. Do not render hundreds of shouty individual blocks unless the editor has zoomed in far enough to act on them.

Workbench is the left tool shelf.

It holds tuning, shorts, transcript, and publishing. It should be helpful but should not visually overpower Program Output or the timeline.

Workbench navigation should avoid cramped tab strips. Prefer compact labeled tool buttons that fit Frame, Shorts, Script, and Ship without truncation.

The current visual metaphor is a warm studio clearing:

- Program Output is the campfire: the main place attention gathers.
- Source Grove is the grove: every synced source stays visible without demanding panic.
- Episode Trail Map is the trail map: zoom from whole-episode terrain down to editable decision edges.
- Tool Shelf is the left-hand set of calm instruments, one job at a time.
- Release Map is the packing list: build artifacts, pull shorts recipes, prepare podcast audio, and prove publication with receipts.
- Dense imported decisions should read like a calm topographic overlay at low zoom, not like a pile of individual widgets. At overview scale, prefer soft SHOW/SKIP coverage and rails; reveal precise handles only after the editor zooms in.

This metaphor is a guide, not a law. Use it when it makes the editor calmer and more obvious; discard any flourish that gets between the editor and the work.

Shorts are recipe packets, not chopped mini-projects.

The Shorts workbench should make it obvious that a short can contain one or many ordered SHOW moments from the full episode spine. The short recipe points back to episode time, carries caption/hook/overlay/platform metadata, and exports a derivative 9:16 artifact without cutting source media or mutating the long episode edit.

When designing Shorts surfaces:

- Use "recipe" when describing the metadata pull-out.
- Use "platform packet" for YouTube Shorts, Instagram, Facebook, LinkedIn, and future social handoff data.
- Keep review states separate from export states.
- Keep export states separate from publishing receipt states.
- Show multi-segment recipes as ordered pull-outs over the timeline, not as disconnected clips.

Transcript is the word spine.

Transcript surfaces should feel connected to the same shared playhead. Captions, short hooks, pull quotes, and AI suggestions should flow from timestamped transcript segments when possible, but generated text remains editable metadata until the human approves it.

Transport teaches the model.

The controls should make Play Edit vs Play Through obvious and keep shortcuts visible.

Transport should also show that Codex is using the same semantic state as the human editor. Do not imply that Codex has a separate hidden edit path.

Production dock labels should stay compact.

- Media: import sources, sync, storage, proxy readiness.
- Navigate: monitors, timeline, agent contract, folder matching, details.
- Outputs: build episode/short/audio artifacts, open publishing, capture receipts.
- Proof: receipts are the visible evidence that an output was uploaded, scheduled, or published.

Avoid expanding the dock into long explanatory prose. Put explanations in help text, selected-detail panels, or docs.

## Publish confidence

Do not treat rendering as publishing.

The UI should keep these states separate:

- Build: generate 16:9 episode, 9:16 shorts, and podcast audio artifacts.
- Ship: move or prepare those artifacts for YouTube, Patreon, social platforms, Spotify, or Apple Podcasts.
- Prove: capture receipts, URLs, provider IDs, schedule states, or other platform evidence.

If a surface says an output is published, it should have receipt evidence or plainly say it still needs proof.

Publication surfaces should feel like a calm release cockpit, not a deployment console.

Every publishing panel should answer four questions in plain language:

- What artifact exists?
- What platform is it for?
- What still needs human/operator/API action?
- What receipt proves that action happened?

Use moss for ready/proved, honey for prepared-but-not-proved, creek for handoff/movement/scheduling, and clay for missing/API-attention. Avoid generic green/orange/red status piles because they collapse different production truths into anxiety colors.

The full release path should stay visible:

- 16:9 episode master for YouTube and Patreon.
- 9:16 short recipes and social posting packets for YouTube Shorts, Instagram, Facebook, and LinkedIn.
- Podcast audio packet for Spotify and Apple Podcasts through the chosen host/RSS workflow.
- Receipt capture for every platform where Quipsly claims something was uploaded, scheduled, or published.

The release UI should always answer "what is the next safest action?" in this order: build the 16:9 episode master, pull or review 9:16 short recipes, prepare podcast audio, then prove platform receipts.

The next action surface should offer two obvious escapes: open the Ship workbench when the next action is about outputs or receipts, and focus the Episode Trail Map when the next action requires inspecting or fixing SHOW/SKIP source decisions. This keeps publishing connected to editing instead of becoming a detached export console.

Show the release truth ladder anywhere publishing confidence is summarized:

- Edit: SHOW/SKIP source decisions create output truth.
- Build: Quipsly renders a local artifact or packet.
- Upload: the artifact is handed to YouTube, Patreon, social, podcast host, or another platform.
- Schedule: platform-side timing is set when applicable.
- Prove: receipt, URL, provider ID, or schedule proof is captured.

Never compress these into one "done" state. A file on disk is not a published episode; a queued upload is not a captured receipt.

The Ship workbench should start with a release cockpit before showing detailed machinery:

- 16:9 episode master: YouTube and Patreon targets.
- 9:16 short recipes: YouTube Shorts, Instagram, Facebook, and LinkedIn targets.
- Podcast audio: Spotify and Apple Podcasts targets.
- Publication proof: receipt URLs, provider IDs, scheduled links, and receipt JSON.

Each cockpit card should answer: how many targets exist, how many receipts are captured, what status the family is in, and what the safest next action is. Detailed packet buttons and logs belong below that orientation layer.

Below the cockpit, show a platform proof checklist. It should use rows because rows become automation later:

- Platform: YouTube, Patreon, Instagram, Facebook, LinkedIn, Spotify, Apple Podcasts, or another destination.
- Family: episode, short, podcast, or platform publication.
- Status: needs artifact, needs copy, ready to post, or proved.
- Proof needed: the concrete URL, provider id, schedule proof, or receipt required.
- Next action: the safest human/agent action.

This checklist should keep the user oriented during manual posting and should give Codex a precise path for publication assistance without pretending it performed platform actions it did not perform.

Put safe actions next to the checklist:

- Copy JSON: copies the structured release cockpit state for Codex, automation, or another publishing helper.
- Copy checklist: gathers a portable status handoff for every platform target.
- Copy missing proof: gathers missing receipts and exact capture commands.
- Refresh ledger: rebuilds platform records from current artifacts.

These actions are safe because none of them uploads, schedules, publishes, or claims proof. They prepare the operator to do the next real action.

Use both handoff forms intentionally: Markdown is for humans and coordination threads; JSON is for Codex, scripts, future publish agents, and audit logs. Both should come from the same `shipCockpit` payload.

Visible checklist buttons should have matching semantic endpoints whenever practical. Codex should be able to call the same safe handoff actions without screen scraping:

- `GET /publication_copy_release_cockpit_json`
- `GET /publication_copy_platform_proof_checklist`
- `GET /publication_copy_missing_receipts`

If a human-visible action prepares state for publication without mutating platform proof, add the agent endpoint in the same patch.

## UX priority

If a change makes the editor feel more powerful but harder to understand, slow down and redesign the interaction.

If a change makes the editor prettier but hides source/proxy/timeline truth, reject it.

If a change makes the editor calmer and keeps the truth visible, it is probably aligned.

## Selected-decision UX

When a SHOW or SKIP decision is selected, the UI should immediately answer:

- What is selected?
- Which source lane does it belong to?
- What output behavior does it affect?
- What safe actions are available next?

Selected-decision controls should use the word "decision" rather than "clip" or "segment" when there is any risk of implying source media has been cut.

## Current copy vocabulary

Use these labels consistently unless the model changes:

- Play Edit [Space]: skips gaps and shows the current output truth.
- Play Through [T]: follows full source time.
- Source Grove: all synced sources stay awake.
- Episode Trail Map: the shared timeline truth map.
- Workbench / Tool Shelf: the left shelf for frame tuning, shorts, transcript, and publishing.
- Frame: crop, zoom, and keyframe source/output metadata.
- Shorts: choose 9:16 pull-outs from the episode spine.
- Script: transcript/caption/quote navigation.
- Ship: outputs, uploads, receipts, and handoff packets.
- Codex path: same controls, semantic state, prove after action.
- Ready: proxy/source can scrub now.
- Needs proxy: source is remembered but not ready for safe preview.
- Receipts: prove where the output went after upload or schedule.

## Agent accessibility

Human accessibility and Codex accessibility are the same product goal.

Every major surface should expose stable accessibility identifiers and semantic state so agents can edit through the same model humans use:

- observe shared playhead state,
- select source lanes,
- select SHOW/SKIP decisions,
- nudge or trim decisions,
- switch output format,
- prepare publish packets,
- re-observe and prove the result.

Agents should not infer editor truth from pixels when semantic state exists.

## Current redesign guardrails

- Program Output remains the hero at the top of the editor.
- Session mission belongs near the monitor, not as a heavy banner interrupting the timeline.
- Timeline controls should support zoom, scrubbing, and selected-decision work without visually overwhelming whole-lane truth.
- Source Grove cards should distinguish ready, proxy-needed, protected, and missing states without making every non-ready item look catastrophic.
- Copy should prefer "decision", "source", "spine", "output", and "receipt" over generic NLE words when those generic words imply source media was cut.
- Shorts copy should prefer "recipe" over "clip" when talking about the editable pull-out metadata.
- Color vocabulary should stay Quipsly-native: moss ready, honey SHOW/output, clay SKIP/attention, creek shared-time/source truth. Avoid raw blue/green/yellow/red unless intentionally mapped into the theme.

## Full clearing redesign pass - 2026-06-18

The current visual direction is a warm professional studio clearing: organic, focused, and built for long edit sessions.

Design commitments:

- Program Output remains the campfire: the first thing the eye finds and the thing the rest of the workspace serves.
- Source Grove replaces the mental model of a clip rack. Whole source lanes stay alive, synced, and visible; the edit chooses what appears without cutting source media.
- Episode Trail Map replaces dense timeline-as-dashboard language. The map can be information rich, but the default view should feel topographic: creek source lanes, honey SHOW ranges, clay skipped gaps, and quieter overlays until precision editing is needed.
- The left Workbench should feel like a shelf of tools, not a cramped tab strip. Buttons get short labels; explanations live in helper text, selected detail, tooltips, or agent state.
- Publishing remains a Release/Ship cockpit, but should feel like an operator checklist rather than a cloud console.

Implementation notes:

- Keep visual names human-friendly while preserving stable accessibility identifiers such as `quipsly.sourceWall` when changing the public label from Source Wall to Source Grove.
- Do not hide semantic state for calmness. Calm UI means better hierarchy, not less truth.
- Avoid generic neon/status piles. Prefer moss, honey, creek, and clay with plain-language explanations.
- If a dense view becomes unreadable, add zoom-dependent detail and selected-detail panels before adding more labels directly onto the canvas.
