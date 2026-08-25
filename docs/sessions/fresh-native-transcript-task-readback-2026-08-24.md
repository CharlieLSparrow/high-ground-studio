# Fresh native transcript task readback — 2026-08-24

## Outcome

A clean two-account iPhone simulator flight proved that an explicitly reviewed transcript suggestion becomes one private coach task, appears in the coach's native Today surface, and returns to its exact protected transcript source. The other active participant in the same coaching Session did not receive the coach-owned task.

## Durable evidence

- Source revision: `1b19d7cc27ac907c0965bb738974d97ae755dc85`
- Fresh context: `artifacts/coaching-acceptance/8c3c105e/fresh-start-context.json`
- Operation receipt: `artifacts/coaching-acceptance/8c3c105e/native-task-readback-receipt.json`
- Canonical task: `cmt85hhcb00f5nxxls3axkyoe`
- Session: `cmt85591s00c2nxxllzv8y81g`
- Coach readback result: `/private/tmp/quipsly-fresh-transcript-task-readback-20260825T043702804Z-69195.xcresult`
- Participant isolation result: `/private/tmp/quipsly-fresh-transcript-task-isolation-20260825T043733459Z-69195.xcresult`

## Product truth proved

- The fresh coach signed into a clean app container and saw the exact canonical task in Today.
- The task title matched the reviewed human edit: **Send the coaching recording to the instructor**.
- The source control opened the protected transcript review for the exact Session and segment rather than substituting a room-level approximation.
- The native source view exposed the recorded wording and an honest local-source availability boundary.
- A fresh client account with active access to the same Session loaded Today without receiving the coach-owned task.
- The operation confirmed the canonical task was not mutated and no duplicate task was created.
- Both selected UI tests passed with zero unexpected runtime warnings.

## Isolation repair

The first client-side flight exposed an overbroad participant-level task query: room access could project a task explicitly assigned to another participant. Revision `1b19d7cc` centralized task visibility and mutation scope so assigned work is personal, while deliberately unassigned Session or project work remains shared. The same policy now governs native Today, task status changes, focus-block planning, project Work, and global search.

The repair is covered by:

- canonical predicate unit tests;
- 38 focused Today and workspace-search tests;
- strict Quipsly TypeScript checking;
- a PostgreSQL integration flight proving another assignee's task is absent from project Work and search while an unassigned Session task remains visible; and
- the clean coach/client native simulator operation that originally detected the leak.

## Honest boundary

This is strong local two-account iPhone simulator evidence, not physical-device or minimally instructed human acceptance. It does not prove TestFlight behavior, natural-speech comprehension, real microphone or camera routing, human understanding of the task/source affordance, or production deployment. Those checks remain in the deferred validation ledger and do not stop independent product work.
