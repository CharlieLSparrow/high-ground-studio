# Studio Manuscript Desk Improvement Roadmap

Date: 2026-05-26

Companion research: `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`

## North Star

Studio `/manuscript` should become the private source-aware writing and
production desk for the book: a place to write, mark sources, structure the
manuscript, review citations, produce episode/script/public-preview packets,
and give Codex or human collaborators precise work orders.

The product should remain manuscript-first. The long manuscript is the home
surface. Maps, cards, comments, review queues, timelines, and exports are
projections around it.

## Product Stance

Studio is not trying to out-Scrivener Scrivener or out-Docs Google Docs. Its
edge is source-preserving metadata:

- every meaningful block can have an ID
- author/source markings remain separate from semantic meaning
- quotes and citations can become reviewable objects
- chapter/episode/section structure can overlap with semantic spans
- publish outputs can be generated as staged projections
- agents can work from exact block and span anchors

The roadmap below should keep those separations even when the UI becomes more
polished.

## Big Swings

### 1. Mobile Writing Cockpit

Goal: make phone-width Studio useful for actual writing and semantic marking,
not only reading or emergency review.

Build toward:

- thumb-safe bottom action bar for author, semantic tag, quote, structure, and
  snapshot actions
- selection-aware popover for "mark as Charlie", "mark as Homer / Scott",
  "semantic tag", "quote", and "comment"
- collapsible semantic palette with saved favorite tags
- explicit local/server snapshot freshness indicator
- session counter for words written, marks added, quotes reviewed, and time in
  draft
- optional typewriter/focus paragraph mode
- mobile-safe long-word wrapping, keyboard avoidance, and bottom safe-area
  spacing

First next slice:

- add a compact mobile "session strip" above the bottom tools showing local
  saved time, selected semantic lens, and session words
- preserve current browser-local draft envelope and manual snapshot behavior

### 2. Manuscript Map: Binder, Corkboard, Outliner

Goal: let the user move between whole text, structural map, and card-level
planning without creating another source of truth.

Build toward:

- Binder view: chapters, episodes, sections, orphaned blocks, unresolved ranges
- Corkboard view: cards generated from structure regions, titles, notes,
  pull quotes, and summary snippets
- Outliner view: sortable rows with range, word count, quote count, semantic
  density, review status, and notes
- "open in manuscript" and "set current range" actions from every map view
- read-only story/quote snippets until range-editing rules are proven

First next slice:

- extend the new chapter-title map toward a fuller read-only Manuscript Map
  generated from title markers, existing structure regions, and block summaries
- no drag reorder until range integrity and rollback behavior are specified

### 3. Semantic Lens And Review Engine

Goal: make highlighting actionable. A semantic mark should drive focus,
review, export readiness, and agent tasks.

Build toward:

- saved semantic lenses: quote, story, insight, research, question,
  needs-review, thesis, transition, citation-risk
- review queues by semantic tag, chapter, episode, author/source, quote state,
  and "unresolved blocker"
- quick conversion from semantic mark to review item
- cited quote queue with source note, status, and export blocker state
- keyboard command palette for common tagging and review actions
- mobile lens controls that toggle visibility without hiding the manuscript

First next slice:

- add saved lens presets and a single review queue view for `needs-review` and
  `quote` tags
- keep semantic marks inside editor JSON; review queue can be derived in memory
  before persistence

### 4. Snapshot Timeline And Revision Workspace

Goal: turn manual snapshots into a writer-facing timeline that can be named,
compared, exported, and partially restored.

Build toward:

- named snapshot milestones with reason and source branch/context
- diff summary: words changed, blocks added/deleted, semantic marks changed,
  quote statuses changed, structure regions changed
- block-range compare and restore candidate view
- "snapshot before rollback" prompt
- exportable revision packet for another reviewer or Codex agent
- timeline filter by manuscript, branch, device, and snapshot type

First next slice:

- add snapshot naming and metadata notes to the existing manual snapshot flow
- add a read-only timeline comparing current draft stats to selected snapshot
  stats

### 5. Compile And Publish Preview Profiles

Goal: make outputs explicit reviewed projections instead of opaque downloads.

Build toward:

- compile profiles for book manuscript, chapter packet, episode script, HGO
  episode draft, show notes, quote/citation review, and editor handoff
- preview of included/excluded marks, comments, citations, and private notes
- blockers panel for unresolved citations, public-safety issues, missing
  structure, and unreviewed semantic marks
- export packages with provenance, validation commands, rollback notes, and
  target path proposals

First next slice:

- add one "Book handoff preview" profile that lists included chapters/sections,
  word count, unresolved quote count, semantic blockers, and export commands
  without writing public files

