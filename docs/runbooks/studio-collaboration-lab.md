# Studio Collaboration Lab Runbook

Date: 2026-05-22

## Purpose

The Studio Collaboration Lab is a local-only, synthetic-only first step toward
simultaneous editing for Charlie and Homer.

It proves that two manuscript-shaped Yjs clients can edit, sync, export, import,
and converge without touching production `/manuscript` behavior.

## Routes

Open:

```text
/manuscript/collaboration-lab
```

The route is intentionally labeled:

- Local collaboration lab
- Synthetic data only
- No server writes
- No production manuscript editing
- No autosave
- No DB, API route, server provider, or deploy

The shared manuscript surface near the top is the intended direction: one long
manuscript stream with semantic span overlays. The Charlie and Homer panels are
scaffolding for CRDT testing.

## Commands

Pure tests:

```bash
pnpm studio:collab:test
```

Checkpoint bridge tests:

```bash
pnpm studio:collab:checkpoint:test
```

Manuscript adapter bridge tests:

```bash
pnpm studio:collab:adapter:test
```

Span semantics tests:

```bash
pnpm studio:collab:span:test
```

Presence tests:

```bash
pnpm studio:collab:presence:test
```

Review note tests:

```bash
pnpm studio:collab:review:test
```

Annotation durability decision tests:

```bash
pnpm studio:collab:annotation:test
```

Annotation event-log replay tests:

```bash
pnpm studio:collab:annotation-log:test
```

Materialized annotation-state tests:

```bash
pnpm studio:collab:annotation-state:test
```

Agentic helper smoke:

```bash
pnpm studio:collab:agentic-smoke
```

The smoke writes:

```text
artifacts/agentic-smoke/studio-collab-lab-report.json
```

Generated reports are ignored and should not be committed.

## Manual Browser Check

1. Open `/manuscript/collaboration-lab`.
2. Edit a synthetic block in the Charlie panel.
3. Edit a different synthetic block in the Homer panel.
4. Add a tag from Charlie.
5. Add a tag from Homer.
6. Click `Two-way sync`.
7. Confirm the convergence summary says the clients match.
8. In span controls, choose a synthetic block, actor, offsets, and label.
9. Click `Apply span tag`.
10. Confirm the shared manuscript surface shows an inline span overlay.
11. Click `Two-way sync`.
12. Confirm the span state says synced.
13. Use the presence controls to set Charlie active on a block.
14. If a span exists, set Homer reviewing the first synthetic span.
15. Confirm the shared manuscript surface shows margin presence cues.
16. Confirm the page says presence is ephemeral, not manuscript content, and
    not saved in checkpoints.
17. Add a span review note.
18. Confirm the note appears as span-anchored margin/side-panel context.
19. Mark the note addressed.
20. Archive the note.
21. Confirm the page says review notes are annotations, not source text, and
    local-only for this sprint.
22. Confirm the annotation durability decision section says no persistence has
    been added.
23. Confirm it recommends an event log for operations and a separate annotation
    store for current state.
24. Confirm it says manual snapshots should not become comment warehouses.
25. In the annotation event-log section, append a create event.
26. Append an edit event.
27. Append an addressed or archive event.
28. Confirm the replay summary updates without changing source text.
29. Confirm the materialized annotation state reference appears.
30. Confirm the page says this is not persistence and not checkpoint metadata.
31. Click `Export synthetic snapshot`.
32. Confirm the JSON appears in the textarea and includes spans, but not
    presence state.
33. Confirm the snapshot JSON does not include review-note body text or
    annotation event bodies.
34. Click `Create synthetic checkpoint`.
35. Confirm the checkpoint summary and checkpoint JSON appear without review
    notes.
36. Click `Import checkpoint back into new synthetic client`.
37. Confirm the imported-client summary appears.
38. Click `Create synthetic Manuscript adapter payload from checkpoint`.
39. Confirm the adapter summary and adapter JSON appear without presence state
    or review-note body text.
40. Click `Validate adapter payload`.
41. Click `Convert adapter back to collaboration client`.
42. Confirm the adapter roundtrip summary appears.
43. Confirm the page says no server writes, no production manuscript editing,
    no autosave, and no localStorage.

Do not paste real manuscript text into this lab.

## What Passing Means

Passing means:

- two synthetic Yjs clients can share one baseline
- edits on different blocks converge
- tags from both clients survive
- export/import snapshot shape works
- checkpoint export/import bridge works
- checkpoint safety flags remain local-only
- synthetic Manuscript adapter payload validates as a safe draft subset
- adapter checkpoint/client roundtrip preserves synthetic blocks text and tags
- synthetic span tags survive sync and checkpoint import
- synthetic spans become Manuscript Desk semantic marks
- synthetic presence can mark active blocks and spans in manuscript margins
- presence is excluded from snapshots checkpoints and adapter payloads
- synthetic review notes can attach to spans
- review notes can be open addressed or archived
- review notes do not mutate source text
- review notes are excluded from snapshots checkpoints and adapter payloads in
  this pass
- annotation durability comparison recommends event-log operations plus a
  separate annotation store for future durable notes
- checkpoint metadata is not the primary recommended note store
- annotation event logs can replay create/edit/status operations into
  materialized annotation state
- partial annotation event replay can model rollback/version references
- annotation event logs stay out of snapshots checkpoints and adapter payloads
- materialized annotation state indexes replayed notes by span block and status
- materialized annotation references keep manual snapshots from embedding notes
- concurrent same-block edits do not crash
- empty synthetic blocks are retained and counted
- known real-content markers are absent
- no server writes happen

Passing does not mean production collaboration exists.

## What Remains Manual Or Future Work

Future real collaboration still needs:

- authenticated room ids
- WebSocket provider
- room access control
- persistence/checkpointing
- manual snapshot checkpoint from collaboration document
- rollback/recovery tests
- browser smoke harness
- Homer trial with synthetic content first

Do not add production `/manuscript` collaboration until those boundaries are
designed and tested.
