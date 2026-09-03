# Session entry device choice

Date: 2026-08-20

## Product decision

Quipsly Session invitations use device-neutral language: a participant may open
the private invitation on a phone, tablet, or desktop. After the invited email
is verified and the invitation is accepted, the participant explicitly chooses
one of two paths:

- continue in the current browser with that device's microphone, camera, and
  headphones; or
- use Quipsly Capture on iPhone or iPad, installing the public TestFlight beta first if
  necessary.

The browser call no longer opens automatically for a newly accepted invitee.
The choice is made before device setup, consent, joining, or recording.

## Security and identity boundary

Both paths address the same canonical `CallRoom`. The `quipsly://session/...`
handoff carries only the Session identity and requested workspace mode. Capture
must authenticate the user and re-authorize that exact Session before it shows
private context. Neither the invitation link nor the native handoff grants Nest
access, joins the call, grants consent, or starts a recording.

## Measurement boundary

The existing `UserEvent` ledger stores a versioned, idempotent Session-entry
choice per person, room, and path. Hosts and invitation managers may read the
aggregate browser, Capture-open, and TestFlight-visit counts. Repeated taps by
the same person on the same path are deduplicated; one person may legitimately
try more than one path.

These signals are preference and troubleshooting evidence, not installation or
successful-native-open proof. App Store Connect remains authoritative for
TestFlight installation and beta usage metrics.

## Verification

- focused web suites: 4 passed, 12 tests
- Quipsly TypeScript: passed
- Quipsly production build: passed, 194 routes
- unsigned iPhone Simulator build: passed
- fresh coach/client phone-width operation: passed through public account
  creation, one-time invitation acceptance, exact-Session Capture handoff,
  browser-choice ledger write, and browser device-setup opening
- the operated phone-width run exposed and removed a shell stacking context
  that let the global header intercept the live dock's close control
- retained coaching operations were updated to expect the choice-first copy and
  to deliberately continue in the browser before call setup

## Release boundary

The web choice surface and measurement endpoint require a Nest deployment. The
native application already supports the authenticated exact-Session deep link;
the revised native share wording should be batched into the next TestFlight
candidate instead of creating a release solely for copy.
