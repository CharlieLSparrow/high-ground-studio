# HGO Visual Episode Page Direction

Date: 2026-05-21

High Ground Odyssey episode pages should become visual-heavy, story-forward public projections from Studio. They should not be treated as sacred descendants of the current episode pages, and Studio should not be bent around the old HGO publishing workflow.

## Product Position

Studio is the private editorial cockpit. HGO is the public projection surface.

That means:

- Studio owns manuscript editing, metadata, structure, quote review, recording handoff, manual snapshots, and future collaboration.
- HGO receives approved projections from Studio or from a future projection package.
- HGO should not become the source editing workflow.
- HGO should not expose private editorial metadata directly.
- HGO pages should help listeners understand the episode before, during, and after listening.

## Why This Is Not A Google Docs Clone

Studio's advantage is not rich-text editing by itself. The advantage is a layered manuscript model:

- one long anxiety-lowering manuscript wall,
- author marks,
- semantic meaning tags,
- chapter/episode/section structure regions,
- cited quotation tracking,
- quote review metadata,
- Recording / Reading mode,
- manual server snapshots,
- future collaboration that understands the manuscript model.

HGO should use those layers to create public pages that feel intentionally produced, not manually reposted.

## Recommended Page Sections

### 1. Cinematic Hero

Purpose:
- Make the episode feel like a story object immediately.
- Establish title, episode number, subtitle, series context, and a visual motif.

Projection inputs:
- title,
- subtitle,
- episode number,
- hero visual descriptor,
- key themes,
- public-safe status badges.

Direction:
- Large typography.
- Art-directed visual field.
- Hint of narrative stakes.
- Avoid generic header card layouts.

### 2. Episode Audio / Player Block

Purpose:
- Make listening obvious.
- Show runtime, recording status, and platform links when available.

Projection inputs:
- audio URL or disabled placeholder,
- duration,
- listen links,
- recording/publish status.

Direction:
- Treat player as a major content object, not a tiny embed after a blog title.
- If audio is not available, show a deliberate placeholder state.

### 3. Core Thesis / Promise

Purpose:
- Answer why this episode exists.
- Give the listener a clear reason to care before the transcript/details.

Projection inputs:
- episode summary,
- Studio semantic "insight" or "story" highlights,
- editorial thesis copy.

Direction:
- Short, confident, human.
- More like a promise than a blog excerpt.

### 4. Chapter / Episode Beats

Purpose:
- Turn Studio structure regions into a public map.

Projection inputs:
- chapter/book regions,
- episode regions,
- section regions,
- block summaries.

Direction:
- Beat cards with labels, summaries, and timing placeholders when available.
- Make long material scannable without flattening it.

### 5. Homer / Charlie Voice Cards

Purpose:
- Show the human texture of the episode.
- Project authorship metadata without pretending it is legal authorship truth.

Projection inputs:
- author marks,
- author contribution summaries,
- selected public-safe voice summaries.

Direction:
- "Homer's thread" and "Charlie's bridge" style cards.
- Keep voice metadata warm and editorial, not forensic.

### 6. Pull Quotes

Purpose:
- Highlight memorable lines without making citation status invisible.

Projection inputs:
- semantic highlights,
- cited quotations,
- quote review metadata,
- rights/citation public status.

Direction:
- Quote cards should show whether a quoted/source-backed line is cleared, needs caution, or is synthetic/placeholder.
- Do not ship unsourced quote pages.

### 7. Cited / Source Notes

Purpose:
- Build trust.
- Separate storytelling from source accountability.

Projection inputs:
- cited quotation metadata,
- source title,
- locator,
- citation text,
- public-safe review status.

Direction:
- Source notes should be visible but not dominate the story.
- Private editor notes should be filtered before public projection.

### 8. Related Book Chapter

Purpose:
- Connect the public episode to the book/manuscript arc without making the public page the manuscript source.

Projection inputs:
- related book/chapter labels,
- chapter summaries,
- public reading paths when approved.

Direction:
- Use as contextual navigation, not a content dump.

### 9. Recording / Backstage Notes

Purpose:
- Preserve the recording handoff value that Studio creates.
- Give listeners a glimpse of preparation when appropriate.

Projection inputs:
- recording handoff notes,
- episode beats,
- public-safe production notes.

Direction:
- Short notes, production credits, and "watch for" items.
- No private draft anxiety or internal checklist leakage.

### 10. Next Episode / Series Navigation

Purpose:
- Move people through a story arc, not just a date archive.

Projection inputs:
- previous/next episode,
- related themes,
- series arc,
- related book chapters.

Direction:
- Navigation should feel curated.
- Avoid generic "older/newer posts" as the main path.

## What To Avoid

- Generic blog layout.
- Plain chronological archive feeling.
- Walls of unstyled text.
- Private draft metadata leakage.
- Quote pages without citation state.
- Treating MDX as the source of truth for future Studio-driven pages.
- Hiding important audio/listening controls below several screens of copy.
- Keeping a weak design solely because it exists.

## Public Projection Boundary

Future production should introduce a projection contract rather than coupling HGO directly to Studio internals.

Possible projection package:

- episode identity,
- hero visual descriptor or approved media,
- summary and thesis,
- structure/beat cards,
- voice summaries,
- pull quotes,
- source notes,
- audio/player metadata,
- related chapter/episode navigation,
- public-safe publish status.

This contract can be generated by Studio later. The current prototype uses synthetic projection data only to prove layout direction.

## Near-Term Build Direction

1. Prototype with synthetic data.
2. Validate visual direction on desktop and mobile.
3. Define a typed public projection contract.
4. Add a Studio export path that emits projection JSON or Markdown.
5. Replace the existing episode shell only after a public projection path is proven.
6. Keep old MDX routes working until a migration plan exists.

## Later Questions

- Does HGO remain inside `apps/web`, or does a future public projection app split off?
- What media pipeline creates/approves hero visuals?
- How does citation review state map to public-safe source language?
- Should transcripts be first-class pages or sections inside episode pages?
- How should related book chapter pages be generated?
- How do member/support CTAs fit without making story pages feel like ads?
