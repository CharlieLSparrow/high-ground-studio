# Quipsly schema pipeline hardening

Date: 2026-07-31

Exact source `30264d5cbb8094f175c36fcd7693639648d3810f` replaces the
repository's contradictory database guidance with one migration-first release
contract and adds a fail-closed local proof runner. This is pipeline evidence,
not a production schema release.

## Boundary repaired

The prior canonical migration document mixed current Prisma 7 migration
tooling with old chronological feature notes that repeatedly instructed an
operator to run `pnpm db:push` against shared or live databases. That guidance
was incompatible with the checked-in 33-migration history and the guarded
Cloud Run schema job.

The current contract now requires:

- reviewed forward-only migrations for every shared schema change;
- complete replay on a fresh database;
- idempotent second migration deploy;
- zero datasource-to-schema diff;
- schema release before a dependent application revision receives traffic;
- immutable image, backup, migration-status, and zero-diff production
  evidence; and
- no `db push` on retained QA, preview, staging, or production databases.

## Exact local fixture runner

`pnpm quipsly:schema:fixture:local` accepts only an explicit PostgreSQL URL on
`127.0.0.1`, `localhost`, or `::1`. It requires a clean current Git `HEAD`,
derives one source-bound `quipsly_fixture_<sha>_local` database, and refuses to
reuse, replace, or target that fixture as its admin database.

The runner creates the absent database, delegates to the existing schema
contract worker, binds the worker receipt to the exact source and database,
and drops only that exact database after success. Failure preserves the
fixture for analysis. The final receipt is redacted, mode `0600`, and uses
exclusive creation so an existing receipt cannot be overwritten.

This disposable schema database is distinct from retained product QA data.
Dedicated `.test` users and clearly labeled QA notes, tasks, goals, projects,
sessions, recordings, and collaboration history remain durable by default
under `docs/runbooks/quipsly-retained-dogfood.md`.

## Operated exact-source proof

The committed runner was operated against local PostgreSQL with receipt:

`/private/tmp/quipsly-local-schema-fixture-30264d5c.json`

Independent readback proved:

- source SHA:
  `30264d5cbb8094f175c36fcd7693639648d3810f`;
- outcome: `PASSED`;
- all 33 committed migrations applied successfully;
- second deploy: `idempotent`;
- Prisma schema diff: `zero`;
- transcript schema contract: 15 required columns, 2 cascading foreign keys,
  4 indexes, and the stable provider-word identity index;
- fixture created, verified, and dropped;
- exact fixture database independently absent after the run;
- receipt permissions: `-rw-------` / `0600`; and
- no password, token, secret, database URL, or connection-string field in the
  receipt.

The migration documentation and helper tests pass 5/5, the full cross-surface
contract passes 173/173, Quipsly TypeScript 7 typechecking passes, and explicit
diff checks pass.

## Remaining release boundary

This closes local exact-source migration replay and operator-guidance drift. It
does not apply schema to Google Cloud, deploy Nest, promote traffic, upload
Build 22, or prove a physical iPhone. The next release sequence remains:

1. restore Google Cloud user, ADC, deploy-project, and Firebase authorization;
2. plan and apply the exact production schema release;
3. deploy the matching Nest source at zero traffic;
4. pass authenticated preview acceptance and immutable-source readback;
5. promote and prove production parity;
6. qualify a fresh native build against that backend before TestFlight; and
7. operate capture, recovery, upload, playback, and same-ID readback on a
   physical iPhone.
