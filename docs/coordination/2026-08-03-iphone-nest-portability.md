# iPhone Nest portability handoff

Date: 2026-08-03

Owner: Codex

Status: implemented and authenticated local operation passed; physical-iPhone and released-production acceptance remain open

## Outcome

Quipsly Capture now makes the existing whole-Nest portability contract reachable
from **Account → Backup & transfer**. This is a production path over canonical
Nest models, not a second phone-only export format.

The existing Nest web portability screen uses the same reviewed-plan token and
exact apply readback, so strengthening the shared API does not create a weaker
or incompatible browser lane.

An owner can:

1. choose a Nest they own;
2. create a verified, file-protected JSON package without overwriting an earlier
   export;
3. deliberately share that package to Files or another controlled destination;
4. choose a package for a destination Nest;
5. run a read-only validation and review exact create/reuse/defer counts;
6. confirm apply separately; and
7. accept success only after exact plan, manifest, boundary, and integrity-receipt
   readback.

## Canonical boundary

Included:

- Nest identity and tag vocabulary, including aliases and revision evidence;
- note documents, blocks, tagged spans, and tag relationships;
- the current owner's tasks, goals, progress receipts, and goal-task links; and
- the current owner's focus-plan blocks.

Excluded or inert:

- media bytes and recordings;
- Sessions and collaborator assignments;
- credentials, tokens, and provider resources;
- notification, calendar, and other external side effects;
- active reminders and recurrence series; and
- active restored plan blocks, which restore canceled for safety.

The API reauthorizes owner-level `manage` access for both export and restore.
The iPhone's owner-only list is useful UX, not the security boundary.

## Safety and durability

- Import and export are bounded to 30 MiB and must parse as JSON.
- Imported Files URLs use iOS security-scoped access.
- App-owned exports use complete file protection and are excluded from automatic
  device backup so the user controls where the portable copy goes.
- Capture rereads the newly written regular file and requires exact bytes,
  byte count, and backup-exclusion readback before exposing Share; only a failed
  newly created copy is removed.
- A repeated export receives a unique filename; no prior export is replaced.
- Validation is read-only and apply is a distinct confirmed action.
- Apply resends the exact in-memory bytes that validation inspected and supplies
  the server-issued digest of the complete reviewed plan as a precondition.
- Inside its serializable transaction, Nest recomputes the plan and rejects
  destination drift before the first restore write.
- The apply response must reproduce the complete reviewed plan and its digest,
  not just the package manifest.
- Deterministic destination IDs make an identical retry idempotent and
  no-overwrite.

## Evidence

- Mobile source contract: 91/91 passed.
- Generic Simulator build: arm64 and x86_64 passed.
- Repository TypeScript 7.0.2 authority: 27/27 projects passed.
- Strict Nest TypeScript and 17/17 shared contract, route, and web-client tests
  passed.
- Disposable PostgreSQL relational-graph round trip: 1/1 passed, including
  stale-plan refusal, revalidation, deterministic retry, exact readback, and
  fixture cleanup.
- Focused Account journey and accessibility audit: 1/1 passed at
  `/private/tmp/quipsly-nest-portability-final.z7tfy7/result.xcresult`.
- Authenticated operated acceptance: 1/1 compiled iPhone journey plus HTTP and
  PostgreSQL readback passed at
  `/private/tmp/quipsly-nest-portability-authenticated-17c0345eb54c.xcresult`.
  One disposable verified owner created two distinct protected backup names;
  the server refused a deliberately stale plan with zero writes, revalidated,
  restored once, reused every canonical identity on replay, kept reminders
  inert and focus plans canceled, preserved the source graph, and left zero
  Firebase or database fixtures.

The earlier accessibility journey uses the app's privacy-safe preview dataset.
The later operated journey uses a real disposable local identity and canonical
records. Neither drives the system Files importer or Share Sheet.

## Next acceptance operation

Local authenticated export, drift refusal, restore, replay, readback, and
cleanup are complete. The next portability lane is intentionally physical and
released-environment scoped:

1. install the candidate on the signed-in physical iPhone;
2. export twice and inspect both system Share Sheet destinations without
   exposing an unrelated local file;
3. save one package in Files, import that exact security-scoped file, preview,
   confirm, and reopen restored product records;
4. interrupt or background the Files/Share flow and prove the prior package and
   source Nest remain intact; and
5. repeat the authorization and restore readback against the exact released
   Nest source/image/database identity before describing disaster recovery as
   production-proven.
