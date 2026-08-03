# iPhone Nest portability handoff

Date: 2026-08-03

Owner: Codex

Status: implemented and Simulator-operated; authenticated data operation and physical-iPhone acceptance remain open

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

The operated UI journey uses the app's privacy-safe preview dataset; it proves
reachability, wording, explicit action separation, and accessibility, not a real
server mutation.

## Next acceptance operation

The service-level disposable PostgreSQL graph operation is complete. The next
lane must prove the authenticated HTTP and physical-file boundaries with a
disposable owner account:

1. use local Nest HTTP to export a temporary Nest with a tagged note, task,
   goal, relationship, and focus block;
2. export it twice through Capture and prove both protected files remain
   byte-readable and have distinct names;
3. validate into a second temporary Nest, then deliberately alter destination
   state and prove apply refuses the stale preview without restoring;
4. revalidate, apply, and inspect every canonical record and inert-effect
   boundary through the API;
5. repeat the same bytes and prove stable identities plus zero additional
   creates;
6. clean up both temporary Nests and the disposable identity; and
7. repeat Files import/export and Share Sheet inspection on a physical iPhone.

Do not describe this lane as production-proven until local authenticated
readback, physical iPhone handling, and the released Nest deployment all pass.
