# Session Finishing Cockpit

Date: 2026-08-06

Status: first ranked projection implemented, tested, and operated in the authenticated local Nest

## Outcome

The Session Recordings and Outputs modes now open with one ranked answer to
“what needs attention next?” The cockpit projects five stages—Recover,
Understand, Repair, Assemble, and Finish—over existing canonical evidence. It
does not create a new workflow record or let a generic status overwrite source,
transcript, analysis, attachment, or delivery truth.

The attention queue sorts by consequence:

1. source exit safety and provenance drift/holds;
2. production-content sufficiency and failed/held transcript attempts;
3. audio-analysis coverage and explicit Studio attachment work.

Each item names the operational consequence and links to the mode that owns the
evidence or action. Missing evidence remains `NOT_OBSERVED`; it is never
rendered as zero defects or completed work.

## Output graph boundaries

- **Recover** requires exact released server masters plus latest drained queue
  receipts from every current expected recording installation.
- **Understand** requires a completed, source-bound transcript with persisted
  segments. Provider text remains an attempt.
- **Repair** becomes in progress when audio evidence exists, but the interface
  explicitly says treatment still needs audition and review. Partial analysis
  creates a coverage item.
- **Assemble** begins with immutable Studio source attachments. Attachment is
  provenance, not editorial completion.
- **Finish** reads governed Session outputs and delivery events. A delivery
  history is still shown as in progress, never as proof that every destination
  or media master is complete.

Podcast rendering and Session follow-up currently have different canonical
output systems. The cockpit does not collapse them. Studio source attachments
are the observed podcast assembly boundary; `SessionOutput` plus
`DeliveryEvent` are the observed client-follow-up boundary. Later delivery
graph work can add mastered media and publication receipts without rewriting
this projection.

## Authenticated operation

The retained coaching rehearsal rendered:

- Recover ready: 4/4 server-safe masters and 1/1 queue receipt drained;
- Understand in progress: one completed source transcript with one retained
  segment;
- Repair in progress with incomplete coverage: 1/4 retained sources analyzed;
- Assemble in progress: one immutable Studio attachment, three verified
  sources ready to attach, and zero handoff integrity holds; and
- Finish in progress: three released follow-up outputs and six delivery events.

Its ranked queue exposed zero source-exit blockers while correctly preserving
five downstream items: capture-test-only content, one incomplete source receipt,
three held/failed latest transcript attempts, incomplete audio-analysis
coverage, and three explicit Studio attachments. This is materially more useful
than the prior flat attention count because it separates “safe to close the
device” from “ready to edit or publish.”

Operating the real UI also caught a copy/state mismatch: partial audio evidence
initially displayed `NOT_OBSERVED` beside text saying evidence existed. The
stage now displays `IN_PROGRESS` while the missing-coverage item remains open.

## Verification

- The cockpit model and real page regression suites pass five tests.
- Quipsly route generation and TypeScript typecheck pass.
- `git diff --check` passes.
- Authenticated browser operation passes against retained canonical records,
  with no sample substitute and no mutations.

## Next depth

The current queue ranks evidence classes. The next serious slice should add
exact source-clock attention items from transcript uncertainty, audible events,
mastery experiments, and edit proposals; estimate review time; and allow one
click to focus the exact range. Output stages should then read versioned audio
masters, rough-cut operation sets, QC/proof-listen receipts, and destination
receipts rather than infer readiness from attachments.
