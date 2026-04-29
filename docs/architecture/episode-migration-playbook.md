# Episode Migration Playbook

Date: 2026-04-28

This playbook defines how episode material moves from upstream creative mess into:

- one canonical packet file
- one optional public derivative file

It is written for the repo as it exists today.

## Purpose

The repo now has a canonical episode packet layer, but the real episode material still lives across:

- `apps/web/content/_staging/learning-to-lead/episodes/*`
- `apps/web/content/_inbox/Podcast Year 1/*`
- `apps/web/content/publish/*`

This playbook makes the migration path explicit so Charlie and AI can work in one place without losing source history.

## Packet-To-Public Philosophy

The packet is the engine.
The public page is the window.

That means:

- the packet is where the creative work lives
- the public file is where the current website copy lives
- upstream staging and inbox material remain preserved even after a packet exists
- a public page should be treated as a derivative, not as the primary creative workspace

## What Canonical Means

For episodes, canonical means:

- the file lives at `apps/web/content/episodes/<project>/<creative-slug>/packet.mdx`
- it is the default editing target for Charlie
- it is the default editing target for Codex
- it is allowed to be partial, uneven, and still in progress
- it records provenance and ambiguity instead of hiding them

Canonical does **not** mean:

- the packet is already website-ready
- the packet has no unresolved questions
- the packet slug must match the public website slug

## What Remains Upstream Only

These materials remain upstream source, not canonical packet truth:

- raw inbox folders under `apps/web/content/_inbox/Podcast Year 1/*`
- structured staging research under `apps/web/content/_staging/learning-to-lead/episodes/*/research/*`
- staging extras such as intro songs or title sequences under `extras/*`
- older public legacy files under `apps/web/content/publish/episode-00*.mdx`

Those sources are preserved, cited, and selectively promoted into the packet when useful.

## Migration Rules

1. Create or update the packet first.
2. Preserve upstream files in place.
3. Pull real Scott text into `## Scott Core`.
4. Pull real Charlie text into `## Charlie Section` when it exists.
5. If research exists, summarize it in the packet instead of dumping the entire dossier into the public body.
6. If extras exist, record them in `## Clip Notes` or `## Editorial Notes`.
7. Record every source path in `## Source Provenance`.
8. Record unresolved title, slug, or structural mismatch in `## Ambiguities / Unresolved Questions`.
9. Do not touch `apps/web/content/publish/*` unless the task is explicitly a public-derivative sync or publication pass.

## Provenance Rules

Every packet should record:

- staging source paths
- inbox source paths
- current public semantic file path
- current numbered legacy public file path when one exists
- research dossier path when one exists
- extras path when one exists

Provenance should be explicit and boring.
Do not rely on memory or chat history.

## Ambiguity Handling Rules

When the repo evidence is not clean:

- do not guess silently
- do not flatten two distinct titles into one without a note
- do not discard a longer draft because a shorter public page already exists
- do not assume a public semantic slug and an upstream creative title are the same thing

Instead:

- keep the packet slug tied to the strongest upstream creative title
- keep the current website slug in frontmatter via `publishSlug`
- log the mismatch in `## Ambiguities / Unresolved Questions`
- lower confidence in the status map if needed

## Preserving Alternates

When alternates matter:

- preserve the upstream alternate in `_staging` or `_inbox`
- cite it in the packet provenance
- if a later pass needs a local alternate beside the packet, place it under:
  - `apps/web/content/episodes/<project>/<slug>/alternates/`

Do not merge distinct alternates just to make the packet look tidy.

## Marking Incomplete Sections

If content is missing, say so directly.

Preferred pattern:

```md
## Charlie Section

> Missing in current upstream source.
>
> No dedicated Charlie draft was found in `_staging` for this episode.
> See editorial notes and provenance below.
```

For partial research or clip material:

- say what exists
- say what does not
- keep the packet honest

## Manual Packet-To-Public Checklist

Use this checklist before touching `apps/web/content/publish/*`.

1. Is the packet the most current working truth?
2. Is the Scott section stable enough for a public excerpt or public body?
3. Is the Charlie section approved, or intentionally omitted with a clear reason?
4. Are major title or slug mismatches documented?
5. Are provenance notes present?
6. Are research-heavy or production-only notes separated from public-facing prose?
7. Is there a clear answer to what the public derivative should show now?
8. If the public page changes, were related discovery files also checked?
   - `apps/web/src/lib/site.ts`
   - `apps/web/src/lib/reading.ts`

If the answer to any of the first six is no, the packet is not ready for a public-derivative sync.

## Recommended Editorial Workflow For Charlie + AI Collaboration

### Where Charlie writes

Charlie should write in:

- `apps/web/content/episodes/<project>/<creative-slug>/packet.mdx`

He should treat the packet as the default home for:

- real prose
- partial prose
- section reshaping
- notes to self
- public-vs-private editorial decisions

### Where AI writes

AI should also write in the packet by default.

AI should touch upstream `_staging` and `_inbox` only when:

- gathering source material
- citing provenance
- reconciling ambiguity
- migrating a missing section into the packet

### When publish files should be touched

Touch `apps/web/content/publish/*` only when:

- the packet has reached a clear editorial shape
- the public derivative goal is explicit
- the change is about what the website should show now

### When publish files should not be touched

Do **not** touch `publish` when:

- the packet is still collecting source material
- title or slug decisions remain unsettled
- Charlie text is still rough or incomplete
- research has not been interpreted yet
- the work is still mainly editorial rather than public-facing

### How unfinished content lives safely

Unfinished content is allowed to live safely in the packet when it is:

- clearly labeled
- kept in the right section
- backed by provenance
- not confused with the current public derivative

### How a packet becomes ready for public derivative creation

A packet is ready when:

- the creative structure is stable
- Scott and Charlie sections are at least intentionally shaped
- ambiguity is recorded and either resolved or consciously deferred
- provenance is complete
- the team can point to the packet and say, "yes, this is the working truth"

At that point, a separate pass can:

- update the public semantic file in `apps/web/content/publish/*`
- update discovery metadata if needed
- leave the packet intact as the long-term creative source

## Current Repo-Specific Rule

For the first three Learning to Lead episodes:

- creative canonical packets follow the upstream creative slugs:
  - `pilot`
  - `its-a-metaphor`
  - `chub-and-jack`
- current public website files follow different semantic slugs:
  - `write-it-down`
  - `look-for-lessons`
  - `know-where-you-came-from`

That mismatch is real repo truth.
It should be documented, not hidden.
