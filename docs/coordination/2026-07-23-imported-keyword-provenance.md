# Imported keyword provenance and promotion

**Date:** 2026-07-23
**Status:** Implemented and locally dogfooded
**Scope:** Nest research restore, Work vocabulary, canonical search

## Product boundary

Quipsly now keeps three sources of vocabulary distinct:

1. Human-authored iPhone and Nest tags are intentional canonical `StudioTag` records.
2. Portable Quipsly export tags remain canonical during restore because the exporter already captured an intentional vocabulary decision.
3. External `metadataJson.keywords` remain `StudioTagCandidate` suggestions until an Owner or Editor explicitly promotes them.

Imported suggestions are not returned by canonical workspace search and do not appear in task or goal tag pickers. Rejection preserves the source evidence without creating a tag. Reopen returns a rejected suggestion to review. Promotion either creates one canonical tag or safely resolves an exact canonical name/alias; ambiguous slugs and archived matches fail closed.

## Persistence and audit

- `StudioTagCandidate` is the current review projection, unique by Nest and normalized slug.
- `StudioTagCandidateEvidence` is append-only, fingerprinted source evidence. Exact re-imports are idempotent.
- `StudioTagCandidateRevision` is the append-only promote/reject/reopen decision history.
- Promotion also appends an `imported-keyword-promoted` `StudioTagRevision` linking the canonical tag to the candidate receipt and exact evidence IDs.
- Every review mutation rechecks an active Owner/Editor grant inside a serializable transaction and uses the candidate `updatedAt` as an optimistic concurrency boundary.
- No review operation mutates an imported source or creates external side effects.

Migration `20260723152000_add_tag_import_candidates` is additive and was applied to the local PostgreSQL database. Prisma reports all 20 migrations current.

## Persisted dogfood receipt

The QA Home Nest exercised the complete boundary with `Imported proof keyword 20260723T1645Z`:

- Project: `cmrrtgjc60004ghxlisln79wq`
- Candidate: `cmrxg9rh000005dxljydx7ivu`
- Evidence: `cmrxg9rh700015dxll9uu3mvy`
- Candidate promotion receipt: `cmrxg9rip00035dxldybz3kh7`
- Canonical tag: `cmrxg9rik00025dxlyg35jctj`
- Canonical tag revision: `cmrxg9rir00045dxlit3ou0af`

Canonical workspace search returned no tag before promotion and the exact persisted tag afterward.

## Verification

- Prisma schema validation and client generation passed.
- Local migration deploy and migration status passed.
- Quipsly TypeScript typecheck passed.
- 47 focused Work, search, restore-route, and tag tests passed; two opt-in relational tests were skipped in the default lane.
- Four local PostgreSQL integration tests passed, including restore idempotency and candidate promotion/rejection.
- One persisted QA dogfood test passed.
- The production Next.js build completed. The pre-existing broad NFT file-tracing warning remains.
- The restarted local Nest returned HTTP 200 for `/work`.

The browser review flow is covered by semantic interaction tests, including the disabled promotion control until explicit confirmation. A fresh authenticated visible-browser pass remains required when the local browser binding is available.
