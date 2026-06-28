# Quipsly Writing Surface History and Consolidation Plan

Last updated: 2026-06-28

Latest validation checkpoint:

- `./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit` passed on 2026-06-28 after the notebook rail, page shelf, shortcuts, quick-create, page rename, last-touched rows, draft branching, and note promotion changes.

## Current implementation checkpoint

The `/create` sidebar now treats notebook navigation as the primary interaction instead of showing every Quipsly concept at once.

The left rail is organized into three author-facing modes:

- Pages: quick capture, writing pages, drafts, notes, and fixed sources.
- Structure: Chapter/Episode heading creation and the document outline.
- Tools: workflow lenses and advanced Quipsly context.

The rail also preserves lightweight local continuity:

- The last selected notebook mode is remembered per Nest.
- The last selected Page Shelf filter is remembered per Nest.
- Recently opened pages are shown in Pages mode.
- This is local UX memory only; it does not create another manuscript truth.

Pages mode now includes a Page Shelf filter:

- All: everything in the Nest.
- Writing: manuscripts, drafts, and editable pages.
- Notes: quick captures and scraps.
- Sources: fixed study/reference material.

The shelf filter changes navigation only. It does not move documents, change document truth, or create a second manuscript.

Keyboard navigation checkpoint:

- `Cmd/Ctrl+K` opens Pages mode and focuses notebook search.
- `Alt+A` switches to the All shelf.
- `Alt+W` switches to the Writing shelf.
- `Alt+N` switches to the Notes shelf.
- `Alt+S` switches to the Sources shelf.
- `Alt+P` creates a new writing page.
- `Alt+Q` creates a quick note.
- `Alt+R` creates a fixed study source.
- Quick-create shortcuts also switch Pages mode to the matching shelf: Writing, Notes, or Sources.
- The shortcut does not fire while typing inside an input, textarea, or contenteditable area.
- This is part of the OneNote-floor goal: fast retrieval must become muscle memory.

Page management checkpoint:

- The active page can be renamed from the notebook rail.
- Rename updates document metadata only.
- Rename does not rewrite the body, first block, manuscript text, or fixed source text.
- Successful rename refreshes the route so the visible notebook state comes back from canonical server data.
- Failed rename shows an inline error in the notebook rail instead of failing silently.
- This preserves the distinction between notebook organization and writing/source truth.

Draft branching checkpoint:

- The active page can be duplicated as a draft from the notebook rail.
- Branching creates a new editable draft document.
- Branching preserves lineage with `branched-from-document` and `branched-from-label` metadata.
- Branching does not mutate the original page, fixed source, manuscript text, or external publication state.

Note promotion checkpoint:

- Quick notes can be promoted into writing pages from the notebook rail.
- Promotion creates a new editable draft document seeded from the note.
- Promotion preserves lineage with `promoted-from-document` and `promoted-from-label` metadata.
- Promotion does not mutate or delete the original note.

Recovery export checkpoint:

- Markdown recovery/export uses calm scope-aware labels: `Copy/export page` or `Copy/export section`.
- Markdown recovery/export includes explicit export-scope metadata.
- If a Chapter/Episode section is focused, the export contains that focused section.
- If no section is focused, the export contains the current notebook page/document.
- The export records how many blocks were exported out of the page total.

Daily desk orientation checkpoint:

- The `/create` sidebar now includes a small `OneNote floor` orientation card.
- The card repeats the product floor in the UI: capture, find, rename, branch, and export must work without understanding Quipsly internals.
- The card shows current role, safe next move, and whether the user is working on the whole page or a focused Chapter/Episode section.
- This is intentionally small. It clarifies trust state without adding another workflow lane or another writing surface.

This is intentionally a UX floor, not the final architecture. The point is to make the daily writing room feel navigable before assistant, publishing, research, and production intelligence become prominent.

## Product decision

Quipsly writing must become at least as easy to organize and navigate as OneNote before advanced Quipsly intelligence is allowed to dominate the experience.

The writing spine is:

```text
Nest -> Notebook / Document -> Section -> Page -> Blocks
```

