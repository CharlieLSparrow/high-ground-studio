# Database migrations

This is the current operational contract for Quipsly database changes. Older
feature notes that recommended `prisma db push` against shared databases are
obsolete. Git history preserves those decisions; this document preserves only
the workflow operators should use now.

## Authoritative state

- ORM and migration engine: Prisma 7.
- Schema: `prisma/schema.prisma`.
- Prisma configuration: `prisma.config.ts`.
- Replayable history: `prisma/migrations/`.
- Production orchestrator: `scripts/release/quipsly-schema-release.sh`.
- Exact schema job: `scripts/release/quipsly-schema-job.sh`.
- Local clean-source fixture: `scripts/quipsly-local-schema-fixture.mjs`.
- Baseline and drift recovery:
  `docs/runbooks/prisma-migration-baseline.md`.

At the 2026-07-31 checkpoint the complete history contains 33 migrations. The
latest migration is
`20260731120000_add_session_outputs_and_delivery_events`. Do not hard-code that
count or name into automation; the fixture runner derives the expected count
from the checked-in migration directories.

## Non-negotiable boundaries

1. Every shared schema change has a reviewed, forward-only migration.
2. A fresh database must reach the checked-in schema with
   `prisma migrate deploy`.
3. Applying the migration chain a second time must be idempotent.
4. `prisma migrate diff --from-config-datasource --to-schema
   prisma/schema.prisma --exit-code` must report no difference.
5. Runtime code that depends on a migration is not promoted before the schema
   release and exact readback pass.
6. Shared, retained-QA, preview, staging, and production databases never use
   `prisma db push`.
7. Production migration credentials stay inside the guarded Cloud Run schema
   job. Do not export a production `DATABASE_URL` into a developer shell.
8. A backup is mandatory evidence before production apply, but restoring it is
   a separate destructive incident operation—not an automatic rollback step.

`prisma db push` is allowed only for an explicitly disposable, isolated local
experiment that has no retained QA or release value. It is never an easier
substitute for creating a migration.

## Developer workflow

### 1. Change the schema

Edit `prisma/schema.prisma`. Keep changes additive where possible:

- add nullable columns or safe defaults before requiring new values;
- add new tables and indexes before removing old readers;
- preserve stable identifiers and source/provenance relationships;
- avoid dropping or rewriting source-bearing data in the same release that
  changes application behavior.

### 2. Create the migration

Run `migrate dev` only against an explicit disposable or development database:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/EXPLICIT_DEV_DATABASE' \
  pnpm exec prisma migrate dev --name DESCRIPTIVE_MIGRATION_NAME
```

Never accept Prisma's reset prompt for a retained or shared database. If the
target predates migration tracking or reports drift, stop and follow
`docs/runbooks/prisma-migration-baseline.md`.

### 3. Review the generated SQL

Review the new `migration.sql` as production code. Confirm:

- target tables, types, columns, constraints, and indexes are exact;
- defaults and backfills preserve existing rows;
- foreign-key delete/update behavior matches the domain contract;
- unique indexes cannot reject legitimate existing data;
- locks and table rewrites are understood;
- no destructive statement is present without a separately reviewed data and
  rollback plan.

Do not edit a migration that has already been applied to any shared database.
Repair it with a new forward migration.

### 4. Generate and test the application

```bash
pnpm db:generate
pnpm --filter quipsly typecheck
pnpm quipsly:contracts:test
```

Also run the focused route, integration, privacy, and rendered/native journeys
that depend on the changed objects. A zero schema diff does not prove product
behavior or authorization.

### 5. Replay the complete chain locally

Start Quipsly's local PostgreSQL service, then run the fail-closed helper from
a clean committed `HEAD`:

```bash
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
  pnpm quipsly:schema:fixture:local \
  --output /private/tmp/quipsly-local-schema-fixture.json
