# Capture weekly plan and reflection operation

Date: 2026-08-03

## Outcome

Nest Work and Quipsly Capture now share one canonical weekly-plan mutation.
The signed-in iPhone app can create or edit up to three commitments, requested
support, an honest reflection, and an explicit client-review decision. It
protects the complete intent locally before network use and reads the exact
canonical values back after process relaunch.

## Architecture

`saveWeeklyCommitmentInTransaction` is the single mutation kernel for Nest and
Capture. It provides:

- Monday/date and bounded-text normalization;
- serializable database execution;
- optimistic `updatedAt` concurrency;
- stable request and receipt UUIDs;
- intent-hash replay and identity-conflict detection;
- fail-closed inactive/stale behavior;
- bounded append-only client-plan receipts;
- an explicit no-external-side-effects receipt.

Capture adds an account-partitioned, complete-file-protected outbox with
main/last-known-good recovery, one unresolved decision per week, stable retry
identity, and separate pending/held/discard paths. An optimistic local overlay
keeps the Today card understandable while the outbox is unresolved.

The weekly plan is not a Task, Goal, calendar event, message, or provider
instruction. Reflection records what the person said happened; it does not
infer completion. Once a client review is recorded, the editor explains that
it remains part of audit history instead of allowing the timestamp to be
silently removed.

## UX findings from operating the app

The first compiled run found that multiline fields did not provide an explicit
keyboard-dismissal action, making the lower reflection field difficult to
reach. The shipping editor now has a standard keyboard `Done` control backed
by explicit focus state.

The next run found that a synthetic center tap on the long review label could
hit text instead of the switch. The acceptance journey now operates the
trailing control hit target and proves the bound value changed before save.

These were product findings, not test-only accommodations: both would have
made a real person wonder why the form was fighting them.

## Operated acceptance

The retained operation used:

- the compiled iPhone app on iPhone 17 Pro Simulator;
- a real retained Firebase/Quipsly client identity from protected Keychain;
- the live local Nest process at `http://127.0.0.1:3012`;
- local PostgreSQL as the independent canonical readback boundary;
- app termination and relaunch between save and readback.

It proved exact commitments, support, reflection, and reviewed state after
relaunch. Independent before/after snapshots proved no change to the client's
Task, Goal, or focus-block counts and no change to appointment, calendar-link,
delivery, Nest-chat, or provider-event counts.

Preserved result bundle:

`/private/tmp/quipsly-retained-native-weekly-plan-1785797177137-35735.xcresult`

## Verification

- compiled signed-in iPhone operation: 1/1 passed;
- process-relaunch canonical readback: passed;
- independent work/external boundary readback: passed;
- weekly-plan server/Nest route suite: 55/55 passed;
- protected Swift outbox harness: passed;
- deterministic weekly-plan editor UI: 1/1 passed;
- Quipsly TypeScript typecheck: passed;
- mobile capture contract smoke: passed;
- App Store/capture static smoke: passed;
- local Nest lifecycle doctor: passed.

## Delivery boundary

This is committed local release-train source only. It did not deploy Nest,
upload a TestFlight build, mutate cloud/billing/provider configuration, or
claim physical-iPhone proof. Those remain coordinated release gates.

## What this unlocks

The important reusable pattern is not merely a weekly form. It is a shared
human-decision kernel with protected mobile intent, concurrency, provenance,
and independent readback. The same pattern should support coaching agreements,
episode decisions, course-review decisions, publishing approvals, and other
cross-surface workflows without creating separate phone and web truths.
