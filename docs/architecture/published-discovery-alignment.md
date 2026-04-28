# Published Discovery Alignment

Date: 2026-04-27

This file documents the current split between:
- published page content
- discovery/index metadata

The goal is to make drift visible so future agents know what must be updated together.

## Current Live Inputs

### What currently feeds live page content

For the MDX-backed episodes/doc route:
- `apps/web/content/publish`

Direct evidence:
- `apps/web/source.config.ts` points Fumadocs at `content/publish`
- `apps/web/src/lib/source.ts` loads that source behind the current episodes loader guard
- `apps/web/src/app/episodes/[[...slug]]/page.tsx` renders route content from that guarded source

Important caveat:
- page content is only loaded through the Fumadocs path when the guarded source is enabled
- the guard is a stabilization detail, not a different source of truth

### What currently feeds discovery surfaces

For homepage and library discovery/index behavior:
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

Direct consumers:
- `apps/web/src/components/home/FeaturedEpisode.tsx`
- `apps/web/src/components/home/EpisodeFeed.tsx`
- `apps/web/src/app/library/page.tsx`

What these arrays currently control:
- episode titles
- subtitles
- descriptions
- hrefs
- YouTube IDs
- featured/archive placement
- access/status/views metadata for filtering
- paired reading discovery entries

## The Current Split

Today, the site has two separate published layers:

1. Published page source
- `apps/web/content/publish`

2. Published discovery metadata
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

These are related, but they are not currently generated from one another.

## Where Drift Can Happen

### Episode title or subtitle drift

If an agent updates MDX frontmatter/content assumptions in `content/publish` but does not update `src/lib/site.ts`, then:
- the episode page can say one thing
- the homepage/library cards can say another

### Slug or href drift

If a published MDX page path changes but `href` entries in `src/lib/site.ts` or `src/lib/reading.ts` do not, then:
- discovery cards can link to the wrong route
- discovery can point to pages that do not match the intended published content

### Description drift

If the published page content evolves but the curated description strings stay stale, then:
- `/library`
- homepage episode cards
- featured episode blocks

can all present outdated summaries

### Pairing drift

`pairingId` lives in both the episode and reading metadata arrays.

If one side changes and the other does not:
- the conceptual relationship between episode and paired reading becomes unreliable
- future “related content” or editorial automation work becomes harder

### Visibility/access drift

Access/status/views live in the metadata arrays used by discovery filtering.

If those values change in one place but not the other:
- discovery visibility rules can diverge from route expectations

## What Future Agents Should Update Together

When changing a currently published episode:

Update together:
- the relevant file(s) in `apps/web/content/publish`
- the matching entry in `apps/web/src/lib/site.ts`

If the change affects paired reading:
- the matching entry in `apps/web/src/lib/reading.ts`

When changing a published book/reading page:

Update together:
- the relevant file(s) in `apps/web/content/publish/book`
- the matching entry in `apps/web/src/lib/reading.ts`

When changing a slug or public URL:

Check all of:
- `content/publish`
- `src/lib/site.ts`
- `src/lib/reading.ts`
- any hard-coded internal links in content or components that reference the old route

## What Is And Is Not Authoritative

Authoritative for live MDX page source:
- `apps/web/content/publish`

Authoritative for current discovery/index surfaces:
- `apps/web/src/lib/site.ts`
- `apps/web/src/lib/reading.ts`

Not authoritative for current live discovery or page source:
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

## Lowest-Risk Future Options For Reducing Drift

### Option 1: Keep the split, but document the update checklist

Lowest-risk path:
- keep `publish` as page source
- keep `site.ts` / `reading.ts` as curated discovery metadata
- require agents to update both together

Why it is low risk:
- no behavior change
- preserves current editorial control
- only adds process discipline

### Option 2: Add a small alignment verification script

Possible next step:
- compare discovered slugs in `content/publish` against `href` values in `site.ts` and `reading.ts`
- report mismatches without changing runtime behavior

Why it is still low risk:
- does not change route loading
- only improves detection of drift

### Option 3: Gradually centralize selected discovery fields

Longer-term option:
- derive some discovery fields from published content metadata/frontmatter
- keep only truly curated fields in hand-authored arrays

Why it is not the first move:
- it touches content architecture
- it depends on how much editorial control should remain hand-curated

## Guidance For Future Agents

Before editing published content:
1. Decide whether the task changes page source, discovery metadata, or both.
2. Inspect `content/publish`.
3. Inspect the matching entries in `src/lib/site.ts` and `src/lib/reading.ts`.
4. Keep route content and discovery surfaces aligned in the same pass whenever possible.

If asked to reduce drift, prefer:
- documentation
- verification tooling

before changing content-loading architecture.