### 6. Story And Source Bible

Goal: provide a Plottr-like story/source bible that is derived from manuscript
anchors instead of maintained separately.

Build toward:

- people, places, themes, recurring claims, cited sources, story candidates,
  and episode arcs
- source snippets tied back to block IDs and semantic spans
- status fields: draft, verified, needs-source, public-safe, cut, promoted
- timeline view for story beats and episode/chapter progression
- exportable bible packet for agents or editors

First next slice:

- derive a read-only "source bible" from semantic tags and cited quotes:
  quote, research, question, needs-review, and thesis spans grouped by block
  region

### 7. Collaboration And Review Layer

Goal: move from synthetic collaboration lab learnings into production review
without risking manuscript corruption.

Build toward:

- span/block anchored comments
- suggestion events with accept/reject
- review statuses: open, addressed, archived
- reviewer identity and role
- event log plus materialized annotation state
- no comments stored inside manual snapshot payloads as the primary source

First next slice:

- implement production-local review notes in browser-local state, exportable
  with the draft, but still excluded from canonical public outputs
- do not add Yjs production collaboration until room identity, permissions,
  snapshot recovery, and conflict rules are explicit

### 8. Codex Agent Handoff Mode

Goal: make the Codex application useful on bounded manuscript work without
needing chat memory.

Build toward:

- generate agent task packets from semantic lens, structure region, or review
  queue
- include block IDs, text excerpts, source/semantic metadata, constraints,
  acceptance checks, no-touch paths, and rollback instructions
- import agent result packets as proposed edits or review comments, not direct
  canonical rewrites
- show "safe to run" validation commands for the packet

First next slice:

- add a browser-only "copy agent packet" action for a selected structure region
  or semantic lens

## Now / Next / Later

### Now

- Keep and validate the new mobile writing and semantic marking controls.
- Validate the new chapter title marker flow and derived chapter map.
- Add session strip/status for mobile writing.
- Add the next read-only Manuscript Map layer from title markers, existing
  structure regions, and block summaries.
- Add saved semantic lens presets and a `needs-review` / `quote` review queue.
- Add snapshot metadata naming and current-vs-snapshot stats.
- Record validation blockers clearly before handing the repo to another Codex
  surface.

### Next

- Add book handoff preview profile.
- Add source-bible read-only grouping from semantic spans and cited quotes.
- Add browser-local review notes and exportable review packet.
- Add keyboard command palette for author marks, semantic tags, quote marking,
  focus lens, snapshot, and export preview.
- Add block-range agent packet export.

### Later

- Persist manuscript comments/review notes through a dedicated event-log model.
- Add range-safe structural drag/reorder.
- Add snapshot diff and partial restore.
- Add production collaboration rooms only after identity, permissions, and
  recovery rules are settled.
- Add final publish/export writers for DOCX, EPUB/PDF handoff, public HGO page
  drafts, and show-note packets.
- Add automated quote/citation/source review helpers after the human review
  workflow is useful without automation.

## Non-Negotiable Boundaries

- Do not write canonical Learning to Lead manuscript files from this workflow.
- Do not write public HGO content or publish routes from `/manuscript`.
- Do not merge author/source and semantic marks into one data concept.
- Do not remove durable block IDs.
- Do not treat manual snapshots as autosave.
- Do not store comments as the primary source inside rollback snapshots.
- Do not wire provider/API calls into writing/export flows without explicit
  approval.
- Do not add real manuscript text to tests or synthetic smoke fixtures.

## Validation Matrix

For narrow UI/data-model-safe manuscript desk changes:

```bash
pnpm studio:manuscript:test
pnpm --filter studio typecheck
git diff --check
```

For changes that touch shared Studio build/runtime behavior:

```bash
pnpm --filter studio build
pnpm studio:cloudrun:test
```

For persistence or Prisma changes:

```bash
pnpm db:generate
pnpm --filter studio typecheck
pnpm --filter studio build
```

Use production database mutation commands only with explicit release/deploy
authorization and a rollback note.

## Codex Application Starter Packet

When the project moves to the Codex application, start with this bounded task
sequence:

1. Read `docs/agents/codex-application-handoff-2026-05-26.md`.
2. Verify `git status --short --branch` and current branch.
3. Repair the local generated Prisma client/build environment if it still
   blocks `pnpm --filter studio build`.
4. Implement the next smallest "Now" slice: mobile session strip or read-only
   Manuscript Map.
5. Run the validation matrix above.
6. Record the result under `docs/sessions/` and update this roadmap if product
   decisions changed.
