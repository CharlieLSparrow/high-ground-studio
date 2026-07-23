# Canonical Tag Taxonomy Lifecycle — 2026-07-23

## Shipped locally

- `StudioTagAlias` preserves former human labels inside one Nest.
- `StudioTagRevision` records append-only rename, archive, and restore receipts.
- rename changes the canonical label and slug while retaining the former name
  as an alias;
- iPhone/API quick entry resolves an exact former name to the active canonical
  tag instead of creating a duplicate;
- archive removes a tag from new assignment choices without deleting any
  existing task, goal, Session, note, annotation, or writing relationship;
- restore makes the same canonical tag assignable again;
- Search All matches aliases and visibly returns the current canonical label
  plus its former names;
- Work exposes the lifecycle in a collapsed, keyboard-accessible Nest
  vocabulary panel so taxonomy maintenance does not displace daily work.

No taxonomy operation sends messages, creates external calendar state, mutates
source evidence, publishes, or calls a provider.

## Operated proof

Local Nest at `http://127.0.0.1:3012` was used as the signed-in QA account
against local PostgreSQL and the Firebase Auth emulator.

The real Capture-created tag and task were exercised:

- tag id: `cmrxe3dfn001e9xxlrq63tork`
- task id: `mobile-task-6538486a-f8a9-4462-8753-64b01515dd81`
- former label: `Capture dogfood 20260723T104526Z`
- canonical label after rename: `Capture taxonomy proof 20260723`

Verified through the rendered app:

1. rename showed the canonical label and former-name alias;
2. Search All found the canonical tag from the former label;
3. applying the former label to the real task reused the canonical tag and
   reported that no duplicate was created;
4. archive kept the task's existing visible tag while removing it from new
   choices;
5. restore reactivated the same tag and retained its alias.

Independent PostgreSQL readback found exactly one canonical tag, one alias,
three ordered revisions (`rename`, `archive`, `restore`), and one task link.
Every revision recorded `externalSideEffects: false`.

## Verification

- Prisma migration `20260723120000_add_tag_taxonomy_lifecycle` applied to the
  local development database.
- Prisma client generation passed.
- Quipsly TypeScript typecheck passed.
- 12 server and real-database taxonomy/search tests passed.
- 33 Work page/action/client tests passed.
- an additional focused 40-test regression pass passed after the compact UX
  refinement.

## Intentionally remaining

Tag merge/redirect is not part of this slice. It must preserve and deduplicate
all supported tag relationships—including annotations, tagged spans, knowledge
nodes, media clips, coaching notes, tasks, goals, and Sessions—without deleting
historical evidence. Imported-keyword provenance and a reviewed merge preview
remain the next taxonomy work rather than being represented as complete here.
