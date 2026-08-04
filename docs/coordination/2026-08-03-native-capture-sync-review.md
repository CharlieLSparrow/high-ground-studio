# Native Capture Source Sync Review

Date: 2026-08-03

Initial feature commit: `8ed2643a`

The authority/rollback v2 work described below is the current checkpoint that
supersedes the original person-only policy.

## Product outcome

Quipsly Studio can now review two immutable sources from one Capture group on
the shared episode clock. The review surface is available from each
eligible Source Grove card and keeps the baseline source, target source,
opening cue, later drift check, assembled playback, reviewer, and resulting
offset together.

This closes the gap between Capture's clock-based placement proposal and an
editor placement that a person has reviewed or an authorized software agent
has qualified from disclosed evidence. It does not turn a clock proposal into
a sample-accurate claim.

## Truth contract

A reviewed placement can be saved only when all of the following are true:

- both lanes have stable source, asset, receipt, and file identities;
- both lanes belong to the same exact Capture group and Episode Space;
- the target still has the offset that was present when review began;
- a person reviewer has a verified native Quipsly identity, or a software
  agent records its identity, tool version, delegation scope, and evidence;
- a real opening waveform, word, clap, or visible cue was compared;
- a later point was compared for drift;
- the assembled sources were played together; and
- the reviewer explicitly accepts the placement under its disclosed authority.

Approval changes only reversible editor metadata. It appends an immutable
review receipt, updates the target source offset and alignment status, rebuilds
assembled playback, and autosaves the working session. Original source bytes
are never changed.

Undo is also append-only. It restores the prior offset and alignment status
while retaining both the approval and undo receipts. An active review can be
superseded only by naming its exact receipt. The prior receipt remains in
history and becomes active again if the superseding review is undone.

Operation identities are idempotent. Replaying the exact same operation is a
no-op; reusing its identity with changed evidence fails closed.

## Shared-clock corrections

The review work exposed and corrected two program-clock defects:

1. Sequence duration now includes each source's timeline offset. A camera that
   begins late can no longer extend beyond an incorrectly short program clock.
   A source that begins before episode zero contributes only its actual
   post-zero extent.
2. Source monitor players pause outside their own timeline availability
   window and resume when the shared playhead enters that window. Late sources
   no longer run early, and a previously paused source cannot remain silently
   paused after it becomes available.

These rules apply to the existing assembled program and source monitors, not a
separate sync-only player.

## Platform-boundary corrections

The full iOS companion build uncovered stale Mac-only assumptions in shared
code. The slice now keeps those responsibilities at their real boundaries:

- native sign-in device labels and browser handoff are platform-aware instead
  of leaking macOS-only host-name behavior into shared account code;
- direct Python export subprocesses fail explicitly outside macOS; and
- unsupported mobile export paths now report the real platform boundary.

These corrections do not broaden iOS permissions or make desktop subprocess
features available on mobile.

The authority audit also found that the macOS agent server's documented
loopback interface was actually listening on every network interface. The
listener now requires the IPv4 loopback endpoint and Network framework
local-only acceptance. It also rejects cross-site browser fetch, Origin, and
Referer evidence; the canonical CLI identifies itself with a custom
local-control header while older local CLI tools stay compatible. Local
processes remain inside the logged-in Mac user's trust boundary.

## Operated real-work proof

The current local Mac build loaded the retained capture-backed session:

`capture-hgo-macbook-av-durable-20260730-43c53e60-8d6f-466f-aed7-62ced70b110c-working`

The session contains the real local camera reference and MV7i microphone
master from capture group:

`43c53e60-8d6f-466f-aed7-62ced70b110c`

The new sheet selected the microphone master as the baseline. The assembled
opening and the later `9.168s` checkpoint were played through the native
shared transport and then paused. Native state reported both audition actions
and explicitly stated that no alignment receipt was created.

The reviewer account was not verified in this operated lane, so the person
review action remained disabled. The durable session was read back after
audition and still contained zero sync-review receipts. The retained camera
reference is video-only, so this pair does not support honest waveform
correlation. It remains proposal-only until visual/audio evidence is sufficient;
the agent path does not fabricate evidence or a person sign-off.

## Automated evidence

- QuipslyVideoCore: 120 tests passed, including version-one receipt decoding.
- Mac agent authority/static responsiveness: 3 tests passed, covering loopback,
  browser-request rejection, canonical CLI identity, cached state response, and
  off-request reconciliation.
- The exact current QuipslyMac Debug build launched. `lsof` read back only
  `127.0.0.1:8080` (not `*:8080`); a request carrying cross-site browser
  evidence received HTTP 401; the canonical header-bearing CLI and a legacy
  local CLI request both read `New Project`; and qualify/undo without their
  exact confirmations each received HTTP 400 with the required confirmation.
- New sync-review tests cover duration offsets, approval, exact replay,
  rejection of changed replay intent, stale offsets, incomplete checks,
  incomplete source evidence, cross-group evidence, append-only undo, and
  preservation of original source truth.
- QuipslyMac Debug build: passed with code signing disabled for local
  compilation proof.
- The complete Quipsly Capture mobile preflight passed, including privacy,
  TypeScript, capture/auth/durability/evidence contracts, and the universal
  HighGroundCapture simulator build with LiveKit linked.
- The separate legacy Quipsly Studio iOS companion target compiled the new
  review sheet but still fails in the much larger shared Workspace because
  desktop subprocess and pointer-window code is not fully separated from its
  iOS target. That pre-existing architecture debt is not the Quipsly Capture
  App Store target and is not represented as fixed here.
- `git diff --check`: passed before commit.

## Remaining gates

- The real retained source pair still needs sufficient audiovisual evidence.
  Either a verified person may review it or an authorized software agent may
  qualify it when that evidence can be inspected and preserved. Operated
  audition alone is deliberately insufficient.
- The approved session must be saved, the app relaunched, the exact session
  reloaded, and the receipt plus offset read back before calling persistence
  qualified.
- A physical iPhone Capture run must still prove real camera, microphone,
  thermal, storage, interruption, camera-flip, and upload behavior. Simulator
  and Mac evidence cannot replace that gate.
- The legacy Quipsly Studio iOS companion target needs a deliberate platform
  split of desktop automation/export services before it can become a supported
  mobile editor surface. Do not hide that work behind no-op mobile shims.
- Cloud preview and production promotion remain release-cadence decisions and
  are not implied by this local native checkpoint.