Tags, research packets, assistant suggestions, publishing links, semantic annotations, episode boundaries, and AI workflows live on top of that spine. They do not replace it.

## The mistake we are correcting

We repeatedly built writing-adjacent capability before proving the basic writing room.

That produced promising surfaces, but no trusted daily authoring home. The failure was not the ambition. The failure was allowing tags, publishing workflows, semantic structure, research packets, and assistant concepts to arrive before the user could simply open a familiar notebook-like workspace, find the right section, write, rearrange, search, and leave without anxiety.

OneNote is the minimum anxiety bar:

- The user can dump thoughts quickly.
- The user can see where things live.
- Sections and pages stay where the user put them.
- Navigation is fast.
- Search is obvious.
- Writing is the main action.
- Metadata is helpful, not mandatory.

Quipsly may exceed OneNote, but it cannot ask Homer, Charlie, Mako, or any beta user to understand Quipsly's whole worldview before they can write a page.

## Current writing surfaces

### 1. Web `/create`

Status: Canonical candidate.

Current role:

- One living document model.
- Chapter/Episode tagging.
- Document outline experiments.
- Project/Nest integration.
- Block-based writing and tagging.

Why it matters:

- This is closest to the original product idea: living manuscript truth plus lightweight structure.
- It is the best candidate to become the first trusted writing surface.

Problem:

- It has accumulated too many overlapping concerns.
- It needs to feel like a calm writing notebook before it feels like a publishing cockpit.

Decision:

- Promote `/create` as the first canonical writing surface unless a later explicit architecture review replaces it.
- Refactor it toward the OneNote-style spine.

### 2. Web `/manuscript`

Status: Experimental/supporting.

Current role:

- Manuscript editor experiments.
- Collaboration lab.
- Live reader/checkpoint ideas.
- Annotation durability work.

Why it matters:

- It contains useful ideas for collaboration, live review, and manuscript state.

Problem:

- It overlaps with `/create`.
- It risks becoming a second canonical manuscript editor.

Decision:

- Do not build this as a competing main editor.
- Mine it for collaboration, review, checkpoints, and annotation patterns that should support the canonical writing surface.

### 3. Web `/write`

Status: Experimental/supporting.

Current role:

- Writing desk concept.
- Potential focused drafting surface.

Why it matters:

- It may contain useful focus-mode ideas.

Problem:

- Its relationship to `/create` is unclear.

Decision:

- Do not let `/write` become another main editor without a deliberate promotion decision.
- Treat it as either a focus view for the canonical writing surface or quarantine it.

### 4. Native Mac manuscript shell

Status: Shell/supporting.

Current role:

- Native Mac entry point for manuscript/Nest work.

Why it matters:

- Long-term native writing matters.
- The native app should eventually support offline-first capture, local comfort, and deep OS integration.

Problem:

- It is not yet proven as the authoring source of truth.

Decision:

- Native writing should initially wrap or sync with the canonical web/Nest writing model.
- Do not create a separate native manuscript truth.

### 5. QuipslyStudio writing packet/control-room scripts

Status: Agent/support infrastructure.

Current role:

- Source atlases.
- Review packets.
- Momentum boards.
- Daily writing packets.
- Research/source summaries.
- Publication runway documents.

Why it matters:

- These are useful for agents, research organization, and output prep.

Problem:

- They are not a writing editor.
- They can create the illusion of progress while the human still has nowhere comfortable to write.

Decision:

- Keep them as support tooling only.
- They should feed the writing surface and Tower pipeline, not replace the writing surface.

### 6. Old standalone Mac writing experiments

Status: Quarantine unless deliberately revived.

Current role:

- Earlier native app experiments and possible useful fragments.

Why it matters:

- They may contain salvageable interaction ideas.

Problem:

- They add fear, confusion, and resurrection risk.

Decision:

- Move or document abandoned writing experiments clearly.
- Do not let old prototypes silently re-enter the product.

## Canonical writing UX target

The first real Nest writing product should have this layout:

