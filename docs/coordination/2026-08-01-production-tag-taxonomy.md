# Production canonical tag-taxonomy checkpoint

**Date:** 2026-08-01  
**Status:** retained production create/rename/alias/merge/rollback/re-merge operation complete; compact phone control verified locally and queued for the next batched Nest release

## Outcome

Quipsly's existing canonical tag system was exercised through the rendered
production product rather than by direct database mutation. The fixed private
`codex@dev.test` account used the retained Build 25 Project, Task, document-
kernel Note, Goal, and canonical Tag from the cross-device acceptance world.

The operation:

1. created a deliberately misspelled project tag from the retained Task and
   assigned it in the same rendered workflow;
2. renamed the tag and verified the misspelled name remained searchable;
3. previewed and confirmed a project-global merge into the canonical Tag;
4. inspected the merge receipt and applied the exact rollback;
5. proved the Task held both the restored source relationship and its
   pre-existing canonical relationship after rollback;
6. previewed and applied the merge again; and
7. verified the final source redirect, both historical aliases on the
   canonical Tag, and exact canonical usage across the same Task, Note, and
   Goal IDs.

The final canonical Tag remains
`cmsa4jr6j001601s6v1zigqwm` with an exact usage count of three. The test source
Tag `cmsb3598s000301s610k6sxxc` remains as an archived redirect. This is
intentional durable QA data.

## Production boundary

The operator authenticated through the rendered Nest login with the Keychain-
held fixed test credential. It produced no credential or token output, cleared
the browser session, encountered zero browser exceptions and zero server
failures, and did not touch a real collaborator, source media, external
calendar, message, or publication.

Private mode-`0600` evidence is retained at:

`/Volumes/My Passport/Quipsly QA Artifacts/Retained Production/2026-08-01/capture-build25-production-tag-taxonomy-c`

The operation receipt SHA-256 is
`d565cd91e0aef0d7c3716374c9bfb70fea994a2125d1483fb0bcc02d8200cc55`.

Two earlier fail-closed attempts remain preserved. The first captured the
former-name result before the operator correctly accounted for merge semantics:
aliases resolve to the canonical target while the source becomes an archived
redirect. The second created only an empty private evidence directory before
the strengthened state check rejected the already-merged source. Neither
attempt changed external state.

## UX finding and repair

The phone-width proof exposed an oversized wrapped control because the visible
button repeated the complete tag label. The control now renders compact
`Manage` / `Close` text, keeps the complete tag identity in its accessible
label, and cannot shrink into an unreadable pill. The focused Work suite passes
29/29 and the Quipsly TypeScript 7 check passes.

This small visual repair is intentionally not a standalone deployment. It is
queued for the next coherent Nest release so the new cost discipline does not
turn every UI polish change into another Cloud Build.

## Repeatable operator

The credential-safe acceptance path is now versioned as:

- `scripts/quipsly-retained-production-tag-taxonomy-operation.mjs`;
- `scripts/quipsly-retained-production-tag-taxonomy-operation.test.mjs`; and
- `pnpm quipsly:retained:production-tag-taxonomy`.

It fails closed on unrelated taxonomy state, refuses to overwrite evidence,
writes private artifacts atomically, and can resume from the exact intentional
merged state by proving rollback and re-merge again.
