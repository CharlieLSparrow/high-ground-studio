# Studio Manuscript Writing Tool Competitive Research

Date: 2026-05-26

## Scope

This memo compares the private Studio `/manuscript` desk with writing tools
that solve adjacent jobs: drafting, long-manuscript organization, mobile
writing, semantic/style highlighting, revision history, collaboration, and
publish/export. It is planning research only. It does not change canonical
Learning to Lead manuscript truth, public HGO content, Prisma schema, provider
integrations, or production data.

## Current Studio Advantage

Studio should not become a generic Scrivener, Docs, or Reedsy clone. The
current Manuscript Desk already has a specialized advantage:

- durable TipTap/ProseMirror document JSON
- stable block IDs on paragraph, heading, and list item nodes
- separate author and semantic highlight marks
- cited quotation marking and review metadata
- structure regions anchored to block ranges
- manual browser-local and server snapshot boundaries
- browser-only publish/handoff reports and HGO projection drafts

The competitive opportunity is to keep that source-aware foundation while
borrowing the best workflow ideas from mature writing tools.

## Comparable Apps Reviewed

| App | What It Optimizes | Relevant Patterns For Studio |
| --- | --- | --- |
| Scrivener | Long-form manuscript organization, research, corkboard/outliner, snapshots, compile/export. | Add a manuscript map that can show binder, corkboard, outliner, and whole-manuscript views from the same block/region data. Treat compile/export as a first-class workflow, not a final afterthought. |
| Ulysses | Focused markup writing, portable library/sheets, mobile export, semantic export from plain text. | Give mobile users a reduced command set and make semantic intent portable across exports. Keep formatting concerns behind meaning-first controls. |
| Dabble | Novel writing with plot grids, goals, cloud sync, mobile support, sticky notes, comments, and find/replace. | Add low-friction mobile author/semantic marking, writing goals, and split/join/section controls without making the first viewport feel like an admin console. |
| Reedsy Studio | Browser-based writing, formatting, goals, device access, cloud backup, collaboration, comments/tracked changes, timeline/history, EPUB/PDF export. | Build a visible writing timeline, review workflow, and export preview. Collaboration needs comments, suggestions, permissions, and history, not only simultaneous cursors. |
| Atticus | Integrated writing plus book formatting, templates, device preview, import, EPUB/PDF/DOCX export, offline-capable browser/PWA posture. | Create Studio compile profiles and preview targets for book, episode, show notes, public HGO page, and editor handoff packages. |
| Plottr | Visual timelines, story bibles, plotlines, scene cards, tags, export to Word/Scrivener, series planning, sync. | Derive story/source bible and timeline surfaces from block regions, semantic tags, quotes, people, places, themes, and source anchors. |
| LivingWriter | Chapter/manuscript/session goals, stats, boards, version history, tags/statuses, mobile app. | Add goals and session stats as editorial instrumentation around the manuscript rather than as a separate dashboard. |
| Novlr | Browser writing with sync/offline fallback, analytics, words-written vs word-count distinction. | Track session writing separately from total manuscript size. Show offline/local/server snapshot state explicitly. |
| iA Writer | Minimal focus mode, syntax highlight, style check, authorship/source marking. | Treat semantic highlighting as an editor lens. Let authorship/source markings and semantic/style lenses be toggled independently so they do not visually fight. |
| Google Docs and Microsoft Word | Comments, suggestions/tracked changes, version/revision workflows, mobile review. | Add accept/reject style review operations for suggested edits and keep review comments as an event log anchored to spans or blocks. |

## Strong Product Patterns

### 1. Long manuscripts need multiple synchronized views

Scrivener's core lesson is not just "have a sidebar." It links the manuscript
outline, corkboard/index-card planning, outliner metadata, and editor around
the same project structure. Studio already has the better anchor: block IDs and
structure regions. The next step is a synchronized Manuscript Map:

- binder view: chapters, episodes, sections, unresolved ranges
- corkboard view: cards generated from region titles, notes, pull quotes, and
  summary snippets
- outliner view: block range, word count, status, semantic density, quote
  count, and review blockers
- whole-manuscript view: current long wall remains the home surface

### 2. Mobile writing succeeds by reducing the visible command surface

Ulysses, iA Writer, Dabble, Reedsy, Atticus, and Novlr all reinforce the same
mobile lesson: the phone view should open on writing, not configuration. The
mobile commands should be context-sensitive:

- write
- mark author/source
- apply semantic tag
- mark quote/citation
- jump to structure
- snapshot/checkpoint
- return to full text quickly

This validates the current mobile writing pass and suggests the next phone
work: better selection toolbar behavior, larger thumb-safe tag controls,
session status, and a compact "save/snapshot/offline" strip.

### 3. Goals and analytics should distinguish effort from size

Novlr's distinction between words written and manuscript word count matters.
For Studio, this should become:

- total manuscript words
- session words added
- session words deleted
- semantic marks added
- cited quotes reviewed
- structure regions added or refined
- snapshot/checkpoint freshness

The metric should answer "what work happened today?" without pretending all
progress is net word count.

### 4. Revision history should be named, comparable, and restorable

Scrivener snapshots, Reedsy timeline/history, Google Docs version history, and
Word tracked changes point to one missing Studio feature: a revision workspace.
Manual snapshots exist, but the review surface should expose:

