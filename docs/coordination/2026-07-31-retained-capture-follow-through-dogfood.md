# Retained Capture-to-follow-through dogfood

Checkpoint: 2026-07-31 MDT

## Product outcome

The dedicated local QA account operated the rendered Quipsly product from a
new media-production Nest through canonical note, tag, task, goal,
task-to-goal relationship, progress evidence, Calendar planning, and Today
readback. This was real persisted product use, not an API-only fixture or a
preview form submission.

The user explicitly authorized retaining useful QA artifacts. Every artifact
uses a visible `QA Retained ·` label and remains available for longitudinal
regression.

## Durable QA corpus

- Account: `quipsly-media-ms8ct81g@example.test`
- Nest: `qa-retained-capture-to-follow-through-lab`
- Nest ID: `cms8n5a51003lz3xlpjc2clh0`
- Seed document: `cms8n5a53003mz3xladb5b2gp`
  - **QA Retained · Episode Operations Log**
- Note: `cms8n64d7003uz3xlae53d5cl`
  - **QA Retained · Build 20 rehearsal truth**
- Canonical tag: `cms8n64d3003tz3xl05yp1bne`
  - `#rehearsal`
- Task: `project-task-e03cee7b-d9bc-4405-bd7a-42fe4ff9b0a2`
  - **QA Retained · Run physical Build 20 rehearsal**
- Goal: `project-goal-d7ebde5f-e2b7-40e8-bdde-fb61fc95cfb0`
  - **QA Retained · Prove one complete Capture-to-Nest episode loop**
- Recovery Nest: `qa-retained-build-20-portable-recovery`
- Recovery Nest ID: `cms8nnj320041z3xle2bggohm`
  - **QA Retained · Build 20 Portable Recovery**

## Operated flow

1. Created a private **Media production** Nest through the rendered Projects
   form. The app created its first writing document and opened the canonical
   Nest.
2. Captured the rehearsal-truth note and created `#rehearsal` in the same
   transaction. The opened document showed the exact tag, body, private
   boundary, version/portable-backup controls, and `Saved` state.
3. Captured the rehearsal task from the Nest, selected the existing canonical
   tag, and received an exact task link. The Nest Work count advanced without
   creating a second tag.
4. Captured the episode-loop goal, reused `#rehearsal`, and received an exact
   goal link. Project Work showed the same task and goal records rather than
   projections with new identity.
5. Opened global Work through the task ID. Both records retained their Nest and
   tag. Expanded **Connect another committed task**, linked the task as
   `CONTRIBUTES`, and read back the relationship after mutation.
6. Recorded 25% progress with explicit evidence that only infrastructure and
   software delivery are complete. The goal remained Active; neither the goal
   nor task changed status by implication.
7. Calendar planned a private 25-minute focus block for the exact task.
   Readback stated that no Google Calendar event, task deadline, or goal target
   changed.
8. Today then showed the selected focus block and the active goal, both with
   `#rehearsal`. Before deliberate planning, Today correctly omitted the
   ordinary undated task from its bounded attention queue.

## Retained portability replay

The same QA account exported the source Nest through the rendered
**Download verified JSON** control and restored it into the retained Recovery
Nest. The package remains at:

`/Users/wall-e/Downloads/quipsly-qa-retained-capture-to-follow-through-lab-nest-2026-07-31.json`

- File SHA-256:
  `56cee2a0297f4acaa60c5fd0dfa6c66f817f64db444a5e46d550caeffd16c80f`
- Verified manifest SHA-256:
  `6aa9d5b397ea31076c649d021e8e8dfaa96a58a5cf6ece6a2d6c94cde9d837bd`
- Export counts: 1 tag, 2 notes, 3 blocks, 1 task, 1 goal,
  1 progress receipt, 1 goal-task link, and 1 focus block
- Deliberate exclusions remained true: no media bytes, Sessions,
  collaborator assignments, credentials, provider data, external fetches, or
  external side effects

The first validate/apply cycle created the complete private corpus with:

- 1 canonical tag and 1 document-tag link
- 2 notes and 3 exact blocks
- 1 actor-scoped task
- 1 actor-scoped goal, its 25% progress receipt, and its task relationship
- 1 focus-history snapshot restored as `CANCELED`
- 0 overwrites, 0 source mutations, and 0 external effects

The second validate/apply cycle created nothing. It reused the tag, both
notes, the task, the goal, and the canceled focus snapshot while preserving
the same manifest and deterministic identities.

Independent PostgreSQL readback confirmed:

- restored note stable IDs:
  - `portable-note-9b4c6e599d11ef9774d825aeb02bbdd7d0a20a3d6472e3ca4f8e`
  - `portable-note-c6be366d722cfeb72b12c6bdd7dc467426f704862761cdd21f88`
- restored task:
  `portable-task-8b4e63326829e3eb27f106adfe3defa1e553ff80d597ff469692`
- restored goal:
  `portable-goal-31374124076143996a83014cf37c3b677266958df8214e23743f`
- restored focus snapshot:
  `portable-plan-5660284b214edc7070a6bbadaf5aa1a1b17afaddb1b7c6724716`
- exact counts: 2 notes, 3 blocks, 1 tag, 1 task, 1 goal,
  1 progress receipt, 1 goal-task link, and 1 canceled focus snapshot
- safety counts: 0 active reminders and 0 active recurrence series

The rendered Recovery Nest then showed **Notes 3** (including its landing
document), **Work 2**, `#rehearsal`, the exact next task, and the active goal
with **25% recorded progress**. Opening the restored rehearsal-truth note in
the writing desk showed the exact body, private boundary, canonical tag, and
`Saved` state.

Focused verification passed:

- portability contract, API, and UI: 4 suites / 14 tests
- real PostgreSQL restore integration: 1 suite / 1 test
- two-run Keychain and Firebase identity recovery: pass
- rendered Nest to canonical tag to project/global Work to Today: pass
- phone-width Today overflow and browser-exception check: pass

## UX observations

- The project capture surface makes Note, Task, and Goal available without
  changing project context, and its canonical-tag copy is unusually clear.
- Note capture spends roughly two seconds in `Saving…` before opening the
  document. Persistence is correct, but a visible success transition or
  destination hint would make the latency feel more intentional.
- Task and Goal stay on the project overview after save and expose exact
  follow-through links. This is calmer than an automatic context switch for
  action records.
- Goal-to-task linking is deliberately tucked behind a disclosure. It is
  discoverable in the focused goal, but not visible in the project-level Work
  projection; that projection remains read-only by design.
- Calendar and Today consistently explain non-effects. The real operation
  confirmed that planning does not masquerade as a deadline, completion,
  provider event, or promise to another person.

## Boundary

The emulator identity is reproducible from the canonical database UID and an
exact `.test` password stored under macOS Keychain service
`com.quipsly.qa.retained-product`. No password packet or unredacted identity is
written to the receipt.

This is retained local authenticated product operation. It does not prove
production persistence for these exact IDs, physical TestFlight installation,
device capture, a real two-person session, external calendar behavior, or
completion of the rehearsal task or goal. The Firebase Auth Emulator process
is disposable and may be recreated; the PostgreSQL QA corpus, canonical UID,
local Keychain item, and exported package are the retained longitudinal
artifacts.
