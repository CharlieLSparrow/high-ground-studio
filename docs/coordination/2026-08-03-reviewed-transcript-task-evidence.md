# Reviewed transcript evidence on existing tasks

Date: 2026-08-03

## Outcome

Nest and Quipsly Capture can now add a human-reviewed transcript task
candidate to an existing canonical task as append-only evidence. The operation
does not overwrite the task or create a lookalike duplicate.

The selected task keeps its identity, title, detail, status, assignee, due date,
completion date, reminder, recurrence, tags, goal links, project, and
`updatedAt`. The transcript source is stored in a separate immutable evidence
receipt with the packet candidate, recording, transcript job, room, exact
segment span, review actor, decision, and prior target snapshot.

## User experience

- Packet review offers **Add to existing task** alongside the existing accept,
  edit, and dismiss decisions.
- Only open tasks owned by the signed-in actor and belonging to the same Nest
  project are offered as targets.
- Before confirmation, web and iPhone state exactly which task properties will
  remain unchanged.
- Today and Work show the latest appended transcript evidence without changing
  the task itself.
- The evidence link returns to the exact reviewed transcript span and its
  recording playback.
- Explicit phrases such as “the goal is to…” may become quarantined review
  candidates. They never create or change work without a human decision.

## Data and concurrency contract

`ActionItemEvidenceReceipt` is an append-only task child. The merge endpoint
runs in a serializable transaction, locks and rechecks the packet and task,
requires the caller's expected task `updatedAt`, and rejects stale, foreign,
closed, cross-project, unreviewed, unreleased, or unplayable sources.

An exact retry returns the original task and receipt identities. A conflicting
retry is rejected. The evidence receipts are included in portable Nest export
and deterministic restore.

## Operated acceptance

The compiled iPhone Simulator app performed the complete local workflow against
the local Nest service and PostgreSQL database:

1. opened a retained coaching session;
2. played and confirmed each source segment;
3. built a current deterministic packet;
4. selected an existing task that already had a reminder, weekly recurrence,
   tag, goal link, project, owner, detail, status, and due date;
5. appended one reviewed-evidence receipt;
6. relaunched the app into Today;
7. opened the evidence from that unchanged task;
8. returned to the exact three-segment transcript source; and
9. replayed the merge request without adding a second receipt.

Result bundle:
`/private/tmp/quipsly-packet-task-evidence-merge-1785775620940-9650.xcresult`

Operation receipt:
`/private/tmp/quipsly-packet-task-evidence-merge-receipt-1785775787498-9650.json`

No cloud build, Cloud Run deployment, calendar mutation, delivery, or
publication occurred in this slice.
