# Episode Content System

Date: 2026-04-28

This document defines the canonical episode content architecture for the Living Book / Show Engine as the repo exists today.

## Problem Statement

Episode material currently lives in several different layers that serve different purposes:

- website-facing published MDX in `apps/web/content/publish`
- structured staging folders in `apps/web/content/_staging/learning-to-lead/episodes/*`
- raw editorial intake in `apps/web/content/_inbox/Podcast Year 1/*`

That split is normal creative evolution, but it creates one major problem: there is no single obvious episode working file that Charlie can open and treat as the canonical place where the episode lives.

The current website-facing `publish/*.mdx` files are too constrained to serve as the long-term creative source of truth because they are shaped around the public route. The staging and inbox trees contain richer working material, but the canonical path is not obvious.

## Goals

- give every episode one obvious canonical working file
- keep the source of truth in MDX
- support manual editing and AI editing in the same file
- make unfinished, partial, and messy content acceptable
- preserve existing writing, alternates, and legacy versions
- keep current website/content behavior intact while the engine matures
- make future migration from packet to website content explicit instead of implicit

## Non-Goals

- redesign the public episode page
- replace the current Fumadocs route in this pass
- auto-generate website pages from packet files in this pass
- collapse all historical drafts into a single polished version
- create a database-backed editorial system
- solve books, quotes, research, or courses beyond keeping the door open for them

## Audit Findings

### Current website-facing episode source

Repo evidence shows the current website-facing episode MDX lives in:

- `apps/web/content/publish/write-it-down.mdx`
- `apps/web/content/publish/look-for-lessons.mdx`
- `apps/web/content/publish/know-where-you-came-from.mdx`

Those files are what the current `/episodes/*` route is set up to render when the guarded Fumadocs loader is enabled.

### Legacy public alternates still preserved in `publish`

These older episode files still exist:

- `apps/web/content/publish/episode-001.mdx`
- `apps/web/content/publish/episode-002.mdx`
- `apps/web/content/publish/episode-003.mdx`

They overlap with the semantic-slug pages above and should be treated as legacy or alternate public forms, not the future canonical working location.

### Structured staging already hints at the right creative model

The `_staging` tree already contains packet-like episode folders such as:

- `apps/web/content/_staging/learning-to-lead/episodes/pilot`
- `apps/web/content/_staging/learning-to-lead/episodes/its-a-metaphor`
- `apps/web/content/_staging/learning-to-lead/episodes/chub-and-jack`

Observed contents include:

- `manifest.json`
- `scott_main.md`
- `charlie.md`
- `research/research.md`
- `extras/*`

This is closer to the actual creative workflow than the public route files, but it is still split across multiple files and is not yet the obvious canonical authoring target.

### Raw intake remains intentionally messy

The `_inbox` tree contains the raw creative history:

- numbered episode folders
- separate Scott and Charlie files
- alternates
- research files
- older chapter drafts

This is valuable source material, but it is not a good canonical working surface.

## Canonical Decision

The canonical episode working path is now:

- `apps/web/content/episodes/<project>/<creative-slug>/packet.mdx`

For the current Learning to Lead / High Ground Odyssey episodes, the validated creative packet files are:

- `apps/web/content/episodes/learning-to-lead/pilot/packet.mdx`
- `apps/web/content/episodes/learning-to-lead/its-a-metaphor/packet.mdx`
- `apps/web/content/episodes/learning-to-lead/chub-and-jack/packet.mdx`

Important clarification:

- the creative packet slug can differ from the public website slug
- for the first three episodes, the creative packets follow the upstream editorial titles
- the current public derivative files still use the semantic public slugs:
  - `write-it-down`
  - `look-for-lessons`
  - `know-where-you-came-from`

Also note:

- the earlier first-pass packet files under:
  - `apps/web/content/episodes/learning-to-lead/write-it-down/packet.mdx`
  - `apps/web/content/episodes/learning-to-lead/look-for-lessons/packet.mdx`
  - `apps/web/content/episodes/learning-to-lead/know-where-you-came-from/packet.mdx`
- are preserved as provisional bridge packets from the first architecture pass
- they should not be treated as the validated creative canonical paths going forward

Why this is the canonical choice:

- it gives Charlie one obvious file per episode
- it is independent from the public website route shape
- it keeps creative work in MDX instead of inventing a new system
- it allows the public `publish` layer to remain in place during migration
- it leaves room for adjacent alternates and archived drafts later without changing the main authoring surface

## Folder Structure

Current canonical pattern:

