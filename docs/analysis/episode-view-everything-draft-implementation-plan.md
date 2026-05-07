# Episode View Everything / Draft Implementation Plan

Date: 2026-05-07

## Purpose

Design the next implementation slice for the existing `Learning to Lead` Book / Story / Episode viewer without changing UI code yet.

The goal is to evolve Episode View from a read-only arrangement display into a production cockpit with:

- Everything View for all candidate material
- Draft View for the curated episode draft
- lifecycle status for each episode

## Current Viewer Summary

Current route:

- `apps/web/src/app/team/books/learning-to-lead/page.tsx`

Current client:

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`

Current server data:

- `getLearningToLeadManuscript()`
- `getLearningToLeadBookArrangement()`
- `getLearningToLeadPodcastArrangement()`

Current source files:

- living manuscript: `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- book arrangement: `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- podcast arrangement: `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`

Current behavior:

- Book View renders `book-v1.yml` chapters as a reading experience over resolved living-manuscript blocks.
- Story View filters and renders all living-manuscript blocks by metadata.
- Episode View renders `podcast-season-1.yml` as either Board or Reading display over resolved living-manuscript blocks.
- Episode View currently shows arrangement `status`, missing references, primary chapter, visible block count, and total word count.

Important current gap:

- Episode 5 and Episode 6 structured intake files are not currently loaded into the viewer.
- Raw `_inbox` and structured intake classifications are not part of the Episode View data model.
- There is no separate episode lifecycle status model.
- There is no curated Draft View state apart from `podcast-season-1.yml`, which is too coarse and arrangement-oriented to own production state.

## Recommended UI Shape

Top-level modes remain:

- Book
- Story
- Episode

Episode mode gains production subviews:

- Everything
- Draft

The existing Board / Reading display can either be retired or folded into the new subviews:

- Everything can default to a board/list of candidates grouped by classification.
- Draft can offer board and reading modes later if useful.

### Episode Header

Each episode should show:

- working title
- lifecycle status badge
- public slug if known
- recording status/date if known
- draft readiness summary
- unresolved decision count
- source confidence

### Lifecycle Selector

Read-only first:

- show the lifecycle status as a badge
- do not add mutation controls until file-based state loads reliably

Editable later:

- allow status changes only after explicit validation rules
- record status-change notes in Git-readable state

### Episode List / Status Sidebar

The sidebar should show every Season One episode with:

- lifecycle status
- Everything candidate count
- Draft selected count
- unresolved decision count
- recording/public status
- warnings

### Unresolved Decision Indicators

Unresolved decisions should be first-class, not hidden in notes.

Examples:

- Episode 5/6 boundary unresolved
- clip rights unclear
- quote needs verification
- Charlie prose role unclear
- post-recording review pending

## Recommended Data Structure

Start with file-based state.

Recommended first file:

`apps/web/content/books/learning-to-lead/episode-production/season-one.yml`

Possible shape:

```yml
episodes:
  episode-05:
    title: "The Values Toolkit"
    lifecycleStatus: "Recorded"
    publicSlug: null
    recordingDate: null
    sourceConfidence: "medium-high"
    intakeFiles:
      - "episode-breakdowns/episode-05-values-toolkit.md"
      - "../../_inbox/Episode 5 - Chapter 2.md"
    everything:
      includeStructuredIntake: true
      includeArrangementKeys:
        - "values"
      includeCandidateTypes:
        - "homer-baseline-candidate"
        - "charlie-inline-candidate"
        - "charlie-sidebar-reflection-candidate"
        - "research-bridge-field-note-candidate"
        - "clip-candidate"
        - "production-note"
        - "unresolved-decision"
    draft:
      status: "rough-draft"
      selectedItems:
        - kind: "manuscript-block"
          id: "homer-values-tip-nevada-promise"
        - kind: "intake-section"
          source: "episode-05-values-toolkit.md"
          heading: "Samwise Clip / Tip And The Winnemucca Promise"
      recordingNotes: []
      showNotes: []
      publicSafeNotes: []
    unresolvedDecisions:
      - "Which Charlie interjections are book prose versus episode-only?"
