# Quipsly Nest backup and restore

Use this runbook to make one owner-controlled Nest portable or to rehearse a
safe restore. It covers the knowledge-work package, not the database, media
vault, Sessions, recordings, or production deployment.

Read the architecture contract first:
[Quipsly Nest portability](../architecture/quipsly-nest-portability.md).

## Preconditions

- Use an owner account for both the source and destination Nests.
- For local rehearsal, make `pnpm quipsly:local:doctor` pass first.
- Create a dedicated destination Nest. Do not rehearse by importing into a Nest
  that already contains irreplaceable work.
- Keep the downloaded JSON private. It contains note and work content.
- Do not edit the package by hand. Any change invalidates its semantic
  manifest.

## Export

1. Open the source Nest.
2. Choose **Tools**.
3. Open **Backup and transfer**.
4. Review the deliberate boundaries.
5. Choose **Download verified JSON**.
6. Retain the downloaded filename and a separate file SHA-256 in the recovery
   ticket or private operator log.

On macOS:

```bash
shasum -a 256 /absolute/path/to/quipsly-*-nest-*.json
```

That command hashes the file bytes. It is intentionally different from the
semantic `integrity.manifestSha256` inside the package.

Inspect summary metadata without printing note/task bodies:

```bash
jq '{
  schemaVersion,
  exportedAt,
  sourceNest,
  boundaries,
  integrity
}' /absolute/path/to/quipsly-*-nest-*.json
```

Expected safety declarations include:

- `mediaBytesIncluded:false`
- `sessionsIncluded:false`
- `collaboratorAssignmentsIncluded:false`
- `remindersRestoredActive:false`
- `recurrenceRestoredActive:false`
- `planBlocksRestoreAsCanceled:true`
- `externalResourcesFetched:false`
- `externalSideEffects:false`

Stop if any boundary is missing or different.

## Preview a restore

1. Create or open the dedicated destination Nest.
2. Open **Tools → Backup and transfer**.
3. Choose the exported JSON.
4. Choose **Validate restore plan**.
5. Review every count:
   - tags and aliases created or reused;
   - tags versioned because the destination already owns that slug;
   - aliases deferred because another canonical name already owns the slug;
   - notes, blocks, and exact anchors;
   - tasks, reminders deferred, and reuse count;
   - goals, progress receipts, and relationships;
   - canceled focus-block snapshots.
6. Require the footer to show exactly:
   `0 overwrites · 0 source mutations · 0 external effects`.

Apply remains disabled if the server reports any nonzero unsafe count. A
validation request is read-only.

## Apply and verify

Choose **Apply verified restore** once. Wait for **Restore confirmed**.

Then leave the restore page and verify the product, not just the response:

1. Open the destination **Notes** view and reopen at least one note.
2. Open **Work** and verify open/resolved Tasks, Goals, progress, and links.
3. Search or filter by a restored canonical tag.
4. Confirm no imported reminder is active.
5. Confirm no recurrence series was activated.
6. Confirm imported focus blocks are canceled history, not Calendar promises.

Return to **Backup and transfer**, load the same file, and validate again. The
retry preview should show deterministic reuse and zero new note/task/goal/link
records. Applying the same package again is a supported ambiguity-recovery
check; it must not duplicate records.

## Local engineering proof

Focused contract, route, and client tests:

```bash
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  src/lib/nest-portability.test.ts \
  'src/app/api/nests/[slug]/portable-export/route.test.ts' \
  'src/app/api/nests/[slug]/portable-restore/route.test.ts' \
  'src/app/(app)/nests/[slug]/portable/NestPortabilityClient.test.tsx'
```

Disposable PostgreSQL round trip:

```bash
QUIPSLY_LOCAL_DB_SMOKE=1 \
QUIPSLY_LOCAL_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio' \
  pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  src/lib/server/nest-portable-restore.integration.test.ts
```

Compiler and release authority:

```bash
pnpm --filter quipsly typecheck
bash scripts/ci/typecheck-typescript-7.sh
pnpm quipsly:release:local
```

The integration test refuses to run unless explicitly enabled. It creates a
disposable owner, collaborator, source Nest, and destination Nest; exercises
the real relational graph; independently reads it back; and deletes only those
exact fixtures.

## Incident and ambiguity handling

- **Browser says the download failed:** inspect the Nest server access log. An
  attachment-capable browser may have received HTTP 200 even when an automation
  wrapper could not surface the file. Do not claim a backup unless the JSON file
  exists and opens.
- **Apply response was lost:** load and validate the same package again.
  Deterministic IDs make retry safer than inventing a new package.
- **Alias is deferred:** decide vocabulary in the destination. Restore will not
  steal an existing canonical or former-name route.
- **Tag is versioned:** both meanings remain. Reconcile them later through the
  canonical tag lifecycle; do not edit restore rows directly.
- **A package is tampered or malformed:** return to the source Nest and export a
  new package.
- **A second environment is the target:** prove the destination app SHA,
  database migration state, signed-in owner, and private route before Apply.
  Treat that exercise as a separate disaster-recovery acceptance gate.

## Truthful completion language

Use these phrases precisely:

- **Downloaded:** a JSON file exists and its file SHA was recorded.
- **Validated:** manifest, references, authorization, and destination plan
  passed without writes.
- **Restored:** Apply returned success and the product plus persistence layer
  were independently checked.
- **Disaster-recovery proven:** a separately administered environment was
  restored and operated successfully.

Local restore does not imply production parity, deployed privacy, provider
delivery, physical iPhone operation, TestFlight availability, or App Store
submission.
