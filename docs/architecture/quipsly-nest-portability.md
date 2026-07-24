# Quipsly Nest portability

Status: implemented local recovery boundary

Schema: `quipsly-nest-export-v1`

Owner: Quipsly Nest

## Decision

Quipsly Nests have an owner-operated, inspectable JSON portability contract for
the knowledge-work graph. This is not a database dump and it is not a media
archive. It packages the durable records a person needs to resume thinking:
canonical vocabulary, note documents, tasks, goals, progress, relationships,
and planning history.

Restore is deliberately asymmetric. It preserves meaning while refusing to
recreate time-sensitive or externally observable behavior:

- destination records are private, deterministic copies;
- existing destination records are never replaced;
- reminders and recurrence remain snapshots, not active schedules;
- focus blocks are restored as canceled history;
- provider, calendar, notification, message, media, and publication systems are
  not called.

The owner must validate a complete destination plan before Apply becomes
available.

## Product boundary

| Included | Preserved as history only | Excluded |
| --- | --- | --- |
| canonical tags, aliases, and tag revisions | tag merge targets | media bytes and upload state |
| note documents, blocks, and exact tagged spans | reminder intent | Sessions, recordings, and transcripts |
| actor-assigned project tasks and tag links | recurrence and occurrence intent | other collaborators' assignments |
| actor-owned goals, hierarchy, progress, and task links | focus blocks, restored canceled | credentials and provider tokens |
| due dates, completion state, and source envelopes | original identities inside restore receipts | external calendar or notification delivery |

Only documents whose source label identifies `document-kind:note` enter this
package. Dedicated document, research, and production portability contracts
remain separate because they carry different source and review semantics.
Unreviewed transcript action candidates are excluded from committed work.

## Authorization

Both export and restore require the durable signed-in Quipsly session plus
`manage` access to the exact Nest. The current access model reserves that
capability for the owner. The package itself is private user data; possession of
the JSON does not grant access to a destination Nest.

Export scopes work to the signed-in actor:

- `ActionItem.assignedUserId` must match the actor;
- `Goal.ownerUserId` must match the actor;
- planning blocks must belong to the actor and reference an included task or
  goal;
- goal/task relationships are included only when both endpoints are included.

## Package integrity

`integrity.manifestSha256` is the SHA-256 of the stable JSON serialization of
every payload field except the `integrity` envelope. It is a semantic package
manifest, not the SHA-256 of the formatted file bytes.

Validation occurs before any destination read or write:

1. require the exact schema version;
2. recompute and compare the semantic manifest;
3. enforce the 30 MB HTTP and text ceiling plus per-record count limits;
4. validate enums, dates, offsets, IDs, and text bounds;
5. reject duplicate identities and broken tag, note-span, goal-parent,
   goal-task, or planning references;
6. require the declared safety boundary to remain false for external effects
   and active scheduling.

The export is stable enough for audit and recovery. It is not a signature from a
trusted third party and should not be treated as proof of who originally
created a file.

## Restore identity and idempotency

Every restored record receives a destination-scoped deterministic identity:

```text
destination Nest
+ source Nest identity
+ source record identity
+ stable digest of the exported snapshot
= restored identity
```

The exact encoding lives in `portableId(...)`. A retry of the same package into
the same Nest therefore resolves the same records. A changed source snapshot
gets a new identity instead of overwriting the earlier restore.

Apply takes a PostgreSQL transaction-level advisory lock over destination,
actor, and manifest. The transaction then rebuilds the plan and performs
create-or-reuse operations. Concurrent retries cannot interleave two copies of
the same restore.

```mermaid
flowchart LR
  A["Owner downloads package"] --> B["Browser loads JSON"]
  B --> C["Server validates manifest and references"]
  C --> D["Server plans creates, reuses, collisions, and deferrals"]
  D --> E{"Any overwrite, source mutation, or external effect?"}
  E -- "Yes" --> F["Apply remains disabled"]
  E -- "No" --> G["Owner explicitly applies"]
  G --> H["Advisory lock plus database transaction"]
  H --> I["Create or reuse deterministic private records"]
  I --> J["Return receipt and safe-boundary readback"]
```

