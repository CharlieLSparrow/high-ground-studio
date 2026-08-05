# Browser and iPhone take rendezvous

Date: 2026-08-05

Status: implemented and operated locally; physical iPhone acceptance and release remain pending

## Production decision

Quipsly treats independently captured participant media as the masters. A
provider room recording is an optional sync and recovery witness: it can show
what the room heard, supply another waveform, and help recover from a missing
participant source. It is not required to identify a take, upload a master, or
move verified masters into Studio.

The invariant is enforced at every handoff surface:

- every non-`SERVER_MIX` protected master in the reviewed capture group is
  required;
- a provider receipt placeholder is never treated as media;
- a provider file that is still held, uploading, or unreconciled never blocks
  protected masters;
- a verified provider file is included as an optional witness;
- explicitly selected provider media must pass the same verification gate;
- provider-only handoff cannot substitute for required protected masters; and
- new required media arriving after review invalidates the snapshot and
  requires refresh before any attachment.

This preserves sync when provider recording is disabled. Take identity comes
from the canonical Session `captureGroupId`; first placement comes from each
source clock evidence; waveform/opening-cue correlation and late-drift review
remain the human-controlled path to final placement.

## Implemented experience

The browser recorder now projects the canonical source roster for its exact
Session take, distinguishes required masters from optional provider witnesses,
and refreshes the source set before handoff. It promotes an exact reviewed
snapshot and routes podcast work to the matching editor focus while routing
coaching work back to Session recordings.

Quipsly Capture uses the same rule and language. Its Studio action submits all
required masters plus only provider witnesses that are actually verified. Its
status counts describe masters, while any provider source is labeled as an
optional witness that cannot block them.

The optional LiveKit witness now has its own durable START/STOP command ledger
and authenticated webhook receipt ledger. Ambiguous START never triggers a
blind second START; it reconciles by exact egress ID or deterministic object
path and otherwise remains visibly held for review. The Live Session UI states
that provider-off does not change capture-group synchronization and retains the
same request UUID across an ambiguous browser retry.

The editor continues to open one exact capture group, preserve each original,
show clock uncertainty and placement offsets, and keep final approval disabled
until the sync review is complete.

## Operated local evidence

The retained media operator also created
`QA Provider-Off Sync Boundary 2026-08-05` through the rendered coaching
appointment workflow and opened its canonical Live Session. Room
`cmsftwst3000p1yxlg2a50m50` retained capture group
`b3197bc0-01d7-44f4-b13a-96fc3e895234` while provider recording remained off.
The rendered room showed the optional-witness label and the full capture-group,
clock-receipt, local-master, and waveform/drift explanation. Opening the room
created zero provider commands and zero provider assets, and the browser raised
no client exception.

The signed-in retained test user created and consented to the planned podcast
Session `cmsfpfwrt000db9xld8ppuon4` through the rendered product UI. Two fresh
browser audio sources were recorded at different times into capture group
`967f72b2-f762-4535-a337-e69b5676cad1`:

- `cmsfphljt000lb9xltoz7eob8`
- `cmsfpifiw000tb9xlqdwtpopa`

Both sources retained local originals, collected three of three bounded clock
samples, passed exact-byte verification, reached Studio, and appeared together
when the exact take was reopened. The second source joined the already-created
take rather than creating a disconnected timeline. Studio displayed the first
source as the baseline and the second as a proposed later placement with its
own uncertainty; final approval remained disabled.

A separate retained coaching Session capture also completed local recording,
clock evidence, exact-byte verification, canonical roster readback, and the
purpose-correct Session-recordings route.

## Verification

- Four focused Jest suites: 44 tests passed.
- Quipsly TypeScript 7 typecheck passed.
- Capture Swift parse passed.
- Full iOS simulator build passed.
- Quipsly optimized build passed all 172 routes.
- Mobile Capture source contract smoke passed 101 of 101 checks, including the
  optional-provider witness invariant.

## Remaining release gate

This proves the product and data path with real local work, but not physical
cross-device timing. Before calling the release qualified, operate one retained
Session with browser audio and physical iPhone video, verify distinct capture
and upload identities under the same group, exercise interruption/reconnect,
confirm exact bytes and editor playback, review opening-cue placement and a
late-take drift point, then read back the promoted build and immutable release
context. Provider recording may remain disabled throughout that acceptance.
