# Quipsly Native Editor Full Redesign Pass

Last updated: 2026-06-18

## Product target

The editor should feel like a warm professional studio clearing: calm enough for long editing sessions, precise enough for real delivery work, and legible enough that Codex can operate it through the same semantic model a human uses.

The goal is not to imitate Premiere, Final Cut, Descript, Riverside, or CapCut. The goal is to keep Quipsly's core invention visible:

- Sources are whole synced lanes.
- Edits are SHOW/SKIP decisions layered over those lanes.
- Shorts are recipes pulled from the episode spine.
- Publishing is build, ship, and prove; those are separate truths.
- Agents and humans share the same controls and state.

## Current redesign language

Use these public labels unless the model changes:

- Source Grove: every synced source stays awake and visible.
- Episode Trail Map: the shared time spine where SHOW/SKIP decisions live.
- Workbench: the left tool shelf for frame, shorts, script, and ship work.
- Program Output: the edit truth shown to the audience.
- Play Edit [Space]: skips gaps and follows SHOW/SKIP output truth.
- Play Through [T]: follows full source time for review.
- SHOW decision: this source may appear in Play Edit.
- SKIP decision: Play Edit jumps over this range.
- Short recipe: one or more ordered pull-outs from the full episode spine.
- Receipt: proof that a platform action happened.

Avoid these words when they imply the wrong architecture:

- clip, when talking about whole synced sources or edit metadata.
- cut, when source media remains intact.
- done, when only a local render exists and no platform receipt exists.
- Source Grove, unless referring to legacy accessibility identifiers.

## Visual direction

The visual target is nature-y, zen, warm, and fun without becoming toy-like.

- Background: deep forest, spruce shadow, moss, river stone, moon milk glow.
- Action colors: honey for SHOW/output, clay for SKIP/gaps, creek for source motion/sync, moss for ready/proved.
- Shapes: rounded continuous cards, soft shelves, low-contrast topographic overlays.
- Density rule: overview mode should show coverage and truth; precision mode should reveal dense handles and labels.
- Typography rule: buttons stay short; explanations move to selected detail, help text, or agent state.

## Layout hierarchy

1. Program Output is the campfire. It should be visually dominant.
2. Source Grove stays visible nearby so source comparison is easy.
3. Transport sits between watching and editing, not as a random toolbar.
4. Episode Trail Map owns the lower working area and must be scrub/zoom first.
5. Workbench is a tool shelf, not a second app.
6. Ship/Release cockpit is downstream of editing truth, not a separate production console.

## UX must-haves still ahead

- The timeline must scrub the Program Output and Source Grove together from every input path.
- Pinch zoom must make fine edit choices possible without visual chaos.
- Selected decision detail must answer what is selected, what it affects, and the safest next action.
- Shorts UI must show whether a recipe has one segment or many ordered segments.
- Source Grove cards need calm recovery states for missing/protected/proxy-needed media.
- Publishing surfaces need clear handoff/proof states without pretending Quipsly published something it did not.

## Agent accessibility doctrine

Every human-visible action that changes or prepares production state should have one of these:

- a stable accessibility identifier,
- an agent command endpoint,
- or a structured payload in the app state.

Agents should not screen-scrape the editor unless semantic state is unavailable. If the human UI gets calmer, the semantic state must stay exact.

## Current known risk

This redesign pass has not been build-validated yet. Before treating it as stable, launch the real app and inspect:

- Swift compile health after broad copy/style replacements,
- whether shortcut labels became too long or duplicated,
- left workbench width and clipping,
- Source Grove card readability,
- Episode Trail Map contrast and selected-decision visibility,
- whether all accessibility identifiers survived human-facing vocabulary changes.