## Vocabulary collision policy

Vocabulary recovery must not silently change destination meaning.

1. An equivalent canonical tag at the same slug is reused.
2. A different canonical tag at that slug remains untouched; the imported tag
   receives `-restored-<12 character digest>`.
3. An alias already routing to the same restored tag is reused.
4. An alias colliding with another canonical tag or alias is deferred.
5. Alias reservations are simulated across the whole incoming bundle, so the
   preview matches what Apply can create.
6. Source merge relationships remain in the tag restore revision; restore does
   not reactivate a merge in the destination.

Every newly created canonical tag gets an append-only
`restored-from-portable-nest` revision containing source identities, original
slug, exported revisions, manifest, and the no-overwrite claim.

## Record semantics

### Notes

Notes restore as private `StudioDocument` and `StudioDocumentBlock` rows with
new deterministic stable IDs. Exact tagged spans are recreated only after their
block offsets, selected text, document identity, and tag references validate.
One `StudioDocumentOperation` records the import.

### Tasks and goals

Task and goal status, descriptive fields, dates, tags, and source envelopes are
preserved. Goal progress and goal/task relationships get deterministic
identities. Parent relationships are restored only when the parent goal is in
the same package.

Reminder and recurrence snapshots are retained inside task provenance with
`reminderRestoredActive:false` and `recurrenceRestoredActive:false`. No
`TaskReminder` or `TaskRecurrenceSeries` row is created.

### Focus blocks

Planning blocks retain their original times, timezone, original status, and
source envelope, but the destination row is `CANCELED`. Provenance explicitly
records:

- `restoredCanceledForSafety:true`;
- `externalCalendarMutated:false`;
- `notificationScheduled:false`.

## Failure behavior

| Failure | Result |
| --- | --- |
| malformed, oversized, or tampered package | 400/413; no plan and no write |
| signed-out request | 401 |
| actor cannot manage destination | privacy-preserving 404 |
| broken or foreign reference | validation error before transaction |
| canonical tag slug collision | versioned imported tag; destination untouched |
| alias collision | alias deferred and disclosed in preview |
| concurrent retry | one advisory-locked transaction; same identities reused |
| database failure during Apply | transaction rolls back |
| ambiguous client response after Apply | retry the same package; deterministic identities converge |

## Implementation map

- Contract and validation:
  `apps/quipsly/src/lib/nest-portability.ts`
- Owner-scoped export:
  `apps/quipsly/src/lib/server/nest-portable-export.ts`
- Plan and transactional apply:
  `apps/quipsly/src/lib/server/nest-portable-restore.ts`
- HTTP boundaries:
  `apps/quipsly/src/app/api/nests/[slug]/portable-export/route.ts` and
  `portable-restore/route.ts`
- Owner UX:
  `apps/quipsly/src/app/(app)/nests/[slug]/portable`
- Operator procedure:
  `docs/runbooks/quipsly-nest-portability.md`

## Acceptance evidence

A portability change is not accepted on typechecking alone. The required proof
stack is:

1. pure manifest/reference validation tests;
2. route authorization and validate/apply tests;
3. rendered client tests proving Apply is unavailable before preview and stays
   unavailable for any unsafe plan;
4. disposable PostgreSQL round trip with collisions, exact note anchors,
   actor scoping, progress, relationships, canceled planning history, retry,
   and independent readback;
5. an operated rendered-app rehearsal using a downloaded package and a
   dedicated destination Nest;
6. repository TypeScript 7 and production build/release gates.

The local proof does not close second-environment disaster recovery, production
deployment, physical iPhone, TestFlight, or App Store acceptance.
