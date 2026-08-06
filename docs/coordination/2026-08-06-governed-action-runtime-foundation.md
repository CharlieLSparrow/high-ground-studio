# Governed action runtime foundation

Date: 2026-08-06

## Outcome

Quipsly now has one provider-neutral execution ledger underneath its mature
writing assistant and Session preflight. This is the first production-shaped
slice of the operating-agent architecture described in
`docs/research/2026-08-06-quipsly-capability-depth-and-operating-agent.md`.

The implementation does not create a new chatbot or a generic worker queue.
It records what became consequential to a user:

1. one run captures intent, principal, authority snapshot, read set, budget,
   consequence, progress, and completion;
2. one or more typed actions name registered capability/version contracts;
3. execution or recovery creates numbered attempts;
4. every proposal, decision, execution, and recovery appends an immutable
   receipt; and
5. the canonical domain object remains truth. The action ledger points to it
   and reports what it observed; it does not replace it.

## Capability manifest

`packages/quipsly-domain/src/governed-actions.ts` is the shared registry. Every
manifest declares:

- user promise and supported object types;
- project, document, or Session scope;
- decision policy and risk;
- observable consequences and evidence;
- retry, supersession, compensation, or undo behavior;
- first-party/API/MCP exposure policy;
- accessibility contract; and
- current qualification level.

The runtime fails closed on an unregistered assistant tool kind. Payloads for
Session preflight, draft, and rewrite capabilities have additional bounded
shape checks before any ledger row is written.

## First two adapters

### Writing assistant

One assistant request is one `GovernedActionRun`; every returned tool proposal
is one `GovernedAction`. Existing `StudioAssistantAction` rows retain their UI
and document-kernel compatibility and point one-to-one to the new action.

The adapter retains:

- exact project/document authority and actor snapshot;
- source object identities and content hashes rather than duplicating source
  prose in the run read set;
- provider/model identity without treating provider text as executable;
- explicit-approval policy;
- proposal payload and envelope hashes;
- append-only decision, execution, and recovery receipts; and
- the proven stale-source and reversible document-operation behavior.

Direct **Apply persisted edit** or **Commit to Story Bible** is treated as the
human's explicit approval and successful execution, not as an agent bypass.
Undo appends a recovery attempt/receipt. The writing UI exposes the capability,
run/action suffixes, and review policy inside an optional details control; it
does not introduce another approval dialog.

### Session preflight

`quipsly.session.preflight.publish` is the first non-writing capability. The
participant's deliberate submission is `USER_INITIATED`, so it executes
without a redundant approval prompt after the existing Session authorization
boundary accepts it.

The run and action state transition is:

`EXECUTING / READY -> SUCCEEDED`

inside the same PostgreSQL transaction that appends the canonical
`CallParticipantPreflightReceipt`. Failure in either ledger aborts both. The
domain receipt points to the exact governed action, while repeat submission of
the same domain request returns the same action identity.

The retained consequence boundary is explicit:

- sample bytes retained: false;
- sample bytes uploaded: false;
- recording started: false;
- provider joined: false; and
- source truth changed: false.

The Session readiness card exposes the governed action receipt suffix beneath
the existing private-playback facts.

## Data model

Migration `20260806153000_add_governed_action_runtime` introduces:

- `GovernedActionRun`;
- `GovernedAction`;
- `GovernedActionAttempt`; and
- `GovernedActionReceipt`.

Actor IDs/emails are immutable audit snapshots rather than foreign keys that
would erase history during account lifecycle changes. Project and Session
relations are optional projections and use `SET NULL` on deletion so the
action evidence survives. Domain links from writing actions and preflight
receipts also use `SET NULL`; deleting runtime evidence never cascades into
canonical creative or Session truth.

## Operated evidence

The local PostgreSQL migration applied successfully after Prisma validation
and generation. The retained assistant mutation operation exercised an exact
rewrite, idempotent replay, stale-source refusal, and safe undo. PostgreSQL read
back:

- one `quipsly.writing.rewrite.propose` action;
- one execution attempt and one recovery attempt;
- proposal, execution-success, and recovery-complete receipts;
- final action state `UNDONE`; and
- final run state `SUCCEEDED` because the requested lifecycle completed and
  the resulting document was safely restored.

The retained native-style Session operation then exercised the actual local
HTTP route with coach, client collaborator, and disposable outsider accounts.
It proved:

- two distinct iPhone endpoints and actors;
- current `READY` receipts for both collaborators;
- exact action identity under idempotent replay;
- conflict on changed evidence under the same request ID;
- no fresh readiness from a three-hour-old offline receipt;
- outsider HTTP 404;
- one succeeded attempt and one immutable execution receipt per new action;
- a canonical preflight-to-governed-action relation; and
- no private sample bytes in either ledger.

The first HTTP operation correctly failed after the schema migration because
the already-running Next process still held the pre-migration Prisma client and
had no `governedActionRun` delegate. `scripts/dev/quipsly-local-up.sh --replace`
regenerated Prisma, confirmed all migrations, restarted the owned local
services from this worktree, and restored the retained auth-emulator identities
before the operation passed. Hot reload is not sufficient evidence after a
Prisma client shape change.

## Verification

- Prisma format, validation, client generation, and local migration: pass.
- `@high-ground/quipsly-domain` typecheck: pass.
- Quipsly TypeScript: pass.
- Six focused assistant/preflight/runtime/UI suites: 31 tests pass.
- Three Session topology/transparency suites: 12 tests pass.
- Retained assistant PostgreSQL integration: 7 tests pass.
- Retained native-style HTTP/PostgreSQL Session operation: pass.
- Retained operation static boundary tests: 2 tests pass.
- Quipsly optimized production build, including all 181 static pages: pass.

## Honest remaining boundary

This is an operated local foundation, not a production-qualified autonomous
agent. Existing historical assistant/preflight rows remain readable but are
not rewritten to fabricate new runtime history. A central action/run console,
explicit delegated capability grants, scheduled/API principals, cost metering,
failure/retry operation, and portable action export remain future slices.

Physical-iPhone Session operation, production preview/readback, retained
recording/upload/editor playback, and the goal's broader episode/coaching
acceptance gates remain open.
