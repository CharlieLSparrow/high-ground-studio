# Episode Production Lifecycle

Date: 2026-05-07

## Purpose

This doc defines the next production model for the `Learning to Lead` Book / Story / Episode viewer.

The goal is to turn Episode View into a real production cockpit without confusing staging truth, manuscript truth, draft truth, and public truth. Episode prep should help the highest-priority lane: writing, recording, editing, and publishing the book/podcast work.

## Source-Of-Truth Layers

### Raw OneNote / `_inbox`

Raw OneNote exports live under `apps/web/content/_inbox/`.

Role:

- staging truth
- newest rough prep signal
- useful for preserving messy human production intent

Rules:

- do not publish directly from `_inbox`
- do not treat formatting artifacts as manuscript structure
- preserve files unless a dedicated cleanup/intake pass says otherwise

### Structured Intake Files

Episode intake files live under `apps/web/content/books/learning-to-lead/episode-breakdowns/`.

Role:

- classification layer
- explains what raw material likely is
- separates Homer baseline candidates, Charlie candidates, research, clips, production notes, and unresolved decisions

Rules:

- can be shown in Everything View
- should not be treated as final draft sequence
- should not publish directly

### Living Manuscript Blocks

The canonical living manuscript is `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`.

Role:

- whole-manuscript source of reusable prose blocks
- canonical source for normalized Homer/Charlie/research/support blocks once material is ready
- current source for Book View and Story View

Rules:

- preserve Homer baseline wording during structural passes
- keep Charlie/support material separate unless deliberately promoted
- do not add production-only notes as clean prose

### Arrangement YAML

Arrangement files live under `apps/web/content/books/learning-to-lead/arrangements/`.

Current files:

- `book-v1.yml`
- `podcast-season-1.yml`
- `public-site.yml`

Role:

- output composition
- ordered references to living manuscript block IDs
- current data source for Book View and current Episode View

Rules:

- arrangements decide order, not ownership of prose
- arrangements should reference stable block IDs
- arrangements do not carry raw intake notes, lifecycle state, or public publish approval

### Episode Production / Draft State

This is the missing layer.

Recommended first form:

- file-based Markdown/YAML state, not database-first
- lives beside the book project, for example under `apps/web/content/books/learning-to-lead/episode-production/`
- one state file per episode or one `season-one.yml` index with per-episode entries

Role:

- owns episode lifecycle status
- selects which candidate material appears in Draft View
- stores unresolved decisions and production notes
- links Everything View candidate items to Draft View selected items
- controls when a draft is eligible to become public

Rules:

- Draft View reads from this layer plus living-manuscript/structured-intake references
- Everything View may inherit from structured intake and arrangements, but Draft View must be curated
- this layer is not the same as manuscript block status

### Public Live Page

Public episode pages live under the public episode/publish system.

Role:

- public-facing output
- only receives material from Draft View after the episode lifecycle is `Live`

Rules:

- Everything View never publishes directly
- Draft View becomes the public source only when the episode is set to `Live`
- public pages should not include unresolved decisions, raw notes, clip candidates without clearance, or internal production notes

## Status Models Are Different Things

### Episode Lifecycle Status

This describes production progress for an episode.

Allowed lifecycle stages:

- Brainstorm
- Rough Draft
- Ready to Record
- Recorded
- Edited
- Live

This status belongs to episode production/draft state.

### Content Classification

This describes what a candidate item is.

Examples:

- Homer baseline candidate
- Charlie inline candidate
- Charlie sidebar/reflection candidate
- research bridge / field note candidate
- clip candidate
- reaction cue
- production note
- unresolved / needs human decision
- raw/intake reference

This classification belongs to structured intake and candidate metadata.

### Manuscript Block Editorial Status

This describes maturity of a normalized `ManuscriptBlock`.

Examples from current conventions:

- `baseline`
- `draft`
- `revised`
- `review`
- `ready`
- `published`
- `archived`

This status belongs to living manuscript blocks. It is not enough to know whether an episode is ready to record or live.

### Public Publish Status

This describes whether public website content exists and is visible.

Examples:

- unpublished
- draft
- live
- archived

This status belongs to the public episode/publish layer, not Everything View.

## Lifecycle Definitions

### Brainstorm

Meaning:

- best guess at what part of the book and Homer material the episode includes
- can inherit from Everything View
- likely includes many candidates and unresolved decisions

Allowed sources:

- raw `_inbox` references
- structured intake classifications
- broad living-manuscript blocks
- rough arrangement guesses

