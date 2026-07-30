# Prisma Migration Baseline

Quipsly now has a replayable Prisma migration history. A fresh PostgreSQL
database must reach the checked-in schema with `prisma migrate deploy`; an
existing database that predates migration tracking must be inspected and
adopted rather than running the baseline over tables that already exist.

## Fresh database

Point `DATABASE_URL` at an empty database, then run:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
```

Success requires both commands to exit zero and the diff to report `No
difference detected`.

## Existing untracked database

Never run the baseline migration directly against a populated database. First:

1. Confirm the exact `DATABASE_URL` target and take a restorable database
   backup.
2. Run `pnpm exec prisma migrate status` and retain its output.
3. Compare the live schema with the checked-in schema:

   ```bash
   pnpm exec prisma migrate diff \
     --from-config-datasource \
     --to-schema prisma/schema.prisma \
     --exit-code
   ```

4. Stop if any difference is reported. Reconcile and review the difference as
   a new additive migration; do not use `db push` to erase the evidence.
5. Only when the comparison reports no difference, mark each already-present
   migration as applied in chronological order with:

   ```bash
   pnpm exec prisma migrate resolve --applied MIGRATION_DIRECTORY_NAME
   ```

6. Run `pnpm exec prisma migrate status` again. It must report `Database schema
   is up to date`.

`migrate resolve` changes only Prisma's migration ledger. It does not apply the
SQL, which is why the zero-diff check and backup are mandatory gates.

## Applied ledger entry with missing live objects

An applied checksum is not proof that every object from that migration still
exists. If `_prisma_migrations` reports a migration as applied but
`prisma migrate diff` or runtime behavior proves that its table, column, index,
constraint, or backfill is missing:

1. Stop application rollout and preserve the migration ledger plus a schema
   dump and restorable backup.
2. Do not edit the already-applied migration and do not mark it rolled back.
3. Add a new forward-only repair migration. Make every repair operation
   idempotent where PostgreSQL permits it (`IF NOT EXISTS` plus catalog checks
   for constraints), preserve existing rows, and reproduce the checked-in
   schema's indexes, foreign keys, and required backfill.
4. Apply the repair to an explicit disposable or local target first.
5. Run `prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --exit-code`; success requires `No difference
   detected`.
6. Exercise the runtime path that originally revealed the drift. A zero schema
   diff alone does not prove application behavior.
7. Release the repair before any application revision that requires the
   missing object, then read the target schema and application behavior back.

This keeps historical checksums truthful while making repair and rollback
decisions reviewable. The rollback for an additive repair is normally an
application rollback; do not drop restored data-bearing objects merely to
reverse the migration.

## Change policy

- Add a migration for every Prisma schema change.
- Prove the full chain in an empty disposable database before review.
- Prove the resulting database has zero diff from `prisma/schema.prisma`.
- Use `prisma migrate deploy` for shared, staging, and production databases.
- Reserve `prisma db push` for intentionally disposable experiments; it is not
  a release or deployment workflow.