- named milestones
- before/after compare
- block-range restore candidates
- semantic/quote/status changes
- "take a snapshot before rollback" behavior
- export a snapshot packet for another reviewer or agent

This should preserve the current rule that manual snapshots are rollback
anchors, not an autosave replacement.

### 5. Comments and suggestions are a workflow, not just annotations

Google Docs and Word make comments and suggested edits familiar. Reedsy shows
that book-focused browser tools now treat comments/tracked changes as expected.
The Studio collaboration lab has already modeled synthetic review notes and an
annotation event log. The production path should make that concrete:

- span/block anchored comments
- suggestion events with accept/reject
- status: open, addressed, archived
- reviewer identity and role
- filtered review queues by author, semantic tag, chapter, quote, or blocker
- exportable review packet for Codex or a human editor

### 6. Semantic highlighting should become a lens system

iA Writer's syntax/style/authorship modes are valuable because they are lenses,
not permanent decoration. Studio's author marks and semantic marks should
follow the same pattern:

- Writing lens: minimal markup, current paragraph emphasis, key mobile actions.
- Source lens: author/source ownership and pasted/reference material.
- Semantic lens: quote, story, insight, research, question, needs-review,
  thesis, transition.
- Structure lens: chapter, episode, section, region status.
- Publication lens: citation readiness, public-safety warnings, export targets.

This avoids visual overload while making metadata actionable.

### 7. Export and formatting need preview targets

Atticus, Reedsy, Scrivener, and Ulysses all make export a product surface.
Studio should define compile profiles that derive from private manuscript
state:

- book manuscript handoff
- chapter packet
- episode recording script
- HGO episode-page projection draft
- show notes
- editor/reviewer packet
- quote/citation review packet

Each profile should show what will be included, what will be suppressed, and
what blockers remain before export.

### 8. Story/source bibles and timelines can be derived, not duplicated

Plottr's story bible/timeline pattern is useful, but Studio should not ask the
team to maintain a disconnected story database. It should derive an editorial
bible from tagged spans and regions:

- people
- places
- themes
- recurring claims
- quoted sources
- story candidates
- chapter/episode arcs
- needs-review clusters

The first useful version can be read-only and exportable.

## High-Gap Inventory

The current Manuscript Desk is strong on foundation but thin in these product
areas:

- phone-first drafting and selection ergonomics
- visible manuscript map across chapter/episode/section regions
- saved semantic lenses and review queues
- writing goals, session metrics, and daily progress history
- named snapshot timeline with compare/restore affordances
- production-grade comments and suggestions
- story/source bible and timeline surfaces
- compile/export preview for book and episode targets
- keyboard command palette and mobile quick actions
- explicit offline/local/server snapshot status
- agent handoff packets scoped to block ranges and review queues

## Strategic Recommendation

Make Studio the source-aware book production desk:

1. Preserve the long manuscript as the home surface.
2. Add synchronized projections around it: map, semantic lens, review queue,
   timeline, story bible, publish preview.
3. Keep author marks, semantic marks, comments, suggestions, structure, quotes,
   and snapshots separate in data, even when the UI shows them together.
4. Treat mobile as a real writing surface, not a companion-only viewer.
5. Treat exports as reviewed projections, not file dumps.
6. Give Codex agents handoff packets that reference block IDs, structure
   regions, semantic lenses, and acceptance checks.

## Sources Reviewed

- Scrivener overview and feature documentation:
  `https://www.literatureandlatte.com/scrivener/overview`
- Scrivener Binder/Corkboard/Outliner article:
  `https://www.literatureandlatte.com/blog/integrating-scriveners-binder-corkboard-and-outliner`
- Scrivener snapshots articles:
  `https://www.literatureandlatte.com/blog/use-snapshots-in-scrivener-to-save-versions-of-your-projects`
  and
  `https://www.literatureandlatte.com/blog/how-to-manage-compare-and-restore-snapshots-in-your-scrivener-projects`
- Ulysses export/semantic markup documentation:
  `https://help.ulysses.app/en_US/getting-started/first-steps-export-more`
- Dabble features:
  `https://www.dabblewriter.com/features-2/dabble-features`
- Reedsy Studio writing app:
  `https://reedsy.com/studio/write-a-book`
- Atticus home/features:
  `https://www.atticus.io/`
- Plottr features:
  `https://plottr.com/features/`
- LivingWriter goals:
  `https://guides.livingwriter.com/desktop-app-+-web-version/goals`
- Novlr offline and analytics help:
  `https://help.novlr.org/en/article/can-i-use-novlr-offline-ctck05/`
  and
  `https://help.novlr.org/en/article/what-analytics-are-available-in-novlr-o0f2tl/`
- iA Writer overview, syntax highlight, and authorship documentation:
  `https://ia.net/writer`,
  `https://ia.net/writer/support/editor/syntax-highlight`,
  and
  `https://ia.net/writer/support/editor/authorship/authorship-windows`
- Google Docs suggestions:
  `https://support.google.com/docs/answer/6033474`
- Microsoft Word track changes:
  `https://support.microsoft.com/en-us/office/track-changes-in-word-197ba630-0f5f-4a8e-9a77-3712475e806a`