Exit rule:

- move to Rough Draft when a current favorite episode structure exists.

### Rough Draft

Meaning:

- current favorite Charlie contributions and episode structure are selected
- Draft View begins to matter
- candidate material is filtered into a coherent sequence

Allowed sources:

- selected Homer material
- selected Charlie inline/sidebar material
- selected research bridges or field notes
- selected clip/reaction candidates for show prep
- unresolved decisions, clearly marked

Exit rule:

- move to Ready to Record when the sequence, host notes, recording notes, and key decisions are stable enough to record.

### Ready To Record

Meaning:

- episode can be recorded without further structural discovery
- notes are stable enough for the hosts
- unresolved decisions are either closed or intentionally deferred

Required checks:

- episode title/working title is clear enough for recording
- core story sequence is selected
- show notes and recording notes are present enough
- production-only notes are clearly separated
- clip candidates are labeled as candidates, not cleared assets

Exit rule:

- move to Recorded after recording happens.

### Recorded

Meaning:

- recording happened
- post-recording notes should be captured
- the draft may need to change to reflect what was actually said

Required checks:

- recording date captured
- rough post-recording notes captured
- any major divergence from Draft View identified

Exit rule:

- move to Edited when the audio/video edit and show-note prep are substantially complete.

### Edited

Meaning:

- audio/video edit is prepared
- show notes are prepared
- public-safe material is selected

Required checks:

- public summary exists
- show notes exist
- public clip references are cleared or omitted
- no internal production notes remain in public candidate material

Exit rule:

- move to Live when public page output is ready and approved.

### Live

Meaning:

- public episode page is published
- episode appears in the public/front-page experience as intended
- Draft View is now the source that generated or informed public output

Required checks:

- public page exists
- public page excludes Everything-only material
- links and metadata are correct
- episode is safe to show externally

Exit rule:

- Live episodes can be edited only through a careful update path that preserves published history.

## Everything View Rules

Everything View shows all candidate material for an episode.

Allowed item types:

- Homer baseline candidates
- Charlie inline candidates
- Charlie sidebar/reflection candidates
- research bridge / field note candidates
- clip candidates
- reaction cues
- production notes
- unresolved decisions
- raw/intake references
- existing living-manuscript blocks already associated with the episode
- arrangement references and missing-reference warnings

Everything View may include messy material. That is the point.

Everything View must clearly label:

- source layer
- classification
- confidence
- whether the item is selected into Draft View
- whether the item is public-safe
- unresolved decisions

Everything View never publishes directly.

## Draft View Rules

Draft View shows the current curated episode draft.

Allowed item types:

- selected Homer material
- selected Charlie contributions
- selected research/field-note material
- recording notes
- show notes
- selected public-safe material when ready
- clearly marked unresolved decisions only before Ready to Record

Draft View should not show:

- raw OneNote clutter unless deliberately quoted as a source reference
- unselected Everything candidates
- internal production notes after Edited
- unresolved decisions after Ready to Record unless explicitly deferred
- uncleared clip candidates in public-ready sections

Draft View becomes the source for public episode output only when lifecycle status is `Live`.

## Live Gate

Before an episode can become `Live`, all of these must be true:

- lifecycle status is at least `Edited`
- Draft View exists and is curated
- public summary/show notes are ready
- public route or publish content exists or can be generated from the approved draft
- internal production notes are excluded
- unresolved decisions are closed or explicitly marked not public-facing
- research claims and quotes needed for public material are verified or removed
- clip candidates are cleared, transformed into safe references, or omitted
- public publish status is updated deliberately

## Risks

- Publishing from Everything View would leak raw production notes.
- Treating structured intake as Draft View would preserve classification but not editorial selection.
- Treating arrangement status as lifecycle status would hide the difference between a candidate block list and a recordable episode.
- Treating manuscript block `status` as episode status would conflate prose maturity with production progress.
- Moving too quickly to database state could slow the writing/recording lane before the file model proves itself.
- Locking Episode 5/6 boundaries before Episode 6 recording review could force the wrong structure.

## Guardrails

- Keep the first implementation file-based and read-only.
- Add lifecycle state before adding edit controls.
- Show Everything and Draft as separate subviews, not filters on one undifferentiated list.
- Keep public publishing behind the `Live` gate.
- Preserve existing Book View and Story View behavior while Episode View evolves.
- Do not make Episode View depend on post-Episode-6 split assumptions yet.
- Keep every production state file explicit enough to review in Git diffs.
