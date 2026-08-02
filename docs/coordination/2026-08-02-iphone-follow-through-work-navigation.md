# iPhone coaching follow-through to canonical Work

Checkpoint: 2026-08-02 MDT

## Outcome

Quipsly Capture now lets the assigned client move directly from next-Session
preparation to the exact canonical Task or Goal in Work. The handoff switches
the real root tab, selects the source project, narrows search to the exact
title, loads the authoritative Work projection, scrolls to the same stable ID,
and visibly focuses it. It does not create a phone copy or a Session 2 copy.

The assigned coach keeps read-only next-Session preparation. Work-opening
controls are returned and rendered only when `canOpenWork` is true for the
current actor. The coach can still deliberately review the actor-private
continuity brief and return to the exact source Session.

## UX and accessibility contract

- The client sees **Open commitment in Work** and **Open goal in Work** beside
  the released follow-through item rather than having to reconstruct a search.
- A completed Task remains reachable because the handoff enables completed
  Work before loading it.
- Task and Goal rows keep descendant edit, tag, reminder, completion, and
  check-in controls reachable. Stable automation IDs live on their title text
  instead of replacing child accessibility identities on the entire card.
- The selected row receives a visible accent outline after the exact-ID
  scroll. Search contains the exact title so unrelated work is not left in the
  focused result.
- The signed-in shell exposes a noninteractive exact-email accessibility
  receipt. Operated tests fail closed on the wrong restored account and use the
  normal Account sign-out flow before continuing as another actor.

## Runtime architecture repair

The operated account proof exposed three SwiftUI runtime warnings. The cause
was synchronous rebroadcast of child `objectWillChange` publishers through
`CaptureExperienceModel` while SwiftUI could already be rendering. Every child
forward now delivers on the main queue before the parent sends its change,
preventing re-entrant view updates without suppressing or whitelisting the
warning.

The focused client-follow-up refresh also re-resolves the Session array index
by stable ID after its network suspension. A list load or reorder can no longer
let an older cached index overwrite newer continuity fields or a different
Session. The refreshed protected snapshot is persisted after the exact row is
updated.

## Operated acceptance

The retained local operator now runs two compiled iPhone journeys in sequence:

1. Coach: prove the exact coach email, select Session 2, read the current Task
   and 75% Goal evidence, deliberately reveal the private continuity brief,
   and return to Session 1.
2. Client: prove the exact client email, select Session 2, verify both Work
   actions, open the canonical Goal, read the exact search/title/75% evidence,
   and retain the normal enabled **Check in** action.

Both selected tests passed 1/1 with zero unexpected runtime warnings:

- `/private/tmp/quipsly-retained-native-coaching-continuity-1785657441274-25637.xcresult`
- `/private/tmp/quipsly-retained-native-coaching-continuity-1785657441274-25637-client-work.xcresult`

The operator reported `passedOperations: 2`, two exact retained actors, two
authoritative Sessions, credential-safe output, retained result bundles, and
`externalSideEffects: false`.

## Verification

- paired retained compiled iPhone operation: 2/2;
- dedicated native operator contract: 1/1;
- mobile source-only contracts: 86/86;
- Capture/App Store static contracts: 1007/1007;
- shell syntax, Node syntax, and diff whitespace checks: pass;
- unexpected runtime warnings: zero.

## Truth boundary

This is durable local PostgreSQL, Firebase Auth Emulator, local Nest, and
compiled iPhone 17 Pro simulator proof. It did not start a recording, mutate a
provider calendar, send a message or invitation, deploy Cloud Run, upload a
TestFlight build, write production data, publish an episode, or operate a
physical iPhone. Physical two-account coaching use, real recorded coaching,
deployed parity, and the wider active product goal remain open.
