# Studio Collaboration Annotation Durability Result

Date: 2026-05-22

## Summary

Added a synthetic-only annotation durability decision layer for Studio
collaboration review notes. The pass compares three future storage approaches:

- annotation event log
- checkpoint metadata
- separate annotation store

The recommendation is to use an annotation event log for operations/audit trail
and a separate annotation store for current review state. Checkpoint metadata is
explicitly not recommended as the primary store because it would bloat rollback
artifacts and blur the meaning of manual snapshots.

## Code

Added:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-annotation-durability.ts`
- `scripts/studio-collaboration-annotation-durability.test.mjs`

Updated:

- `package.json`
- `scripts/agentic-studio-collab-lab-smoke.mjs`
- `/manuscript/collaboration-lab` UI

## Safety Boundary

This sprint did not add persistence. Review notes remain React-state-only in the
lab. Production `/manuscript` save/load behavior is untouched. Manual snapshots
remain separate rollback anchors.

No real manuscript text, real HGO content, server routes, snapshot API calls,
localStorage, autosave, Yjs provider server, DB/schema, Cloud SQL, deployment,
Cloud Run/DNS/OAuth/billing/secrets/IAM changes, manual snapshot mutation, or
public publishing were introduced.
