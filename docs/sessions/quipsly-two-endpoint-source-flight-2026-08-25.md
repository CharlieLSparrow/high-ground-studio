# Quipsly two-endpoint retained-source flight — 2026-08-25

## Outcome

The retained local coaching flight passed with two independently authenticated browser participants connected through LiveKit. A coordinated recording directive produced two verified participant masters, automatically materialized both recordings into the Session project, served authenticated byte ranges from both sources, and completed checksum-bound transcripts for both sources.

This is regression evidence, not human acceptance. It uses retained `.test` identities, Chromium fake media devices, local PostgreSQL, local media storage, a local LiveKit server, and the local Whisper worker.

## Operated evidence

- Room: `retained-browser-live-room-20260804`
- Participants connected: 2
- Coordinated endpoint boundary receipts: 4 (`STARTED` and `STOPPED` for each participant)
- Verified independent participant sources: 2
- Source overlap: 6,051 ms
- Source durations: 6.176 s and 6.218 s
- Duration provenance: provisional `recorded-boundary-clock`, explicitly marked for replacement after media decode
- Studio source/materialization records: 2 sources, 2 media assets, 2 project attachments
- Authenticated playback: beginning, middle, and ending byte ranges returned `206` for each source
- Source-bound transcripts: 2 completed with matching source SHA-256 and at least one segment each
- Automatic alignment suggestion: exact newest source from each participant, coach/host-preferred spine, capture-clock authority, no acoustic processing or edit applied
- Comparative source overview: responsive timing envelopes, shared-window shading, and complete-decode waveforms when available; desktop and 390 px mobile visual checks have no horizontal overflow
- Saved consent restored after re-entry: passed
- Post-call recorder remained mounted and safe to close: passed

## Commands

```bash
node --test scripts/quipsly-mobile-capture-ingestion-idempotency.test.mjs
pnpm --dir apps/quipsly exec jest src/components/live-session-room.test.tsx --runInBand
pnpm --dir apps/quipsly typecheck
QUIPSLY_LOCAL_BASE_URL=http://127.0.0.1:3012 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
pnpm quipsly:retained:browser-source
QUIPSLY_LOCAL_BASE_URL=http://127.0.0.1:3012 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
pnpm quipsly:local:live-room
```

## Important limits

- This pass proves browser-to-browser call transport and two independent local audio masters; it does not prove iPhone capture parity.
- The fake media sources do not prove natural speech quality, speaker attribution quality, or camera capture.
- Provider/cloud recording was intentionally not started. The production truth is the independently retained participant masters.
- The sources are now eligible for alignment planning because duration is canonical, but this pass does not claim an acoustic sync proposal or an approved edit alignment.
- Quipsly now displays the cost-free capture-clock suggestion before the explicit waveform-analysis action. The suggestion remains review-only and cannot silently become timeline placement.
- Human hands-off acceptance remains separate and must use a fresh real coach/client pair without fixture knowledge.
