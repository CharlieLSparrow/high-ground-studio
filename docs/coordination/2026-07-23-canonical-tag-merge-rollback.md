# Canonical Tag Merge Rollback — 2026-07-23

## Corrected receipt contract

The first merge receipt retained every source-side association and duplicate
counts, but did not retain the exact target-side IDs for partially duplicated
relationship sets. That was enough to inspect a merge, but not enough to
guarantee an exact automatic rollback.

New merges write `quipsly-tag-merge-v2` snapshots containing:

- every source association before merge;
- every target association before merge;
- the exact post-merge source, target, and merge timestamps;
- task, goal, Session, coaching-note, annotation, anchored-span,
  knowledge-node, media-clip, and alias state;
- the reviewed impact hash and no-external-side-effect boundaries.

Version 1 receipts fail closed with an explicit unsupported message. Quipsly
does not guess which target links were pre-existing.

## Rollback behavior

Work now offers **Inspect merge receipt & rollback** on a merged source tag.
The flow:

1. rechecks editor access to the Nest;
2. loads the newest source merge receipt;
3. verifies the source is still the recorded redirect;
4. verifies tag timestamps, labels, aliases, and every recorded relationship;
5. distinguishes target relationships that already existed from relationships
   created by the merge;
6. blocks after any later edit, removal, or identity change;
7. requires an exact-preview checkbox before Apply;
8. restores the source tag and its original associations in one serializable
   transaction;
9. preserves target relationships that existed before merge;
10. removes only target relationships proven to have been created by merge;
11. appends `merge-rollback` and `merge-rollback-received` revisions with the
    rollback receipt ID and exact preview hash.

Source text, provider state, messages, calendars, publishing, and external
accounts are outside the transaction and remain unchanged.

## Persisted QA dogfood

The opt-in dogfood used the existing Capture-authored QA task
`mobile-task-6538486a-f8a9-4462-8753-64b01515dd81` and the signed QA identity.
It created two uniquely named reusable tags, then executed:

`create both → merge → preview rollback → rollback → verify → re-merge`

Persisted identities:

- source tag: `cmrxftb7o0000ddxlb9qs12nx`
- source label: `Rollback proof source 20260723T1140Z`
- target tag: `cmrxftb8e0001ddxlr7c8ckrr`
- target label: `Rollback proof canonical 20260723T1140Z`
- first merge receipt: `badcb0be-261a-4e4b-b86a-4aadbed248d3`
- rollback receipt: `f12e5423-5c0e-49ae-b8b8-e136ab2d5131`
- final merge receipt: `f49d51a9-9838-477f-9a4d-950878f80a47`

Independent PostgreSQL readback found:

- source tag inactive and redirecting to the target;
- zero source task links and one target task link;
- two v2 merge receipts;
- one append-only rollback receipt.

The final v2 redirect intentionally remains available in local Work for visible
receipt inspection. Browser operation of the new rollback control still needs
one fresh local tab after the development-server restart; no alternate browser
or security-policy bypass was used.

## Verification

- Full relational merge/rollback smoke passed across every supported
  relationship family.
- The smoke deliberately changed a merge-created task relationship and proved
  rollback failed closed until the exact state was restored.
- Legacy v1 receipt rejection is covered.
- 17 Work client tests passed, including semantic receipt preview, disabled
  Apply, explicit checkbox confirmation, and persisted refresh.
- 42 focused Work/service tests passed; 3 opt-in tests skipped by default.
- 7 enabled database lifecycle and merge/rollback tests passed.
- The persisted QA dogfood passed independently.
- Quipsly TypeScript passed.
- All 19 local Prisma migrations are current.
- The production Next.js build passed across 150 routes.
- The existing broad NFT file-tracing warning from `next.config.mjs` remains
  separate from this slice.

## Intentionally remaining

- Open a fresh local browser tab, preview the retained final QA receipt in Work,
  and perform a visible rollback/re-merge if desired.
- Add imported-keyword provenance and reviewed promotion so imported metadata
  never masquerades as intentional human taxonomy.
- Repeat old-label quick entry and receipt inspection on physical iPhone and a
  TestFlight build after device visibility and production billing gates clear.
