# High Ground Odyssey Public Publishing Flow

## Current truth

HighGroundOdyssey.com public episode pages are packet-fed.

- Public route: `apps/web/src/app/episodes/[[...slug]]/page.tsx`
- Packet store: `apps/web/src/lib/hgo/public-episode-store.ts`
- Bundled packet files: `apps/web/content/publish/hgo-episodes/*.json`
- Public packet contract: `apps/web/src/lib/hgo/public-episode-packet.ts`
- Quipsly/Nest should prepare or update public-safe episode packets, not expose raw private manuscript/editor state directly.

## How a page renders

1. The episode route receives `/episodes/<slug>`.
2. `readHgoPublicEpisodePacket(slug)` tries a published DB candidate first.
3. If DB does not provide a packet, it reads checked-in packet JSON from `apps/web/content/publish/hgo-episodes`.
4. If that fails, it falls back to bundled imports for starter episodes 1-3.
5. The page renders the video embed first when `packet.media.youtubeId` exists.
6. Audio, Patreon/support CTA, show notes, quotes, essay/body, and final CTA render below the hero.

## Why this matters

The public site should only know about public-safe packets. A packet can include title, summary, hero image, YouTube ID, show notes, quotes, essay text, and provenance. It should not include private notes, raw assistant messages, unapproved research, or unpublished manuscript clutter.

## Human editing workflow

For now, edit the work in Quipsly/Nest, then publish/update the packet for HGO. If a public episode page looks wrong, check in this order:

1. Does the packet JSON have the right `slug`, `title`, `summary`, `media.youtubeId`, and `media.heroImageUrl`?
2. Does the packet include public-safe show notes and body text?
3. Does `episodes-index.json` include the slug if the page should appear in lists?
4. Was the site rebuilt/deployed after changing checked-in packet JSON?
5. If the DB candidate exists, is it overriding the checked-in packet?

## Product direction

Quipsly publishing should eventually show destination state per packet:

- High Ground Odyssey episode page
- Podcast RSS episode
- YouTube metadata/upload package
- Patreon post package
- Social clips/posts
- Quote/QuipLore projections

Each destination gets its own status: Draft, Packet ready, Queued, Published, Held, Needs review, or Failed.
