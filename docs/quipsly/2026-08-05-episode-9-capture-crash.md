# Episode 9 Capture crash — Build 28 hotfix boundary

## User-visible failure

Opening the Episode 9 recording workspace terminated Quipsly Capture on a
physical iPhone before the consent controls became usable. The tester observed
the same symptom on Builds 26 and 27, both during and outside an active phone
call. The phone call is therefore not a supported explanation for the crash.

## App Store Connect evidence

Apple received a beta crash submission for Build 27 on August 5, 2026. The
crashing main-thread frame was the root of `CaptureRecorderView.body` in
`CapturePhoneShell.swift`; the remaining frames repeatedly traversed
SwiftUI/SwiftUICore and AttributeGraph layout updates. The exception was
`EXC_BAD_ACCESS (SIGSEGV)` with `KERN_PROTECTION_FAILURE` near the stack.

This evidence locates the failure in eager construction of the full Episode
workspace. It does not implicate recording consent, microphone permission,
camera permission, LiveKit, or an active phone call.

## Correction

`CaptureRecorderView` now uses a lazy vertical workspace so transcript,
follow-through, manuscript, chat, Watch, notes, and other large Episode
projections are constructed as they become visible. Consent, capture mode,
readiness, primary recording controls, and rehearsal readiness remain grouped
in a bounded eager unit at the top of the recorder. The repair therefore
changes the layout boundary without weakening consent or hiding recording
truth.

The deterministic preview fixture can now make a consent-needed podcast the
exact Up Next target. Its regression test taps the same entry point, verifies
that the recorder remains foregrounded, and requires the in-recorder consent
action to be reachable.

## Verified before packaging

- Exact consent-needed Up Next regression: passed.
- Explicit consent still gates recording: passed.
- Deep coaching follow-up preserves its exact source and does not release a
  preview: passed.
- App Store/static Capture contract: 1,046 of 1,046 checks passed.
- Coordinated podcast capture contract: 24 of 24 checks passed.
- Rehearsal readiness contract: 12 of 12 checks passed.
- Shared iOS/API/web consent-v2 contract: passed.

## Remaining physical-device gate

Simulator and static evidence cannot prove the physical-device boundary.
After Build 28 is processed and installed through TestFlight, acceptance
requires all of the following on the tester's iPhone:

1. Open Quipsly Capture from a clean foreground state.
2. Tap Episode 9 from Up Next.
3. Confirm the recorder remains open and **Review choices** is reachable.
4. Review capture and transcription choices, attest that everyone has agreed,
   and save them.
5. Confirm the consent-needed state clears without starting a recording.
6. Start and stop a short audio-plus-video take, then verify its local
   preservation and upload receipt.

Build 28 must not be described as physically proven until this readback is
recorded.

## Episode 9 identity and access preflight

The crash and session-visibility checks are separate boundaries. A read-only
production preflight now signs in through each real Firebase identity and asks
the same `/api/mobile/capture/sessions` endpoint used by Quipsly Capture for
the expected Session. On August 5, 2026, all of these paths returned HTTP 200
and included **Episode 9: The Swear Jar**:

- `charlie@highgroundodyssey.com` -> canonical Charlie user;
- `charlielsparrow@gmail.com` -> the same canonical Charlie user; and
- `shomers@gmail.com` -> canonical Scott user.

Run that proof without printing or persisting its short-lived credentials:

```bash
pnpm quipsly:capture:access-preflight -- \
  --email charlie@highgroundodyssey.com \
  --email charlielsparrow@gmail.com \
  --email shomers@gmail.com
```

Local Nest data had drifted independently: the Episode 9 room contained only
a retained test operator. The local-only collaboration converger now resolves
canonical users through primary or alias email, refuses non-loopback database
targets, checks Firebase-subject collisions, preserves test participants,
upserts project grants and room roles, and creates only `REQUESTED` consent
rows with every permission false. It is dry-run by default and records an
audit event when applied. A second dry run after the repair reported Charlie
OWNER/HOST and Scott EDITOR/GUEST as already active, with no missing identity
bindings and both consent requests preserved.
