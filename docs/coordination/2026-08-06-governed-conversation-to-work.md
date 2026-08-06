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

Four capability manifests are registered:

- `quipsly.session.transcript-goal.materialize`
- `quipsly.session.transcript-task.materialize`
- `quipsly.session.transcript-goal-evidence.merge`
- `quipsly.session.transcript-task-evidence.merge`

All are medium-consequence, user-initiated operations. Materialization requires
an exact room, transcript segment, provider evidence hash, title, current
authority, and playback/source evidence. Evidence merge additionally requires
an explicitly selected existing target and its exact current revision. They are
explicitly unable to rewrite transcript truth, mutate recording bytes or
clocks, change an existing Goal or Task definition/status/ownership/planning,
schedule a reminder or calendar event, deliver a message, or publish an output.

## Transaction and receipt contract

The runtime records:

- the initiating human and current room/project authority snapshot;
- the exact evidence/read set and request/payload hashes;
- the canonical target object type and ID, plus exact before/after snapshots for
  evidence merge;
- one succeeded attempt and one immutable execution receipt;
- zero provider calls, external writes, and measured cost for this operation;
- a plain-language result and explicit consequence boundaries; and
- a source reference embedded in the canonical Goal or Task provenance.

If target creation fails, the action records roll back. If action recording
fails, target creation rolls back. Exact request replay returns the existing
canonical object and receipt. A changed payload under the same identity fails
closed. Historical objects created before this runtime return no fabricated
governance history. MERGE appends an immutable transcript-evidence receipt; it
does not silently rewrite the target. Recovery is an explicit superseding
evidence review, preserving both the original source and prior review decision.

## Surfaces covered

- Direct transcript-to-Goal creation in Nest and Capture.
- Direct transcript-to-Task creation in Nest and Capture.
- ACCEPT of a reviewed packet Goal candidate.
- ACCEPT of a reviewed packet ActionItem candidate.
- MERGE of a reviewed packet Goal candidate into one explicitly selected Goal.
- MERGE of a reviewed packet ActionItem candidate into one explicitly selected
  Task.
- Session Review readback shows the short governed receipt identity after a
  successful Goal or Task creation or evidence merge.
- Capture Today and Work show the latest merged evidence, governed receipt, and
  a direct return to the exact transcript source after relaunch.

EDIT, REJECT, and DEFER remain append-only packet review decisions and do not
materialize work. Notes and client-visible follow-up are not yet adapted.

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

Two focused retained operations then exercised evidence MERGE independently so
the richer existing Goal and Task state could be compared before and after.
Both used the compiled iPhone 17 Pro simulator, played and confirmed all three
source segments, explicitly selected one existing target, rendered the governed
receipt after relaunch, returned from Today to the exact transcript source, and
proved exact replay did not duplicate evidence.

- Goal `mobile-goal-fc728991-28ea-4b68-ae2f-0d8befc1bf37` retained its numeric
  progress and complete definition while appending evidence receipt
  `a9a46173-1e97-42ca-9116-d7dc75de97f0`, governed action
  `cmsh9antv007l24xlgbx88e8g`, and governed receipt
  `cmsh9anty007n24xl5kq9wntt`. Result bundle:
  `/private/tmp/quipsly-packet-goal-evidence-merge-1786004948741-70308.xcresult`.
- Task `qa-task-evidence-1786004807630-b5666a` retained its identity, content,
  status, owner, dates, reminder, recurrence, tags, goal links, project, and
  explicit planning block while appending evidence receipt
  `ee5bad6f-3808-4af8-b226-dff9acf845bb`, governed action
  `cmsh97kt6006e24xl1u7pja39`, and governed receipt
  `cmsh97ktd006g24xl3yb63765`. Result bundle:
  `/private/tmp/quipsly-packet-task-evidence-merge-1786004808668-69306.xcresult`.

The Task operation also exposed a retained-test assumption rather than a merge
defect: a mature QA account can have more than Today's bounded 20 tasks. The
fixture now creates a real planned focus block and proves it remains unchanged,
so discoverability is tested through the product's ranking contract rather
than through an accidentally empty account.

## Honest limits and next slice

The next conversation-to-work depth should adapt, in order:

1. reviewed coaching Notes, including private/team/client visibility ceilings;
2. client-visible follow-up and delivery, with a separate delivery capability
   and destination readback; and
3. a central activity view that can explain and reopen source, target, run,
   receipt, recovery, and unresolved holds without exposing private evidence.

No production deployment, physical-device claim, external delivery, calendar
mutation, provider mutation, or publication is part of this checkpoint.
