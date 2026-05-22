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
8. Click `Export synthetic snapshot`.
9. Confirm the JSON appears in the textarea.
10. Click `Create synthetic checkpoint`.
11. Confirm the checkpoint summary and checkpoint JSON appear.
12. Click `Import checkpoint back into new synthetic client`.
13. Confirm the imported-client summary appears.
14. Click `Create synthetic Manuscript adapter payload from checkpoint`.
15. Confirm the adapter summary and adapter JSON appear.
16. Click `Validate adapter payload`.
17. Click `Convert adapter back to collaboration client`.
18. Confirm the adapter roundtrip summary appears.
19. Confirm the page says no server writes, no production manuscript editing,
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
