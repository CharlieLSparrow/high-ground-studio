# Quipsly audio evidence navigator — 2026-08-04

## Outcome

The shared Nest audio evidence map now works as a source-clock review navigator,
not merely a static waveform-like picture. The same component serves the
coaching transcript correction desk and Studio transcript review.

The mastering and treatment change maps now use the same interaction pattern.
Their navigator combines deterministic source/candidate signal flags with up
to eight strongest time-separated dynamic-shape changes. Previous and Next
move the synchronized A/B playhead and open the 15-second comparison view.
These are comparison shortcuts, not new approval gates: a dynamic-shape delta
still says only how short-term loudness changed after subtracting the uniform
program-level shift.

It now:

- quantifies the duration represented by near-silent and clipping windows;
- shades the full measured span of an observation instead of reducing it to an
  easy-to-miss vertical line;
- renders dBFS reference guides without describing RMS as LUFS;
- combines measured signal observations, capture boundaries, and unchecked
  low-provider-confidence words into one chronological review queue;
- moves Previous and Next review actions on the immutable source clock and
  opens the bounded 15-second listening view;
- renders at most twelve queue chips around the playhead while Previous and
  Next still traverse the bounded complete queue, avoiding a thousands-of-DOM-
  nodes failure on long transcripts;
- preserves the rule that provider confidence is triage evidence and signal
  thresholds are listening candidates, not automatic transcript corrections or
  media edits.

## Hardware finding

MOTIV Mix 1.8.0.548 accepted `MacBook Pro Microphone` as a visible second input,
while the saved `USB Shure MV7i` strip remained disabled because that physical
device was not currently exposed to Core Audio. Shell AVFoundation captures of
both the MOTIV virtual input and built-in input decoded to exact zero. macOS
Privacy & Security showed MOTIV Mix and Google Chrome allowed, but no terminal
capture client. Therefore the shell result is retained only as a diagnostic;
it is not evidence that the permissioned browser or MOTIV process produced
silence.

The recorder's live decoded-sample preflight remains the authoritative product
guard. It reports `Waiting for browser` when a page has requested a stream but
has not received one, and `Digital silence` only after analyzing an actual
stream. Visible device labels and mixer strips are never accepted as proof of
recordable signal.

## Acceptance

- Focused component behavior: `AudioEvidenceMap.test.tsx`.
- Quipsly TypeScript boundary: `pnpm --filter quipsly typecheck`.
- Full Nest Jest boundary: 278 suites and 1,475 runnable tests passed; 38
  suites and 110 tests remained explicitly skipped.
- Production build boundary: Next.js 16.2.7 compiled, typechecked, and generated
  all 170 pages, including the dynamic Session route.
- Managed local Nest stack restarted from this exact worktree with current
  Prisma generation, 57 committed migrations, transcript worker, episode media
  worker, Firebase emulator, and HTTP health/login/projects checks passing.
- Durable rendered-product lane:
  `pnpm quipsly:retained:coaching-audio-evidence` verifies the exact retained
  WAV under the authorized local media root, queues the real durable complete-
  decode worker, retains its source-bound job receipt, independently re-hashes
  the unchanged original, and projects that measured profile into the exact
  retained Session recording manifest without changing transcript segments.
- Durable rendered-product lane:
  `pnpm quipsly:retained:audio-evidence-ui` signs the retained coach in through
  the visible login form, opens the genuine retained coaching Session transcript,
  verifies the navigator and decoded-signal labels, operates Next evidence,
  checks horizontal overflow and browser exceptions, then clears the session.
  It reads credentials only from the dedicated local Keychain item and captures
  no screenshots, traces, passwords, tokens, or cookies.
- Retained HGO mastering/treatment lane:
  `pnpm quipsly:retained:audio-mastery-transparency` operates the new change
  navigator in both desks, preserves synchronized A/B playback, verifies
  signed-out and outsider denial, and proves that auditioning or an incomplete
  approval does not mutate the source, processing receipt, or review ledger.

## Remaining physical gate

Reconnect or power the direct MV7i until Core Audio exposes the physical route,
then arm the local Nest recorder in a microphone-authorized browser profile.
The pass requires non-zero decoded meter movement, a retained recording,
playback, and independent media probing. The disconnected saved mixer strip is
not a substitute.