```

This is intentionally explicit and boring. It keeps reviewable state in Git and avoids a database before the workflow has proven itself.

## Markdown/YAML First Or Database First

Start with Markdown/YAML metadata.

Reasons:

- current manuscript system is file-based
- this is editorial workflow, not transactional app state yet
- Git diffs are valuable for reviewing production changes
- the data shape is still evolving
- database work would add migration and UI-edit complexity before the model is stable

Move to database later only if:

- multiple users need concurrent editing
- lifecycle/status changes need audit trails beyond Git
- the public publishing flow needs transactional guarantees
- draft state becomes too complex for readable YAML

## Proposed File-Based First Step

Create read-only episode production state files, then load them into the viewer.

First coding slice should:

- add `episode-production/season-one.yml`
- add a parser in `apps/web/src/lib/server/living-manuscript.ts` or a new server-only module
- include lifecycle status, intake file paths, draft selected item references, and unresolved decisions
- pass the parsed production state into `LivingManuscriptViewerClient`
- render Episode subview tabs as read-only `Everything` and `Draft`
- keep existing Book and Story behavior unchanged
- keep existing `podcast-season-1.yml` behavior available until Draft View proves itself

Do not add editing or publishing in the first coding slice.

## Implementation Phases

### 1. Docs / Model Only

Current pass.

Outputs:

- lifecycle architecture doc
- implementation plan
- durable docs updates

No UI code changes.

### 2. Read-Only Everything / Draft Views

Goal:

- make Episode View accurately display current production state

Work:

- create file-based production state
- parse production state server-side
- Everything View displays structured intake candidates, arrangement blocks, raw source references, and unresolved decisions
- Draft View displays selected sequence and notes
- lifecycle status is visible but not editable

Validation:

- parser handles missing optional files gracefully
- missing references show warnings
- Episode 5 and 6 match structured intake docs

### 3. Editable Status Metadata

Goal:

- allow team users to move lifecycle state deliberately

Work:

- add server action or controlled file-edit workflow
- validate legal transitions
- require notes for major transitions
- keep Git-readable state

Validation:

- no invalid status transitions
- no Live transition without required gates
- state updates do not modify manuscript blocks or arrangements accidentally

### 4. Draft-To-Live Publishing Flow

Goal:

- use Draft View as the source for public episode output only when lifecycle status is `Live`

Work:

- define public-safe draft fields
- generate or update public episode content from approved draft state
- exclude Everything-only material
- add checks for unresolved decisions, citation status, clip clearance, and show notes

Validation:

- public page contains no internal notes
- public route appears only for Live episodes
- public output can be regenerated from draft state

## Metadata Missing Today

Missing from current viewer/data shape:

- episode lifecycle status
- Everything candidate list
- Draft selected item list
- candidate classification in machine-readable form
- candidate source layer
- draft/public-safe flags
- unresolved decision records
- recording date and post-recording notes
- clip rights/citation status
- draft-to-live gate checks

Current `podcast-season-1.yml` has only:

- episode key
- title
- arrangement status
- ordered block IDs

That is not enough to support a production cockpit.

## Risks

- Building Everything View directly from raw Markdown parsing could make brittle assumptions about headings and `==...==` artifacts.
- Treating the existing podcast arrangement as Draft View would confuse candidate arrangement with curated episode draft.
- Making lifecycle status editable before transition rules exist could create false confidence.
- Publishing from any non-Live state could leak raw notes, unresolved questions, or uncleared clip candidates.
- Overbuilding a database first could slow the actual Episode 5 normalization and Episode 6 recording review.

## Validation Strategy

Docs/model phase:

- `git diff --check`
- confirm only docs changed

Read-only implementation phase:

- parse `season-one.yml`
- verify every referenced manuscript block ID resolves or reports a warning
- verify every intake file path exists or reports a warning
- verify Everything View can show Episode 5 and 6 classified candidates
- verify Draft View can show an empty or partial draft without crashing
- keep `pnpm --filter web exec tsc --noEmit`
- keep `pnpm --filter web exec next build --webpack`

Editable/publishing phases:

- add status-transition validation tests or script checks
- add public-output safety checks before `Live`
- verify no Everything-only material appears in public output

## Recommended First Coding Slice

Create a read-only file-backed production state for Season One and render Episode subview tabs:

- `Everything`
- `Draft`

Use Episode 5 as the first full fixture because it is recorded and classified. Keep Episode 6 in the file as `Ready to Record` or `Recorded` depending on confirmed recording state at implementation time, but do not make Episode 6 the first normalization target until post-recording review is complete.
