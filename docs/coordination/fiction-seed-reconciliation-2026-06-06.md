# Fiction seed reconciliation - 2026-06-06

## Result

Charlie's private comic seed is now organized as a local canonical packet and projected into Quipsly DB records.

Canonical local source:

`content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/`

Quipsly projection:

- Workspace: `charlielsparrow-gmail-com-workspace`
- Project: `charlie-melissa-fiction-lab`
- Storyboard ID from import run: `cmq2he75u00022c8ooo4wpdmj`
- Storyboard frames: 128
- Story bible entities: 16

## What Codex reconciled

- Kept `AG-Fiction-Tools` private packet viewer, but hardened access through the shared `canAccessPrivateFiction()` helper.
- Added a Quipsly-native scroll preview route instead of keeping the `apps/web` experiment as the active surface.
- Kept the `AG-Storyboard` importer concept, but replaced the wrong-app Prisma path with a Quipsly-safe importer.
- Added a stable Node importer at `scripts/import-comic-storyboard.mjs`.
- Removed the brittle TypeScript importer runner.

## Idempotency proof

The stable importer was run after the initial DB projection. It reported:

- `createdFrames: 0`
- `updatedFrames: 128`
- `createdEntities: 0`
- `updatedEntities: 16`
- `skippedEntities: 0`

This is the desired behavior. Running it again should refresh text/metadata while preserving existing frame images.

## Architecture rule

The seed packet is canon for now. DB rows are editable Quipsly projections. Public scroll/comic outputs should eventually come from compiled publish packets, not raw private seed files.

## Next work

- Add a first-class fiction project landing page for private/customer fiction nests.
- Connect the imported storyboard to a usable `charlie-melissa-fiction-lab` builder selection state.
- Add act grouping/virtualization before treating 128-frame storyboards as normal UI load.
- Let assistant actions inspect the seed/storyboard/story-bible context, but only propose changes through ledgers.
- Wait for `AG-Data-Architecture` to file its first report before broad schema changes.
