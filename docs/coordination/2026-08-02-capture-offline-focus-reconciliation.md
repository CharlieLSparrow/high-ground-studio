# Capture offline focus reconciliation checkpoint

Date: 2026-08-02
Branch: `codex/quipsly-product-20260724`

## Outcome

Quipsly Capture can now protect a Today focus-block decision on the iPhone
before contacting Nest, retain it across process death, and reconcile it with
one idempotent canonical receipt when connectivity returns.

Completing a focus block records explicit actual minutes only. It does not
complete the linked Task or Goal and does not mutate an external calendar.

## Production contract

- The iPhone ledger is file protected and keeps a last-known-good copy.
- Entries are partitioned by the opaque verified Quipsly owner ID.
- Each operation stores one UUID, block ID, desired status, explicit actual
  minutes, and the Nest revision observed before the offline decision.
- A second unresolved decision for the same block is rejected.
- Network and server failures remain retryable with the same UUID.
- Conflicts and acknowledgement mismatches are held for explicit review.
- A held decision can be retried or discarded; a merely pending decision
  cannot be silently discarded.
- Nest stores the exact operation in `lastMobileFocusOperation` in addition to
  bounded receipt history, so a lost-response replay still works after older
  receipt history has rolled over.
- Reuse of one UUID for different intent is rejected with conflict semantics.

## Reachable iPhone UX

Today exposes a **Protected focus outbox** card with:

- saved-on-iPhone versus needs-review state;
- explicit actual minutes;
- a reminder that linked work remains unchanged;
- Retry for every unresolved decision;
- Discard only for a held conflict.

The focused simulator operation terminated and relaunched Capture and proved
that the same 35-minute pending decision remained visible after process death.
The simulator identity accommodation is compiled only into DEBUG simulator
builds. Release and physical-device account enforcement are unchanged.

## Retained local operation

The retained operation used rendered Nest at `http://127.0.0.1:3012`, the local
Firebase Auth emulator, and loopback PostgreSQL. It preserved a real coaching
Goal, Task, and focus block under the retained client account, then:

1. posted one stable 23-minute phone decision;
2. repeated the identical request to model a lost response;
3. observed idempotent acknowledgement with the same receipt and revision;
4. reloaded the rendered Schedule and saw `23 actual minutes recorded`;
5. read the same completed block and 23 minutes through Capture Today;
6. read back exactly one matching database receipt;
7. confirmed the Task remained `OPEN` and the Goal remained `ACTIVE`;
8. confirmed no provider or external-calendar side effect was claimed.

No retained artifact was deleted. No external service, message, calendar,
production deployment, or billing system was mutated.

## Verification

- Swift persistence/relaunch harness: passed.
- Focus API route suite: passed, including lost-response replay beyond bounded
  history and request-identity conflict.
- Cross-surface offline focus contract: passed.
- Retained-operation safety contract: passed.
- Focused iPhone simulator process-death UI test: passed.
- Rendered retained operation plus database and mobile-projection readback:
  passed.

Physical-iPhone failure recovery remains a separate release gate. This
checkpoint does not claim that hardware proof.