```text
apps/web/content/
  episodes/
    _templates/
      episode-packet.mdx
    learning-to-lead/
      pilot/
        packet.mdx
      its-a-metaphor/
        packet.mdx
      chub-and-jack/
        packet.mdx
```

Reserved expansion pattern when needed later:

```text
apps/web/content/episodes/<project>/<slug>/
  packet.mdx
  alternates/
    <label>.mdx
  archive/
    <label>.mdx
```

Rules:

- `packet.mdx` is always the canonical working file
- `alternates/` is optional and only used when a genuine alternate draft must be preserved next to the packet
- `archive/` is optional and only used after an editorial decision to retire local variants without deleting them

## Naming Rules

### Folder names

Use semantic kebab-case slugs.

Good:

- `pilot`
- `its-a-metaphor`
- `chub-and-jack`

Do not use numbered canonical folder names such as:

- `episode-001`
- `episode-002`
- `episode-003`

Episode numbering still matters, but it belongs in frontmatter metadata, not in the canonical working filename.

Creative-packet rule:

- prefer the strongest upstream editorial slug for the packet folder
- keep the current website-facing slug in frontmatter via `publishSlug`
- do not force the packet slug to match the public slug when the repo evidence says the creative material has a different long-standing title

### File names

The canonical working file name is always:

- `packet.mdx`

This is intentionally explicit. `index.mdx` would be more route-friendly, but less human-obvious. The packet is the asset, so the filename should say so.

### Alternate draft names

When alternates are needed later, use descriptive labels rather than opaque numbers.

Examples:

- `alternates/charlie-shorter-pass.mdx`
- `alternates/scott-longform-pass.mdx`
- `alternates/2026-04-28-research-heavy-pass.mdx`

## Content Model

Each canonical packet should contain these sections in one MDX file:

1. frontmatter
2. `## Episode Framing`
3. `## Scott Core`
4. `## Charlie Section`
5. `## Episode Notes`
6. `## Clip Ideas`
7. `## Discussion Questions`
8. `## Production Notes`
9. `## References / Source Map`

This keeps the writing, notes, and production context together without requiring a more complex system.

## Frontmatter Schema

Use this schema for canonical episode packets.

Required fields:

- `title`: public-facing or working episode title
- `slug`: semantic canonical episode slug
- `project`: current project bucket, for example `learning-to-lead`
- `series`: current series/show bucket, for example `high-ground-odyssey`
- `episodeNumber`: numeric order inside the project/series
- `workflowStatus`: editorial working state
- `publicationStatus`: whether a public derivative exists yet
- `publishSlug`: current website-facing semantic slug when one exists

Useful optional fields:

- `legacySlugs`: older numbered or alternate public slugs still preserved elsewhere
- `pairedReadingSlug`: paired book section slug
- `pairedReadingTitle`: paired book section title
- `youtube`: episode video identifier when known
- `description`: short summary of the episode packet

Recommended example:

```yaml
---
title: "Write It Down"
slug: "pilot"
project: "learning-to-lead"
series: "high-ground-odyssey"
episodeNumber: 1
workflowStatus: "draft"
publicationStatus: "published"
publicTitle: "Write It Down"
publishSlug: "write-it-down"
legacySlugs:
  - "episode-001"
pairedReadingSlug: "preface"
pairedReadingTitle: "Preface"
youtube: "96LN__TA-T8"
description: "Scott and Charlie open the project by explaining why a life is worth writing down and why legacy begins with telling the truth about your own story."
---
```

## Workflow States

### `workflowStatus`

Use one of:

- `seed`: packet exists, but sections are mostly placeholders
- `draft`: real working text exists, but the packet is still in progress
- `review`: content exists and needs editorial review or reconciliation
- `ready`: packet is stable enough to drive a public derivative or production handoff
- `archived`: packet has been intentionally retired from active use

### `publicationStatus`

Use one of:

- `unpublished`: no public derivative exists yet
- `published`: a public-facing derivative already exists
- `legacy`: only older public forms exist and need migration or clarification
- `retired`: public exposure has been intentionally removed

The two-state split matters because a packet can be:

- editorially incomplete
- but still mapped to an already published website page

That is the current reality for the starter episodes.

## Canonical, Alternate, Legacy, And Archive Policy

### Canonical

Canonical means:

- the file lives at `apps/web/content/episodes/<project>/<slug>/packet.mdx`
- it is the primary file Charlie should edit
- it is the primary file Codex should edit in future content passes

### Current public derivative