```text
+----------------------+-------------------------------+----------------------+
| Nest / Notebook nav  | Page writing canvas           | Quipsly context      |
|                      |                               |                      |
| Notebooks/Documents  | Title                         | Tags                 |
| Sections             | Blocks / paragraphs           | Research links       |
| Pages                | Draft notes                   | Episode/Chapter      |
| Search               | Inline media/references       | Assistant suggestions|
| Quick capture        |                               | Publish readiness    |
+----------------------+-------------------------------+----------------------+
```

MVP navigation:

- Nests are the top-level project containers.
- Each Nest can contain multiple notebooks/documents.
- A notebook/document contains sections.
- A section contains pages.
- A page contains blocks.
- Blocks can have tags, source links, comments, draft state, and publication metadata.

Important: A user should be able to ignore advanced tags and still write successfully.

## Living documents, drafts, and notes

The earlier "one living document truth" principle was correct but under-specified.

Updated model:

- Canonical pages are the current living writing truth.
- Drafts are allowed as first-class objects, not shadow manuscripts.
- Notes are allowed as first-class objects, not hacks on blocks.
- Source documents are immutable or clearly source-preserved.
- Publication packets are exports/views, not manuscript truth.

Practical rule:

- If a thing is meant to be edited as part of the book/article, it belongs in the writing spine.
- If a thing is evidence/source/reference, it belongs in source/research context.
- If a thing is a prepared outgoing version, it belongs in Tower/publication packets.
- If a thing is a temporary scratchpad, label it as scratchpad and give it an obvious promote/merge path.

## MVP feature bar for writing

Before adding more advanced intelligence, the writing surface needs:

- Fast new page.
- Fast new section.
- Fast page rename.
- Drag/reorder pages and sections.
- Search pages/blocks.
- Quick capture inbox.
- Clear current Nest/document/section/page breadcrumb.
- Easy tag add/remove.
- Easy Chapter/Episode marking without a giant tag taxonomy.
- Draft note area or side notes.
- Autosave state clarity.
- Undo/restore for risky edits.
- "Open where I left off."
- Obvious safe export/copy out.

## What Quipsly adds after the OneNote floor is solid

Once the notebook floor is trustworthy, Quipsly can add:

- Research packets linked to pages.
- Suggested tags.
- Source quote/citation tracking.
- Episode/page/publishing relationships.
- Assistant action ledger.
- Draft comparisons.
- Structure views.
- Article/social/video/podcast output routing.
- Study document overlays.
- AI drafting and rewriting with transparency.
- Agent-readable state and command surfaces.

This is where Quipsly becomes more than OneNote. But these features must feel like helpful assistants in the room, not furniture blocking the door.

## Consolidation plan

### Step 1: Stop creating new writing surfaces

No new "main writing app" without an explicit replacement decision.

### Step 2: Crown `/create` as the first canonical writing product

Use `/create` as the product spine while we extract useful pieces from other surfaces.

### Step 3: Rename concepts in the UI toward notebooks/pages

Do not force users to think in internal data structures. Users should see:

- Nest
- Notebook or Document
- Section
- Page
- Block
- Tag
- Note
- Draft

### Step 4: Add a left navigation system worthy of OneNote

The left side needs to answer:

- Where am I?
- What sections exist?
- What pages exist?
- What changed recently?
- Where do I dump a new idea?

### Step 5: Make right-side intelligence optional

The right side can show tags, Quipsly suggestions, source packets, publishing readiness, and related blocks. It must never be required for basic writing.

### Step 6: Quarantine or demote overlapping tools

Every writing-related surface gets one of these labels:

- Canonical
- Supporting
- Experimental
- Quarantined

No unlabeled writing surfaces.

### Step 7: Commit coherent checkpoints

Do not allow another multi-day uncommitted fogbank.

Commit chunks should be:

1. Source code changes.
2. Product docs/runbooks.
3. Generated artifacts only if intentionally kept.

Avoid `git add .` until generated files, old prototypes, and external-output artifacts are sorted.

## Product manager truth bomb

If a writing feature does not make it easier to capture, organize, navigate, write, revise, retrieve, or safely publish, it is not part of the writing MVP.

Quipsly can become a research and production operating system. But the writing room must first feel like a room.
