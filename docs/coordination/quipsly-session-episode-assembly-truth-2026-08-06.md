# Quipsly Session-to-Episode assembly truth checkpoint

Date: 2026-08-06
Branch: `codex/quipsly-product-20260724`

## Outcome

The Session finishing cockpit now projects the real state of a bound Capture
take, Episode timeline, edit proposals, review actions, and canonical saves. A
Studio attachment no longer makes the Assemble stage look complete.

This is a projection over canonical records. It introduces no parallel
workflow table, mutable super-record, or migration:

- `CallRoom.captureGroupId` identifies the exact Session take;
- capture materialization receipts in `StudioEpisodeProduction.timelineJson`
  identify source lanes and transcript blocks written into the Episode;
- `StudioEpisodeEditProposalSet` binds generated proposals to exact timeline
  bytes;
- `StudioEpisodeEditReviewReceipt` separates review-only actions, reversible
  local-draft actions, and canonical timeline saves; and
- the Session cockpit derives ranked attention and direct editor links from
  those records without claiming new facts.

## Assembly states

| State | Meaning | Calm default action |
| --- | --- | --- |
| `NO_CAPTURE_TAKE` | The bound Episode has no take from this Session capture group. | Open the exact Episode and inspect the Session boundary. |
| `BLOCKED` | Materialization evidence has at least one blocker. | Resolve the named blocker in Guided Sync. |
| `READY_TO_MATERIALIZE` | Exact sources are verified and a guarded materialization plan exists. | Explicitly write the take into the canonical timeline. |
| `MATERIALIZED_MEDIA` | Session media exists in the timeline, but transcript, speaker, camera, or assembly evidence is incomplete. | Continue evidence review without guessing identity or placement. |
| `MATERIALIZED_ASSEMBLY` | The materialized take has enough evidence for assembly review. | Review current proposals and link accepted draft actions to a canonical save. |

The cockpit separately reports stale proposal sets, current proposal sets,
proof-review actions, reversible local-draft actions, draft actions linked to a
canonical save, and unlinked draft actions. Missing ledger access is reported
as unknown, never flattened into zero.

## Canonical timeline receipt rule

A `TIMELINE_SAVED` receipt is editorial history. It may be appended only when:

1. incoming canonical timeline bytes differ from the current canonical bytes;
   or
2. an explicit save links already-reviewed local-draft receipt IDs to otherwise
   identical canonical bytes.

Opening a route, normalizing an older payload shape, hydration, polling, or
clicking Save on an unchanged timeline is a no-op. Deterministic receipt-backed
Shared Watch spans remain saveable because they are new canonical content, not
display-only normalization.

The client maintains two fingerprints for this reason:

- the exact server fingerprint used for conflict-safe writes; and
- the normalized local save baseline used to distinguish harmless hydration
  from actual projected or editorial changes.

The API independently enforces the receipt rule. Client behavior alone is not
trusted as the history boundary.

## Exact bytes, complete decode, and useful signal are separate proof

The retained operation also exposed a second boundary defect. A
`RecordingAsset.status = VERIFIED` proves that the protected bytes reached the
server and matched their upload checksum. It does not prove that a decoder can
read those bytes or that the decoded source contains useful program audio.

Capture-take materialization now requires every audio master to have a
completed, complete-decode signal receipt bound to the same source SHA-256.
Queued or missing decode work blocks materialization without calling the source
broken. A failed or source-mismatched decode receipt blocks materialization as
unplayable. Successful materialization carries the decode job, source hash,
completion time, and `completeDecode: true` into the source binding so the
canonical timeline records why that lane was admitted.

The first complete-decode run exposed an analyzer defect: Chrome's streamed
WebM is open-ended and legitimately omits container duration metadata. Both
retained files had a perfect WebM probe score, valid Opus streams, and completed
full FFmpeg decoding (42 and 107 packets). The analyzer had incorrectly treated
missing duration metadata as corrupt media.