Current website-facing episode files remain in:

- `apps/web/content/publish/<semantic-slug>.mdx`

Those files are not deleted in this pass. They remain the current public derivative layer until the site is explicitly migrated.

### Legacy public alternate

Older public variants such as:

- `apps/web/content/publish/episode-001.mdx`
- `apps/web/content/publish/episode-002.mdx`
- `apps/web/content/publish/episode-003.mdx`

remain preserved as legacy/alternate public forms.

They should not be treated as the canonical episode working path.

### Alternates

When multiple live candidate drafts exist for the same episode, keep the canonical packet stable and preserve the true alternate in:

- `apps/web/content/episodes/<project>/<slug>/alternates/`

Do not overwrite the canonical packet with a different voice or structure just because a competing pass exists.

### Archive

Archive is only for material that has been intentionally retired from active editing.

Do not auto-archive just because a file feels old.

## Linking Conventions

Inside packet frontmatter and notes:

- use `publishSlug` for the current public episode route target
- use `pairedReadingSlug` for the current paired reading target
- refer to current public routes as `/episodes/<slug>` and `/episodes/book/<slug>`

Inside `## References / Source Map`:

- use repo-relative file paths in backticks when identifying source material
- be explicit about legacy paths when they still matter

This keeps the packet legible to both humans and AI.

## Human + AI Collaboration Rules

- keep the section headings stable
- add new material inside the existing section it belongs to
- if a section is unfinished, leave a direct placeholder instead of hiding the absence
- do not delete meaningful draft text just to tidy the file
- if two substantially different versions both matter, preserve one in `alternates/` rather than blending them thoughtlessly
- use `## Episode Notes` to record open editorial questions, not to bury them
- use `## References / Source Map` to preserve where important material came from

The core principle is simple:

Charlie should not have to guess where the real work is.

## How Unfinished Content Should Look

Unfinished is acceptable.

Preferred pattern:

```md
## Charlie Section

> Draft placeholder.
>
> Charlie's longer response has not been reconciled into this packet yet.
> See notes below and preserve upstream drafts until this section is ready.
```

Avoid fake completeness. Empty or partial sections are better than invented polish.

## Migration Rules

When creating or updating a canonical packet from existing material:

1. keep the current public derivative file in `publish`
2. preserve any numbered or alternate public form in place unless there is an explicit redirect/archive task
3. pull the best current Scott material from `_staging` or `_inbox`
4. pull the best current Charlie material from `_staging` or `_inbox`
5. record the current public derivative and legacy sources in `## References / Source Map`
6. do not assume all older versions are safe to delete

For the current repo, that means:

- `publish` stays live/public-facing
- `episodes/.../packet.mdx` becomes canonical creative truth
- `_staging` and `_inbox` remain preserved upstream source material

## Example: One Canonical Episode Packet

For episode 1, the validated creative packet is:

- `apps/web/content/episodes/learning-to-lead/pilot/packet.mdx`

That packet currently holds:

- canonical metadata
- an episode framing section
- Scott core text seeded from the richer staged/raw material
- Charlie's current draft section
- notes, clips, discussion prompts, production notes, and source references

The current public derivative still exists separately at:

- `apps/web/content/publish/write-it-down.mdx`

This is deliberate. The packet is the engine. The website file is the current window.

## Why This Architecture Was Chosen

### Chosen over continuing to author directly in `publish`

`publish` is still a route-facing website layer. It is too coupled to current public presentation constraints and too easy to confuse with discovery/routing concerns.

### Chosen over making `_staging` canonical

`_staging` already has useful structure, but it is split across multiple files and manifests. Charlie asked for one file that feels like the place where the work lives.

### Chosen over staying in `_inbox`

`_inbox` is valuable raw material, but it is intentionally messy. It is not the right canonical editing surface.

### Chosen over a more abstract system

A database model, JSON manifest layer, or custom editing UI would all be premature here. One packet MDX file per episode is sufficient and durable.

### Chosen over `index.mdx`

`packet.mdx` is less route-native but more human-readable. That matters more for the current mission.

## What Future Agents Should Assume

Assume:

- `apps/web/content/episodes/<project>/<slug>/packet.mdx` is the canonical episode working file
- `apps/web/content/publish/*.mdx` is still the current public derivative layer
- numbered episode files in `publish` are preserved legacy/alternate public forms
- `_staging` and `_inbox` are upstream material, not the canonical destination

Do not assume:

- that the current website route already consumes packet files
- that older public files are safe to delete
- that a partial packet is a failure
