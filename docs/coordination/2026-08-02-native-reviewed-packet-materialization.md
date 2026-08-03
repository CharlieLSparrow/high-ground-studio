# Native reviewed transcript packet materialization — 2026-08-02

Status: implemented and operated locally; intentionally not deployed

## Outcome

Quipsly Capture now enforces the source-truth boundary that its review language
already promised: a packet note, task, or goal cannot become canonical work
until every immutable transcript segment in that candidate's complete evidence
span has a current human playback-review receipt.

The compiled iPhone app was operated against a fresh retained coaching Session.
It played and confirmed each of the three source segments in one complete goal
thought, rebuilt an append-only packet from the reviewed transcript, explicitly
created the goal, returned to Today, and displayed the same canonical goal
there. Database readback proved one goal and no incidental work or external
effect.

## Production boundary

- Packet note, task, and goal acceptance re-resolve the complete ordered source
  span under the existing transcript-job lock.
- `ACCEPT` fails closed while any constituent segment is provider-only. Editing,
  deferring, or rejecting a proposal remains available because those decisions
  do not create canonical work.
- Packet projections report review state for the complete span, not only its
  primary playback anchor.
- Nest and Capture disable materialization controls until source review is
  complete and explain the missing step in plain language.
- If transcript review changes after a packet build, Capture keeps the old
  packet inspectable, locks decisions, and offers an explicit append-only
  **Build current packet** action.
- Goal creation remains narrowly scoped. It does not create a task, due or
  target date, reminder, tag, calendar event, message, delivery, publication,
  or recording mutation.

## Operated native acceptance

The local-only operator is
`scripts/quipsly-retained-native-reviewed-packet-materialization-operation.mjs`.
It refuses non-loopback Nest, Firebase Auth, or PostgreSQL targets and reads the
retained coach password from macOS Keychain without printing it. Every run:

1. clones the immutable retained source, current consent, transcript, and
   release evidence into a newly named retained test Session;
2. verifies the source bytes against their canonical SHA-256;
3. builds the current packet and proves the complete goal begins provider-only;
4. compiles and runs the real Capture UI on an iPhone simulator;
5. installs the exact audio through a DEBUG-only, explicit, checksum-verified
   XCTest bridge scoped to the authenticated account partition;
6. plays each segment through its end and appends three review receipts;
7. rebuilds the packet, explicitly creates one goal, and reads it from Today;
8. re-reads PostgreSQL and refuses success unless exactly the intended records
   exist.

The operated artifact is
`/private/tmp/quipsly-reviewed-packet-materialization-1785722587102-19023.xcresult`.
XCTest reports one passed test on iPhone 17 Pro / iOS 26.3.1. The retained
Session is `qa-reviewed-packet-1785722586756-38e3b547`; its canonical goal is
`transcript-goal-1c5031a57b48d11d34309c4d`.

Independent database acceptance returned:

- 3 exact playback receipts bound to the immutable recording asset;
- 3 human-reviewed source-span segments;
- 1 canonical goal;
- 0 tasks;
- 0 canonical transcript-derived notes;
- 0 calendar links; and
- explicit-human-action and no-incidental-write receipts.

The retained QA artifacts are intentional longitudinal regression evidence.

## Defects found by operating the product

- The Session picker capped an oldest-first archive query at 30, so a newly
  recorded or recently reviewed Session could disappear for an established
  account. The API now combines accessible active Sessions with the 30 most
  recently changed Sessions. The phone independently chooses the earliest
  active scheduled Session for its next-session card.
- `AVAudioPlayer` can reset `currentTime` to zero at normal end-of-file. Capture
  now latches the exact segment end before pausing so a tail segment remains
  confirmable instead of flashing enabled for one timer tick.
- Today held its app-launch projection after a goal was created from Record.
  Entering Today now refreshes canonical work so the successful cross-surface
  mutation is visible without a manual pull-to-refresh.

## Verification

- Operated compiled iPhone journey: 1/1 passed.
- Independent retained database postcondition: passed.
- Session-window PostgreSQL integration: 5/5 passed.
- Focused packet, source-span, materialization, and Session Review coverage:
  7 suites / 89 tests passed.
- Full enabled Nest Jest run: 240 suites / 1,267 tests passed; 37 suites / 108
  tests remained intentionally skipped by existing environment gates.
- Quipsly and shared-domain strict TypeScript: passed.
- Optimized Nest production build: passed with the release pipeline's 8 GB Node
  heap and generated all 160 static pages. A direct default-heap run compiled
  successfully, then exhausted Node's 4 GB heap during the post-compile worker;
  the committed release verifier already supplies the required 8 GB ceiling.
- Native operator contract, shell syntax, and `git diff --check`: passed.

No Cloud Build, Cloud Run deployment, production write, provider-calendar
mutation, TestFlight upload, App Store mutation, invitation, message, delivery,
or publication occurred. Simulator evidence does not replace the still-required
physical-iPhone capture, interruption/relaunch, upload, playback, and transcript
review acceptance.
