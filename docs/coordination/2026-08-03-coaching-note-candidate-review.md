# Coaching note candidate review

Status: implemented and locally verified on 2026-08-03.

## Product contract

Transcript-derived coaching notes are suggestions until one authenticated actor explicitly accepts one. Each candidate now supports the same four decisions as transcript-derived tasks and goals:

| Decision | Canonical note | Review receipt | Playback review required |
| --- | --- | --- | --- |
| `EDIT` | No | Yes | No |
| `DEFER` | No | Yes | No |
| `REJECT` | No | Yes | No |
| `ACCEPT` | Exactly one | Yes | Yes, for every segment in the evidence span |

Editing preserves a reviewed draft of the title, body, purpose, and audience. Rejecting or deferring preserves the candidate and the decision. None of those decisions creates a task, goal, reminder, calendar event, message, delivery, Studio edit, or publication.

## Evidence and concurrency boundary

Every decision rechecks, inside one serializable transaction:

- current Session mutation access and production-team note authority;
- current packet summary, packet build, transcript job, recording asset, and lane candidate;
- the provider-processing release gate;
- the packet template and complete transcript snapshot;
- the immutable multi-segment evidence span and provider hashes; and
- protected playback availability.

The packet source is protected by the transcript-packet advisory lock and a row lock. A successful acceptance creates the revisioned canonical note and appends its review receipt in the same transaction. A repeated exact acceptance returns the original note; a changed acceptance conflicts instead of silently mutating it.

## Privacy boundary

Review receipts are append-only packet evidence, but the note-candidate projection selects receipts only when `reviewedByUserId` matches the current actor. Another collaborator's private edit, rejection, or deferral cannot become the current actor's candidate state. Canonical note visibility remains an explicit choice: author private, Session shared, client safe, or project team where the actor has the required role.

## Verification evidence

- Focused API, projection, request-model, and UI suites: 61 passing tests.
- Full Nest Jest run: 244 passing suites and 1,296 passing tests (37 suites and 108 tests intentionally skipped by their existing gates).
- Cross-surface Quipsly contracts: 254/254 passing.
- Strict Quipsly TypeScript check: passing.
- Optimized Next.js production build: 163/163 pages generated with an explicit 8 GB Node heap. The default 4 GB heap compiled successfully but exhausted memory during its TypeScript phase.
- Coverage includes provider-only refinement without materialization, multi-segment acceptance, actor-isolated receipt projection, accepted-note receipt binding, stale packet refusal, and edited-draft UI behavior.

The retained local Nest was also operated through the rendered UI with the test-only retained coach account. Quipsly built a packet from synthetic coaching media, saved an edited client-follow-up draft, and read the exact title/body back. PostgreSQL readback showed one `EDIT` receipt for the actor and zero canonical notes for that candidate. Because the complete source span was not yet playback-reviewed, the rendered canonical-save control remained disabled.