```

The helper:

- accepts only `127.0.0.1`, `localhost`, or `::1` PostgreSQL URLs;
- requires a clean current Git `HEAD`;
- derives one `quipsly_fixture_<sha>_local` database name;
- refuses to reuse or replace an existing database;
- creates the exact disposable database;
- applies every committed migration twice;
- requires zero Prisma schema diff and the schema fixture contract;
- removes only that exact database after success; and
- writes a redacted mode-`0600` receipt without credentials.

If verification fails, the fixture database is preserved for analysis. After
the defect is understood, remove only that exact release-owned fixture. Use
`--preserve` when deliberate post-success inspection is useful.

## Production release

### Plan

From a clean, pushed commit:

```bash
release_sha="$(git rev-parse HEAD)"
bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --project high-ground-odyssey \
  --region us-central1 \
  --sql-instance high-ground-odyssey:us-central1:studio-postgres \
  --output /private/tmp/quipsly-schema-plan.json
```

Planning is non-mutating. Review the mode-`0600` receipt and confirm:

- full source SHA and current `HEAD` match;
- `dirtyAtStart` is false;
- project, region, and SQL instance are exact;
- the fixture, immutable-image, backup, migrate, status, and zero-diff steps
  are all present;
- neither legacy `db push` nor targeted sync is selected.

### Authenticate

```bash
gcloud auth login --update-adc --brief
gcloud auth application-default set-quota-project quipsly-reef
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Do not begin apply until every authorization check passes.

### Apply

```bash
bash scripts/release/quipsly-schema-release.sh \
  --revision "$release_sha" \
  --project high-ground-odyssey \
  --region us-central1 \
  --sql-instance high-ground-odyssey:us-central1:studio-postgres \
  --output /private/tmp/quipsly-schema-release.json \
  --apply \
  --confirm-target high-ground-odyssey/studio-postgres
```

The apply lane fails closed unless the selected revision is the clean current
`HEAD`. It then:

1. materializes and builds the exact committed schema source;
2. proves the full migration chain and zero diff in a disposable Cloud SQL
   database;
3. resolves and pins one immutable Artifact Registry digest;
4. creates an on-demand production backup and independently reads back its
   exact successful ID;
5. runs only `prisma migrate deploy` from that pinned image;
6. requires `prisma migrate status` to be current; and
7. requires production-to-schema diff to be zero.

Preserve the passing receipt with the release evidence. It must contain the
source SHA, immutable image digest, backup ID, fixture proof, migration status,
and zero-diff result.

## Application deployment after schema

For application code that requires new objects:

1. finish the schema release;
2. deploy the same committed source to a zero-traffic Cloud Run revision;
3. run authenticated release smoke against that revision;
4. read back its source SHA and immutable image;
5. promote traffic only after the exact contract passes; and
6. retain rollback routing to the previously serving revision.

Additive schema should remain compatible with the prior application revision
so an application rollback does not require destructive schema rollback.

## Verification queries

Prisma commands are authoritative for migration and schema convergence:

```bash
pnpm exec prisma migrate status
pnpm exec prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
```

Targeted SQL may supplement—not replace—those checks. For the current
client-follow-up release:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('SessionOutput', 'SessionOutputRevision', 'DeliveryEvent')
order by table_name;

select typname
from pg_type
where typname in ('SessionOutputKind', 'SessionOutputStatus', 'DeliveryEventKind')
order by typname;
```

Expected result: all three tables and all three enum types. Runtime acceptance
must additionally prove coach/client authorization, revision history,
idempotent delivery receipts, outsider concealment, and native/web readback.

## Drift and repair

If migration status, schema diff, or runtime behavior disagree:

1. stop rollout;
2. preserve the migration ledger, schema diff, runtime error, and a restorable
   backup;
3. do not edit applied migration SQL or run `db push`;
4. create a new forward-only repair migration;
5. prove it in an empty fixture and against a representative drift fixture;
6. require zero diff and the affected runtime journey; and
7. release the repair before dependent application traffic.

See `docs/runbooks/prisma-migration-baseline.md` for baseline adoption and the
full applied-ledger/missing-object procedure.

## Rollback

Database migrations are forward-only. The ordinary rollback is:

- stop or roll back the dependent application revision;
- leave compatible additive schema in place;
- diagnose with preserved receipts and backup evidence; and
- release a reviewed forward repair if needed.

Dropping tables, restoring a backup, rewriting migration history, or marking a
migration rolled back is an incident-level destructive action and requires an
explicit recovery plan and authorization.