The analyzer now derives duration and completeness from decoded PCM frames. It
dynamically coarsens evidence windows to remain bounded to 1,200 even for a
long open-ended episode source. A production fixture generates a live WebM with
no duration metadata and proves complete waveform and frequency analysis.

The repaired decode then exposed the next true fact: both retained files are
complete but contain near-digital silence at -160 dBFS. Materialization now
blocks a near-silent required master separately from a corrupt or pending
decode. The editor reports `Decoded near-silence`, displays RMS and sample peak,
and disables spine selection. Upload verification, decode verification, signal
viability, editorial spine choice, and timeline materialization now remain five
distinct facts.

The browser recorder also watches its own retained-source meter after start.
Once at least five seconds and two seconds of measured samples are available,
no useful signal raises a Session Guardian intervention even while durable
chunks continue advancing. This does not infer from the call meter, discard the
diagnostic file, or auto-stop an intentional room-tone capture. It prevents the
more dangerous false green: “bytes are advancing, therefore the master is
usable.” Signal recovery clears only that signal warning; higher-priority
storage, track, or encoder interventions remain intact.

## Capture-time consent scope survives later collaboration

Operating the decode recovery control exposed a third boundary defect. The
post-capture processing gate was applying recording consent to every current
non-observer participant in the room. A producer added after the Session ended
therefore blocked complete decoding even though that producer was never in the
call and has no retained source.

Normalized finalization receipts already preserve the exact capture-time
participant IDs inside the immutable initial consent snapshot. Post-capture
media and transcript processing now read the current consent ledger only for
that captured-party set. This preserves the important current-state behavior:

- a captured participant's later decline or revocation still quarantines new
  decoding, transcription, processing, and disclosure;
- a captured participant missing from the current room ledger fails closed;
- a producer, editor, or reviewer added after capture receives access through
  the authorization ledger without needing fictional retroactive recording
  consent; and
- older receipts without a capture-time participant snapshot retain the
  broader all-current-parties compatibility check rather than guessing.

Trusted provider composites use the same rule with their immutable egress
consent binding. Live-room readiness is unchanged and still requires consent
from every intended recorded participant before recording begins.

## Retained operation

The checkpoint was operated in the running local app with the dedicated
Firebase-emulator collaborator
`quipsly-assembly-cockpit-qa-20260807@example.test`.

Retained records:

- room: `cmsfpfwrt000db9xld8ppuon4`
- capture group: `967f72b2-f762-4535-a337-e69b5676cad1`
- project: `high-ground-odyssey-manuscript`
- episode: `capture-sync-rendezvous-qa-20260805`
- Episode production: `cmsfopxjc0001hvxlf30hh0e1`

Observed UI and evidence:

- two server-safe immutable source attachments;
- no completed source-bound transcript;
- no complete audio-analysis coverage;
- the focused Capture take held on two explicit near-digital-silence blockers;
- zero Session timeline clips and zero materialized takes for this capture
  group;
- zero current proposal sets and zero unsaved local-draft actions;
- five historical canonical timeline-save receipts; and
- direct navigation from the cockpit into the exact Episode, capture group,
  and Guided Sync section.

The source set contains two tiny, silent test WebM audio files. They are valid
streamed Opus media, but neither can serve as a trustworthy episode spine.
Quipsly correctly holds them. Existing protected microphone and iPhone camera
media in the Episode were not silently reassigned to this take.

The running editor first exposed the analyzer's duration assumption, then
successfully retried both exact sources through the repaired durable worker.
It now shows `Decoded near-silence`, disables spine selection, displays -160.0
dBFS RMS and sample peak, and holds the take on source recovery. The later QA
producer no longer produces a false consent blocker.

## Local processor lifecycle reliability

Reloading the repaired media worker exposed a launchd startup race: the local
lifecycle command slept for one second and immediately declared failure even
when the worker was still starting. Worker startup now uses a bounded readiness
poll (up to ten seconds), while preserving the existing exact-source revision
check and launcher ownership boundary. The full local lane was restarted and
read back healthy after the repair.

