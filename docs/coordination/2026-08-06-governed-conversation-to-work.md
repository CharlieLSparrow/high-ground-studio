# Governed conversation-to-work

Date: 2026-08-06

Status: implemented locally; production and physical-device qualification remain open

## Outcome

An explicit human decision to turn reviewed transcript evidence into a canonical
Goal or Task now uses the same governed action runtime as writing operations and
Session preflight. The canonical work object and its action run, attempt, and
immutable execution receipt are committed atomically.

This does not introduce another goal, task, transcript, or agent model. It adds
an execution and support ledger around the existing canonical `Goal` and
`ActionItem` materialization paths.

## Existing product depth retained

The Session review system already had the important product boundary:

- immutable provider transcript segments and exact recording/time evidence;
- playback review before a provider-derived candidate can become work;
- ACCEPT, EDIT, MERGE, REJECT, and DEFER decisions with stable request identity;
- candidate state separate from canonical Notes, Goals, and Tasks;
- stale packet and changed-evidence refusal inside the commit transaction;
- source return from canonical work to the exact Session segment; and
- Today, coaching continuity, and client-follow-up projections over canonical
  work rather than over AI suggestions.

The missing cross-cutting layer was a typed record of the consequential
operation itself: who exercised which capability, under what current authority,
against which exact evidence, what became true, and which recovery class
applies.

## Capabilities

Two capability manifests are registered:

- `quipsly.session.transcript-goal.materialize`
- `quipsly.session.transcript-task.materialize`

Both are medium-consequence, user-initiated operations. They require an exact
room, transcript segment, provider evidence hash, title, current authority, and
playback/source evidence. They are explicitly unable to rewrite transcript
truth, mutate recording bytes or clocks, schedule a reminder or calendar event,
deliver a message, or publish an output.

## Transaction and receipt contract

The runtime records:

- the initiating human and current room/project authority snapshot;
- the exact evidence/read set and request/payload hashes;
- the canonical target object type and ID;
- one succeeded attempt and one immutable execution receipt;
- zero provider calls, external writes, and measured cost for this operation;
- a plain-language result and explicit consequence boundaries; and
- a source reference embedded in the canonical Goal or Task provenance.

If target creation fails, the action records roll back. If action recording
fails, target creation rolls back. Exact request replay returns the existing
canonical object and receipt. A changed payload under the same identity fails
closed. Historical objects created before this runtime return no fabricated
governance history.

## Surfaces covered

- Direct transcript-to-Goal creation in Nest and Capture.
- Direct transcript-to-Task creation in Nest and Capture.
- ACCEPT of a reviewed packet Goal candidate.
- ACCEPT of a reviewed packet ActionItem candidate.
- Session Review readback shows the short governed receipt identity after a
  successful Goal or Task creation.

EDIT, REJECT, and DEFER remain append-only packet review decisions and do not
materialize work. MERGE still uses its existing candidate/canonical decision
receipt and is not yet adapted to the governed action runtime. Notes and
client-visible follow-up are also not yet adapted.

## Retained operation and fixture repair

The compiled Capture acceptance journey clones the retained coaching packet,
installs an exact checksum-verified local recording into an iPhone simulator,
requires playback across the complete three-segment thought, accepts a Note,
Goal, and actor-owned Task, and reads canonical PostgreSQL state back
independently.

This operation exposed a real retention defect: the older canonical fixture
referenced a vanished macOS temporary file. The operation now recovers by
creating a versioned durable synthetic source under ignored retained-media
artifacts, binds every newly cloned recording asset and release receipt to the
new exact bytes and checksum, and never mutates the older canonical source
record. It also uses Capture's direct Transcript jump rather than assuming a
fixed number of swipes through a growing candidate queue. Capture now exposes
direct Notes, Goals, Tasks, Transcript, and whole-queue jumps so those semantic
destinations remain reachable as packet depth grows.

The retained operation passed on the compiled iPhone 17 Pro simulator. It
played and human-confirmed all three exact-source segments, then materialized
exactly one reviewed Note, one actor-owned Task, and one Goal with zero calendar
links or external effects. The independent database readback correlated:

- Goal `transcript-goal-01530fa9582239aa570aa157` to governed action
  `cmsh7kpli002t24xl7h3zzboc` and receipt
  `cmsh7kpll002v24xln50m4euw`;
- Task `cmsh7kvow002w24xljotrvnyc` to governed action
  `cmsh7kvp0002y24xlf1s1we2n` and receipt
  `cmsh7kvp6003024xlxna7hkov`; and
- Note `transcript-note-9476994713f4fbe0f997cf24` to its reviewed packet
  decision.

The result bundle is
`/private/tmp/quipsly-reviewed-packet-materialization-1786002013294-49884.xcresult`.
This proves the compiled application, local checksum-bound playback,
authenticated HTTP mutation, canonical database state, Today discoverability,
and governed receipts agree. It does not prove physical-iPhone storage/recovery
or production deployment.

## Honest limits and next slice

The next conversation-to-work depth should adapt, in order:

1. MERGE into an existing Goal or Task, with before/after object version and a
   truthful supersession or undo contract;
2. reviewed coaching Notes, including private/team/client visibility ceilings;
3. client-visible follow-up and delivery, with a separate delivery capability
   and destination readback; and
4. a central activity view that can explain and reopen source, target, run,
   receipt, recovery, and unresolved holds without exposing private evidence.

No production deployment, physical-device claim, external delivery, calendar
mutation, provider mutation, or publication is part of this checkpoint.
