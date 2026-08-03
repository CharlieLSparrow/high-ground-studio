# Operated offline transcript review — 2026-08-03

## Outcome

Quipsly Capture now makes protected offline transcript review reachable from the
top of the offline Library and keeps its waiting/held state visible while a
person moves through a long transcript. A retained local operation then proved
the complete phone-to-Nest reconciliation contract against current local Nest,
the Firebase Auth emulator, and PostgreSQL.

Implementation commit:
`d5464c3576c5ce33b4d3615a8bf60826e291c4e0`.

This extends the original offline outbox implementation. It does not replace or
weaken its account partition, immutable provider evidence, exact-source
playback, stable idempotency, or fail-closed conflict rules.

## Product and UX changes

- The protected offline Library now places **Continue transcript review**
  directly after the offline-authority explanation, ahead of capture and
  follow-through feeds. Only a playback-eligible local recording with an exact
  room identity and a valid owner-bound protected transcript snapshot appears.
- The empty state tells a person how to prepare offline review: open the
  transcript once while online so the iPhone can protect a 30-day snapshot.
- Cache discovery and cache restoration enforce the same schema, owner, room,
  and 30-day-age contract. Timestamps more than five minutes in the future fail
  closed instead of becoming indefinitely valid after clock drift or malformed
  data.
- Each queued correction has an exact accessibility identity, so the operated
  path can verify the same segment decision a person sees.
- The aggregate outbox state is now a persistent transcript-toolbar badge. It
  shows the total at every scroll position, exposes waiting/held counts to
  VoiceOver, and returns to the full safety explanation when tapped. The prior
  aggregate card remains in the transcript as detailed context.

## Operated journey

The retained operation cloned a fresh consented Session and its exact local
recording, then drove the compiled iPhone app through this sequence:

1. Sign in as the retained coach through the Firebase Auth emulator and select
   the fresh canonical Session in the real Record shell.
2. Open canonical transcript review online and materialize the protected
   snapshot against the exact retained source.
3. Terminate the app and relaunch it with Nest pointed to unreachable loopback
   port 9. The account-bound protected offline Library appears.
4. Open **Continue transcript review**, play two exact source spans, queue one
   explicit as-heard confirmation, and queue one corrected wording decision.
5. Verify the persistent toolbar reports `2 waiting`, terminate the process,
   relaunch offline, and read back the same two protected decisions.
6. Use the real loopback correction API to accept a concurrent human overlay
   for the correction segment.
7. Relaunch with current local Nest authority. The unchanged decision becomes
   one canonical playback verification; the stale phone overlay is held rather
   than silently rebased or merged.
8. Read the concurrent canonical wording in the app and independently query
   PostgreSQL for provider immutability and side effects.

The compiled journey passed 1/1 in 118.325 seconds:

`/private/tmp/quipsly-offline-transcript-review-1785746434938-bd654b20-54542.xcresult`

Independent database readback proved:

- one exact as-heard verification:
  `cmsczewql00dwayxlingzqr9r`;
- one accepted concurrent human correction:
  `cmsczef0v00d9ayxlj3wqsk9y`;
- the phone wording did not overwrite the concurrent canonical overlay;
- both immutable provider segments stayed byte-for-byte unchanged;
- zero notes, tasks, goals, or calendar links were created;
- source SHA-256 remained
  `309adeddf1851bf9929718113c5bf058d4501c65f59187e14b39a8de792a90e0`;
- no credential was printed and no external side effect occurred.

## Failures retained and repaired

The operated loop deliberately retained failed evidence instead of erasing the
path that found the defects:

- The first run showed that exact transcript review was buried below a large
  offline feed and could not be reached in bounded time.
- The next run proved the new continuation UI was visible but found lower-case
  Node UUID text did not match Swift's canonical UUID accessibility identity.
- The third run queued both decisions but found the aggregate outbox summary
  disappeared when a long lazy transcript had scrolled away from its header.
- A later infrastructure attempt stopped before app launch when the system
  volume filled during Xcode/LiveKit extraction. Only disposable Xcode derived
  caches were removed. Docker Desktop's stalled local VM was restarted, and
  PostgreSQL recovered before the final fresh operation.

Those failures are evidence of the original boundaries; none is represented as
a product pass.

## Regression evidence

- Retained operation contracts: 2/2.
- Transcript correction server suite: 13/13.
- Nest strict TypeScript: pass.
- Mobile Capture/Nest contract smoke: pass, including offline continuation,
  exact concurrent conflict injection, and operated reconciliation coverage.
- Capture release-source verification: pass at version 1.0 (27).
- Swift parse and `git diff --check`: pass.

## Release and remaining proof

This is post-Build-27 source. No version change, archive, TestFlight upload,
tester mutation, App Store mutation, cloud build, deploy, production database
write, or provider write occurred.

The final operation is strong compiled-iPhone-Simulator evidence against real
local app services, but it is not physical-device or production proof. The
remaining acceptance gate is the same journey on a supported physical iPhone
using a real protected transcript and real account: deliberate connectivity
loss, exact playback, both decision types, force quit/relaunch, reconnect,
conflict review, separate-account isolation, canonical Nest/web readback, and
confirmation that unrelated work and external systems remain unchanged.
