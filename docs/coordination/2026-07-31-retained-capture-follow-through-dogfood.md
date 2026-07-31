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

This is retained local authenticated product operation. It does not prove
production persistence for these exact IDs, physical TestFlight installation,
device capture, a real two-person session, external calendar behavior, or
completion of the rehearsal task or goal.
