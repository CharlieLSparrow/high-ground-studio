# Quipsly Publishing Runway Truth Boundary

Date: 2026-07-18

Route: `/publishing`

## Current Contract

The Publishing Runway is a read-only view over persisted production-core records. It does not simulate connected providers, uploads, schedules, or publication.

The page keeps four facts separate:

1. `StudioOutputPacket` is internal packet state, lineage, and approval evidence.
2. `StudioOutputPacket.publishAt` is an internal Quipsly plan. It is not a provider schedule.
3. `StudioPublishAttempt` is a provider-request ledger. Even a completed attempt is not external publication proof.
4. `StudioPublishedArtifact` is an artifact receipt. A provider ID or safe HTTP(S) URL is shown only when it is recorded; the page does not claim to have rechecked the live response.

All reads are scoped to project IDs returned by `listProjectsVisibleToEmail()` for the current actor. The runway shows the 100 most recently updated packets, 20 recent attempts per packet, and 200 most recently updated artifact receipts. Receipts with no packet link, or whose packet falls outside that bounded read, remain visible as lineage gaps.

## UX States

- Signed out: private ledger locked, with a sign-in link.
- Ready and empty: no persisted records, with safe links to Nests and the output catalog.
- Database unavailable: calm read failure, no sample records or mutation controls.
- Ready with records: packet, internal plan, attempts, artifacts, and lineage shown independently.

The route contains no publish, edit, connect-account, retry-provider, or upload mutation controls.

## Verification

Focused tests:

```bash
cd apps/quipsly
pnpm exec jest --runInBand --runTestsByPath \
  'src/app/(app)/publishing/publishing-model.test.ts' \
  'src/app/(app)/publishing/page.test.tsx'
```

Typecheck:

```bash
pnpm --filter quipsly typecheck
```

On 2026-07-18, both focused suites passed (10 tests), the Quipsly typecheck passed, and the local route returned HTTP 200 while rendering the explicit database-unavailable state.
