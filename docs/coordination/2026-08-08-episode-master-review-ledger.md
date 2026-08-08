# Episode master review ledger

Date: 2026-08-08

The 4K encode is reviewed independently from the edit review that authorized its creation. This prevents a good 720p Play Edit from silently approving different 4K encoded bytes.

## Receipt identity

`StudioEpisodeMasterReviewReceipt` is append-only and binds:

- the exact master-conform job;
- the exact prior program-approval receipt;
- branch revision plus timeline, source-projection, and edit-state fingerprints;
- approved program manifest and master manifest SHA-256 values;
- exact 4K output SHA-256, generation, and byte count;
- actor, stable request id, request digest, evidence, note, and decision time.

## Review requirements

Approval requires browser-observed playback covering at least 90% of the candidate, including the beginning, middle, and end, a completed playthrough, audible non-muted playback, and no rate above 2×. A rejection requires at least some watched evidence and a note.

Browser telemetry is retained as evidence but explicitly does not claim to prove attention or audibility.

Before saving a decision, the server rechecks in a serializable transaction:

- current shared branch revision;
- latest program decision is still the receipt that authorized conform;
- registered master job and exact output identity are unchanged; and
- idempotency ownership is unchanged.

## Boundaries

Master approval records exact bytes. It does not upload them, create delivery encodes, select a publication destination, or publish. Those later operations must consume this exact current approval.

The migration was formatted, validated, and used to generate the Prisma client. It was not applied to a retained database in this checkpoint because the local database runtime is unavailable.