## Auditable retained-master recovery

Near-silence is now recoverable without overwriting, relinking, or deleting the
protected original. The Episode editor imports a recorder, camera, or phone
backup as a normal immutable source first. An explicit operator then confirms
that it belongs to the same Session/source owner and is governed by the
capture-time recording and processing decision.

Adoption creates a new `RecordingAsset`, clones the immutable consent-scoped
finalization disposition, and binds the exact SHA-256 and storage generation.
The existing `CallExpectedSource` acts as the mutable slot projection while
`CallExpectedSourceRevision` preserves the append-only decision history. The
first recovery writes `CREATE -> UNBIND -> BIND`; later recoveries append new
unbind/bind decisions and remove every previous binding from the active take.
The Episode source bin retains the originals as `superseded-original` evidence
and identifies only the selected backup as `active-replacement`.

The retained operation adopted `mv7i-backup.mp3` for recording asset
`cmsfphljt000lb9xltoz7eob8`. The replacement recording asset is
`cmsi2ig7h000hlqxlwxtdmuq5`, bound to source SHA-256
`806d8555cabcca2e4ce5300fe7288cfa6ca4b9aa7b0311c75808cca4d5cd24fc`.
The durable worker completely decoded 17.145458 seconds and classified the
source as `signal-present`. The running editor then showed that source as the
healthy recovered master and held the take only on the remaining unrecovered
near-silent source.

A replay of the exact adoption request returned the same replacement and
completed signal receipt. The database remained at one replacement asset and
exactly three source-plan revisions. This proves response-loss retry does not
duplicate media identities or ledger decisions. Failed UI adoption retries also
reuse the already imported backup and original request identity instead of
uploading another copy.

## Regression discovered and repaired

Operating the real editor exposed a phantom save: hydration normalized the
timeline to its current rendered shape, compared that shape with an older
embedded fingerprint, and autosaved even though the collaborator made no edit.
That created a fifth receipt merely by opening the editor.

After the repair:

1. the editor was fully reloaded and left open beyond the autosave delay;
2. the canonical save count remained exactly five;
3. the visible unchanged `Timeline Saved` control was clicked;
4. the canonical save count still remained exactly five; and
5. Shared Watch projection coverage continued to prove that genuinely new
   receipt-backed timeline spans remain saveable.

## Verification

```text
4 focused Jest suites passed
27 finishing-cockpit and save-integrity tests passed
22 materialization, route, and cockpit decode-gate tests passed
2 processing/release policy suites passed, including capture-scoped consent
32 focused editor, cockpit, materialization, and route tests passed
23 focused recovery, source-focus, and materialization tests passed
Quipsly Next.js route generation passed
Quipsly TypeScript typecheck passed
Running-app reload did not append a receipt
Running-app unchanged manual Save did not append a receipt
Session cockpit readback showed the exact five-save ledger and held take
Open-ended streamed-WebM analyzer fixture passed with complete frequency proof
Running editor retried both real sources to complete-decode receipts
Running editor showed two near-digital-silence holds and disabled spine controls
Session Guardian regression proved advancing silent chunks remain an intervention
Local lifecycle contract passed 12/12 and the full lane read back healthy
Audible backup adoption preserved the original and wrote CREATE -> UNBIND -> BIND
Exact request replay retained one replacement asset and three source revisions
Running editor showed the active recovered master and only the remaining true hold
```

## Next production slice

Do not manufacture a green fixture by selecting the remaining tiny test WebM as
the production spine. Recover its slot with a distinct audible retained source,
then complete source-bound transcription and alignment review. The next serious
acceptance run should retain a substantial browser or iPhone local master,
explicitly choose the clean high-quality spine, materialize the take, generate
proposals bound to the resulting timeline fingerprint, proof-listen or
proof-watch them, apply accepted operations to a reversible draft, and save
those reviewed draft receipts into the canonical Episode timeline.
