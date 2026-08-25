# Fresh private packet isolation proof — 2026-08-24

## Outcome

The retained fresh coaching Session now has two-account browser and API proof that the coach's private transcript review packet remains private while the invited client retains ordinary Session access. The client sees the timed transcript and only deliberately released shared follow-up; they cannot read or create the coach's private packet.

This is automated local evidence. It does not claim a physical-device, TestFlight, production, or minimally instructed human acceptance result.

## Exact source and artifact

- Committed source: `015f19bda2634e53fd99890bafedad157a057967`
- Session: `cmt85591s00c2nxxllzv8y81g`
- Transcript job: `cmt85729100dpnxxlixayoglq`
- Coach: `cmt85564v00binxxlz9k2jble`
- Client: `cmt85591300bwnxxltxasorhf`
- Private packet summary: `cmt858hj900e8nxxltvtxckwp`
- Receipt: `artifacts/coaching-acceptance/8c3c105e/private-packet-isolation-receipt.json`
- Receipt mode: `0600`

## What the operation proved

Using separate authenticated coach and client browser contexts, the operation proved:

- the coach can read the exact private summary in the API and rendered Session;
- the client retains authorized access to the same Session;
- the client API projection contains no private summary, highlights, candidates, or packet-derived accepted tasks;
- the rendered client Session contains none of the coach's private packet markers;
- the client receives no private-packet build action;
- the client UI says that nothing has been shared yet instead of implying that coach review is their next step;
- private packet state and canonical work remained unchanged during the negative read;
- delivery and calendar state remained unchanged; and
- the operation caused no external side effects.

## Failure found before the passing proof

The first operation failed safely and exposed a semantic privacy defect. The client did not read the coach's rows directly. Instead, opening the transcript as the client caused the browser's automatic packet action to create a second client-authored copy from the same transcript.

Five exact test-created rows from that failed attempt were inspected, confirmed to have no attached task, revision, or tag state, deleted, and read back as absent. The retained coach packet and its accepted task were not changed.

The repair addresses the cause at every relevant layer:

- canonical packet authority is the booked coach, then transcript requester, then Session creator;
- GET reconciliation runs only for that canonical reviewer;
- POST refuses participant packet creation before starting a transaction and rechecks authority inside the transaction;
- private notes, candidates, and packet-derived tasks are projected only for the canonical reviewer;
- the client cannot auto-build private material even if a stale or malformed response contains an action; and
- the progress strip and follow-up UI present only transcript and deliberately shared follow-up to participants.

## Verification

- Packet route, follow-through, and Session UI suites: 81 passed, 0 failed.
- Quipsly TypeScript check: passed.
- Tracked worktree was clean when the browser operation started.
- Private-packet isolation operation: passed.

Reproduce with retained local Nest, PostgreSQL, and Firebase emulator services:

```bash
QUIPSLY_COACHING_ACCEPTANCE_CONTEXT="$PWD/artifacts/coaching-acceptance/8c3c105e/fresh-start-context.json" \
  pnpm quipsly:fresh:private-packet-isolation
```

## Remaining acceptance

- Confirm the same negative projection on an authenticated physical client iPhone.
- Confirm an authenticated coach iPhone can read and review the canonical private packet.
- Deliberately release a client follow-up, then prove the client sees only that released output.
- Repeat the boundary against the deployed production release with two clean external accounts.
