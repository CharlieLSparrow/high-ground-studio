# Fresh native transcript task readback — 2026-08-24

## Outcome

A clean two-account iPhone simulator flight proved that an explicitly reviewed transcript suggestion becomes one private coach task, appears in the coach's native Today surface, and returns to its exact protected transcript source. The other active participant in the same coaching Session retained the shared transcript without receiving the coach-owned task or any private packet controls or output.

## Durable evidence

- Source revision: `c6bb01aa0b54597dcdb0327f953fcef9b0690879`
- Fresh context: `artifacts/coaching-acceptance/8c3c105e/fresh-start-context.json`
- Operation receipt: `artifacts/coaching-acceptance/8c3c105e/native-task-readback-receipt.json`
- Canonical task: `cmt85hhcb00f5nxxls3axkyoe`
- Session: `cmt85591s00c2nxxllzv8y81g`
- Coach readback result: `/private/tmp/quipsly-fresh-transcript-task-readback-20260825T060944604Z-6406.xcresult`
- Participant isolation result: `/private/tmp/quipsly-fresh-transcript-task-isolation-20260825T061032144Z-6406.xcresult`

## Product truth proved

- The fresh coach signed into a clean app container and saw the exact canonical task in Today.
- The task title matched the reviewed human edit: **Send the coaching recording to the instructor**.
- The source control opened the protected transcript review for the exact Session and segment rather than substituting a room-level approximation.
- The native source view exposed the recorded wording and an honest local-source availability boundary.
- A fresh client account with active access to the same Session loaded Today without receiving the coach-owned task.
- The client opened the same Session's timed transcript in Capture without receiving private packet candidates, private packet progress, or a packet-build action.
- The client instead received a prominent **Shared follow-up** boundary with the ordinary unreleased state, **Nothing has been shared yet**.
- The shared-follow-up boundary is one coherent VoiceOver announcement rather than a visually correct but fragmented accessibility container.
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

## Native source and privacy UX repair

The authenticated flight also exposed two navigation defects that ordinary component tests did not reveal:

- a deep source link could push the linked-work context and recording-source truth outside SwiftUI's instantiated lazy region; and
- the participant's shared-follow-up boundary originally appeared after the full transcript, making an important privacy state practically undiscoverable.

Capture now pins the linked-work context, presents recording-source truth in a deterministic sheet, and places the participant's shared-follow-up state before the transcript. The acceptance operation verifies the rendered result under both authenticated identities rather than inferring it from API policy.

## Honest boundary

This is strong local two-account iPhone simulator evidence, not physical-device or minimally instructed human acceptance. It does not prove TestFlight behavior, natural-speech comprehension, real microphone or camera routing, human understanding of the task/source affordance, or production deployment. Those checks remain in the deferred validation ledger and do not stop independent product work.
