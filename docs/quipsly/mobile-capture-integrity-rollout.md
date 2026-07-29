# Quipsly Capture integrity rollout

This rollout preserves uploaded source bytes first, then enables Studio media, transcription, and packet projections only from normalized release evidence. Do not deploy the app ahead of the additive schema.

## Order of operations

1. Back up the production database and confirm the media bucket retention/lifecycle policy does not delete source recordings.
2. Apply `ops/quipsly-coaching-capture-additive.sql` with `scripts/quipsly-coaching-capture-schema-sync.mjs`. Re-run it and require a clean schema verification.
   The verifier must report `MediaVaultUploadReservation`, its `issuedAt`/renewal/completion columns, and all actor/Nest quota indexes before either upload issuer is deployed. A missing ledger is a release blocker, not a warning.
3. Run the historical audit in dry-run mode:

   ```sh
   DATABASE_URL='...' node scripts/quipsly-mobile-capture-historical-quarantine.mjs > capture-quarantine-dry-run.json
   ```

4. Review every held recording, transcript job, historical Studio source/media ID, and packet projection in the report. A dry run never changes the database or bucket.
5. If the report is accepted, apply quarantine explicitly:

   ```sh
   DATABASE_URL='...' node scripts/quipsly-mobile-capture-historical-quarantine.mjs \
     --apply \
     --confirm=QUARANTINE_CAPTURE_ARTIFACTS \
     --reason='Reviewed migration of pre-integrity capture artifacts'
   ```

   Apply marks app records and transcript jobs `HELD`; it does not delete or rewrite source bytes. Packet projections remain on disk for audit but runtime APIs hide them until their source is released.
6. Deploy Quipsly web/backend. Then deploy the iPhone app that sends consent evidence v2 and uses canonical resumable upload/finalize.
7. Run the focused contract suite and an authenticated device proof: create a quick Home Nest session, grant audio consent with the nearby-person attestation, record, upload, finalize, recover the upload receipt, and verify a booking participant without Studio editor access can preserve their own bytes.

## Persistent upload capacity policy

Both `/api/mobile/capture/uploads/resumable` and `/api/upload/presigned` reserve capacity in `MediaVaultUploadReservation` before any GCS capability is created. Actor and Nest advisory locks run inside a serializable transaction, so horizontally scaled instances cannot race past the same allowance. Exact UUID retries reuse one immutable reservation; mutation of size, object, actor, or Nest returns a conflict. Expired canonical recordings may renew the same UUID only after a fresh quota decision, preserving offline iPhone recovery without making retries free.

Defaults are deliberately conservative and can be lowered before deployment:

| Environment variable | Default |
| --- | ---: |
| `QUIPSLY_UPLOAD_ROLLING_WINDOW_HOURS` | `24` |
| `QUIPSLY_UPLOAD_ISSUANCE_WINDOW_MINUTES` | `60` |
| `QUIPSLY_UPLOAD_ACTOR_ROLLING_BYTES` | `21474836480` (20 GiB) |
| `QUIPSLY_UPLOAD_NEST_ROLLING_BYTES` | `107374182400` (100 GiB) |
| `QUIPSLY_UPLOAD_ACTOR_ISSUANCE_LIMIT` | `30` |
| `QUIPSLY_UPLOAD_NEST_ISSUANCE_LIMIT` | `150` |
| `QUIPSLY_UPLOAD_ACTOR_ACTIVE_LIMIT` | `5` |
| `QUIPSLY_UPLOAD_NEST_ACTIVE_LIMIT` | `25` |
| `QUIPSLY_UPLOAD_ABANDON_AFTER_HOURS` | `24` |

- Presigned reservations remain active for at most 30 minutes. Canonical resumable reservations match the six-day resumable URI window.
- Successful resumable finalization and proxy registration record exact size and immutable GCS generation, then mark the reservation `COMPLETED` immediately.
- Issuance opportunistically marks elapsed `ACTIVE` rows `EXPIRED`, then old expired rows `ABANDONED`. These transitions release active slots but never erase quota history or source bytes.
- Run the cleanup script in dry-run mode for operational readback; scheduled/operator apply requires the explicit confirmation token:

  ```sh
  DATABASE_URL='...' node scripts/quipsly-media-vault-upload-reservation-cleanup.mjs
  DATABASE_URL='...' node scripts/quipsly-media-vault-upload-reservation-cleanup.mjs \
    --apply --confirm=EXPIRE_UPLOAD_RESERVATIONS
  ```

  The script changes ledger state only. It never deletes database rows or GCS objects.
- Rolling bytes and issuance use `issuedAt`, including renewed canonical reservations. Completion does not refund rolling bytes.
- Keep GCS object lifecycle/orphan review separate from ledger cleanup. Never infer that an `ABANDONED` database row authorizes deleting its object.
- Legacy multipart and instance-local chunk routes now return `410` before reading request bytes. Do not re-enable them; recovery starts a quota-reserved resumable upload while the device retains its source.

Operational readback after schema sync:

```sql
SELECT "status", "lane", count(*) AS reservations,
       sum("expectedSizeBytes") AS expected_bytes
FROM "MediaVaultUploadReservation"
GROUP BY "status", "lane"
ORDER BY "status", "lane";
```

## Release and rollback boundaries

- `HELD` is the default for legacy, missing, conflicting, or changed evidence. A `VERIFIED` RecordingAsset status alone never authorizes processing.
- Only the staff release route may convert a held normalized receipt, and it re-verifies the immutable GCS generation, byte count, SHA-256, current room binding, and current consent.
- Roll back application code independently if needed; keep the additive tables and receipts. Do not delete normalized receipts or source objects.
- If quota configuration is too strict, adjust the environment limits and restart the application. Do not delete reservation rows to make capacity appear available.
- If a false-positive quarantine is found, use the explicit staff release workflow after reviewing current consent. Do not directly flip statuses or edit JSON in SQL.

## Acceptance evidence

- Prisma validate/generate and Quipsly typecheck pass.
- Mobile capture security, room readiness, finalization, release, processing-gate, session/digest/runway quarantine, packet-gate, consent, and resumable-contract tests pass.
- Upload reservation policy/static tests pass, exact retry does not increment active capacity, concurrent actor/Nest issuance is advisory-lock serialized, completion frees the active slot, and expired canonical recovery renews subject to quota.
- Unauthenticated, cross-project, held-media, derivative/proxy, and packet-projection reads fail closed.
- A quick iPhone session reports the actual `home-...` project slug, not the literal `home` alias.
- A coachee upload is bound to the server-owned room project and cannot inject a different project, while Studio promotion still requires explicit write access.
