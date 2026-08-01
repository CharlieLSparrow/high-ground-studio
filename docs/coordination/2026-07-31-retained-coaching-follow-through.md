# Retained coaching follow-through operation

Date: 2026-07-31

This checkpoint turns a released client follow-up into useful preparation for
the next coaching Session without copying Tasks or Goals. It uses the retained
local coach, client, and unrelated-producer identities so the same longitudinal
records can keep exercising privacy, status history, search, and future UX.

## Product boundary

The projection is available only when the prior and current Sessions have the
same canonical project, purpose, client, and coach. It starts from a released
`CLIENT_FOLLOW_UP` snapshot, verifies the complete body hash and each selected
Task and Goal hash, then resolves those exact client-owned IDs in their original
project.

- The client gets direct same-ID Work links.
- The coach gets read-only current status.
- A producer or unrelated project collaborator gets no projection or title.
- Work moved to another project becomes an unavailable release tombstone.
- Missing, duplicated, reassigned, tampered, or unverified records fail closed.
- The next Session receives no copied work, completion, message, Calendar, or
  delivery side effect.

The immutable release remains provenance. The current Task, Goal, and progress
receipts remain canonical state.

## UX

Nest Prepare and Quipsly Capture show the same compact follow-through card:

- released title, recipient, revision, timestamp, and exact source Session;
- current commitment and Goal status;
- explicit change-since-release and unavailable states;
- latest Goal progress evidence;
- the prior coach's deliberate next-Session focus; and
- a visible same-ID/no-copy/no-side-effect boundary.

Capture keeps consent and recording controls first. Episode Sessions now show
their read-only manuscript before shared Watch controls. A Session picker that
is still verifying Nest shows a truthful loading state instead of falsely
claiming there are no Sessions.

## Real retained operation

The client opened Session 2, followed the exact Task link into Work, deliberately
reopened and completed the canonical Task, then returned to Session 2 and saw
`DONE` plus `Updated since release · was Open`. The coach independently saw
that same status without a mutation link. The producer saw neither the card nor
the Task or Goal titles.

Independent PostgreSQL readback proved:

- canonical Task `retained-follow-up-client-task-20260731` is `DONE`;
- canonical Goal `retained-follow-up-client-goal-20260731` remains `ACTIVE`;
- released output
  `client-follow-up-7d7754a9f7e6201dfa577b6de08f1afeaf2fd22c` retains SHA-256
  `af31f60567488d5ada4a34abf6e2cc688c7b5e54254cde41c1526ff233bfa6cb`;
- Session 2 contains zero copied Tasks and zero copied Goals; and
- output, delivery, Calendar, and current-Session counts did not change.

The latest browser receipt and four screenshots are retained under
`/Volumes/My Passport/Quipsly QA Artifacts/Coaching Follow Through/20260801T014325285Z`.
The final compiled iPhone 17 Pro simulator result is retained at
`/private/tmp/quipsly-retained-native-coaching-continuity-1785548417124-30271.xcresult`.

## Repeatable lanes

Seed or reconcile the durable local corpus:

```bash
QUIPSLY_RETAINED_COACHING_CREDENTIAL_STORE=keychain \
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
node scripts/quipsly-retained-coaching-follow-up-seed.mjs
```

Operate the rendered client/coach/producer boundary:

```bash
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
pnpm quipsly:retained:coaching-follow-through
```

Operate the compiled Capture projection:

```bash
QUIPSLY_RETAINED_COACHING_BASE_URL=http://127.0.0.1:3012 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
pnpm quipsly:retained:native-coaching-continuity
```

All three lanes refuse non-loopback product/auth/database targets, keep
passwords in the dedicated macOS Keychain service, print no credentials, and
preserve product artifacts.

## Verification

- Complete Nest Jest: 193 passed suites / 977 runnable tests.
- Focused follow-through/card/mobile mapping: 27/27 passed.
- Cross-surface contracts: 180/180 passed.
- Mobile source-and-network contract: passed.
- App Store static contract: 902/902 passed.
- TypeScript 7: all 27 tracked projects passed on 7.0.2.
- Compiled retained iPhone operation: 1 passed, 0 failed, 0 skipped.
- Isolated Nest and HGO production builds plus local release gate: passed and
  reported `LOCAL SOURCE READY`.

This is production-quality local implementation and retained real-product
operation. It is not yet deployed production parity, a new TestFlight build,
physical-iPhone proof, or a completed real coaching engagement.
