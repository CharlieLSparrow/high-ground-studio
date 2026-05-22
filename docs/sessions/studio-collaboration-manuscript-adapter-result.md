# Studio Collaboration Manuscript Adapter Result

Date: 2026-05-22

## Summary

Added a synthetic-only adapter bridge between the local Yjs collaboration
checkpoint contract and the Manuscript Desk draft model.

New pure helper:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts`

New adapter version:

- `studio-collaboration-manuscript-adapter-v1`

The adapter proves this roundtrip:

```text
Yjs collaboration checkpoint
-> synthetic Manuscript Desk adapter payload
-> valid synthetic ManuscriptDraft subset
-> collaboration checkpoint/client
```

## Manuscript Desk Subset Adapted

The current production Manuscript Desk draft shape is a `ManuscriptDraft`
envelope with title, source metadata, import summary, structure regions, quote
reviews, editor JSON, author/color settings, and last-updated metadata.

This pass adapts only a safe synthetic subset:

- title
- ordered paragraph blocks
- block ids
- text
- synthetic collaboration tags
- synthetic author marks
- paragraph provenance attrs
- empty `structureRegions`
- empty `quoteReviews`
- `sourceFileName: null`
- `importSummary: null`

The adapter is honest about the remaining gaps and does not claim to be a
production import format.

## Tests

Added:

- `scripts/studio-collaboration-manuscript-adapter.test.mjs`
- `pnpm studio:collab:adapter:test`

Coverage:

- checkpoint to synthetic Manuscript adapter payload
- valid `ManuscriptDraft` subset validation
- block count survival
- text survival
- tag survival
- empty block survival
- forbidden real-content and secret marker rejection
- unsafe production flag rejection
- adapter payload back to collaboration checkpoint/client
- roundtripped summary match
- imported client edits do not mutate the original payload
- no server-write flags

## UI

Updated `/manuscript/collaboration-lab` with a Manuscript adapter bridge
section:

- create synthetic Manuscript adapter payload from checkpoint
- validate adapter payload
- convert adapter payload back to collaboration checkpoint/client
- show adapter summary
- show adapter JSON
- show roundtrip summary
- clear adapter state

The UI copy states that the adapter is synthetic-only, not a production
Manuscript Desk import, does not write server state, does not touch manual
snapshots, and does not autosave.

## Agentic Smoke

Extended:

- `pnpm studio:collab:agentic-smoke`

The smoke now reports:

- `adapterRoundtrip`
- `adapterVersion`
- `adapterBlockCount`
- `adapterTagCount`
- `adapterRoundtripMatches`
- `noProductionManuscriptEditing`
- `noServerWrites`
- `noLocalStorage`

## Safety Boundary

This pass did not:

- use real manuscript text
- use real HGO content
- alter production `/manuscript` save/load behavior
- enable real simultaneous editing
- write server routes
- call snapshot APIs
- save to localStorage
- add autosave
- add a Yjs provider server
- touch DB/schema or run `db:push`
- mutate Cloud SQL
- deploy
- change Cloud Run, DNS, OAuth, billing, secrets, or IAM
- remove or mutate manual snapshots
- add public publishing
