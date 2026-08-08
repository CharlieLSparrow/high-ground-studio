# Episode full-program approval ledger — 2026-08-08

## Outcome

Advanced Studio now turns full-program watching into an append-only,
generation-bound decision. A creator can approve an exact review candidate for
master planning or request changes with a note. Neither decision modifies the
canonical edit, source media, rendered review, storage, or publication state.

## Exact subject

Each `StudioEpisodeProgramReviewReceipt` binds:

- Nest, Episode, render job, edit branch, and branch revision;
- timeline, source-projection, and edit-state fingerprints;
- render manifest SHA-256;
- output SHA-256, generation, and byte count;
- actor, stable client request, decision, note, and timestamp; and
- normalized playback evidence and its computed coverage.

The migration is additive. Receipts are append-only and cascade only with their
owning project, Episode, or workflow job. A unique project/actor/request key
makes retries idempotent without making one actor's request collide across
Nests.

## Playback evidence

The browser retains observed one-second bins, start/end timestamps, completion,
maximum playback speed, mute/volume state at decision time, and seek count.
Approval requires:

- at least 90% of rendered second bins;
- coverage of the beginning, middle, and end;
- an ended playthrough;
- non-muted, non-zero volume at decision time; and
- no playback faster than 2×.

Seeking directly to the end therefore cannot manufacture approval. Rejection
requires some observed playback and a note. The UI and receipt both disclose
that browser telemetry cannot prove human attention or actual audibility; it is
review-process evidence, not a biometric claim.

## Server revalidation

Before accepting a decision the server rechecks:

- project and Episode ownership;
- completed, registered full-program job identity;
- current edit-branch revision;
- the current process's executor node and storage scope;
- protected playback source binding;
- output path, SHA-256, byte count, and complete decode; and
- the same exact manifest/output identity again inside a serializable,
  advisory-locked transaction.

Reading the review summary is also project- and Episode-scoped, preventing a
valid collaborator from probing another Nest's receipt by job ID.

## UX and boundaries

The full-program player shows observed coverage and the latest decision. The
approval button remains unavailable until coverage is complete enough; change
requests require a note. Successful approval says **No master, upload, or
publication was created**.

The next operation may only *plan* a master conform from the latest exact
approval. It must re-render from immutable exact sources rather than upscale or
relabel the 720p review candidate.

## Evidence

- Shared evidence parser/coverage tests: **4 passed**.
- Server approval/security tests: **4 passed**.
- Advanced Studio playback/decision tests: **5 passed**.
- Prisma format, schema validation, and workspace client generation pass.
- Strict shared-package and web TypeScript pass.
- Cache-disabled production web build emits all **194** static pages,
  standalone output, build identity, and server traces.

Docker Desktop remained unavailable, so the additive migration was generated
and validated but not applied to a retained local database in this checkpoint.
No production migration or deployment occurred.
