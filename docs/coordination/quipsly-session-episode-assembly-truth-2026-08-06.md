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

## Exact bytes are not playable-media proof

The retained operation also exposed a second boundary defect. A
`RecordingAsset.status = VERIFIED` proves that the protected bytes reached the
server and matched their upload checksum. It does not prove that a decoder can
read those bytes. The two test WebMs had exact checksums and promoted Studio
attachments, but their complete signal-profile jobs failed with invalid stream
metadata.

Capture-take materialization now requires every audio master to have a
completed, complete-decode signal receipt bound to the same source SHA-256.
Queued or missing decode work blocks materialization without calling the source
broken. A failed or source-mismatched decode receipt blocks materialization as
unplayable. Successful materialization carries the decode job, source hash,
completion time, and `completeDecode: true` into the source binding so the
canonical timeline records why that lane was admitted.

After this repair, the retained cockpit changed from the misleading “choose a
spine” instruction to two explicit decode blockers and the action “Replace or
recover every source that failed complete decoding.” Upload verification,
decode verification, editorial spine choice, and timeline materialization now
remain four distinct facts.

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
- the focused Capture take held on two explicit complete-decode failures;
- zero Session timeline clips and zero materialized takes for this capture
  group;
- zero current proposal sets and zero unsaved local-draft actions;
- five historical canonical timeline-save receipts; and
- direct navigation from the cockpit into the exact Episode, capture group,
  and Guided Sync section.

The source set contains two tiny test WebM audio files whose stream metadata
cannot support a trustworthy sync/materialization decision. Quipsly correctly
held them. Existing protected microphone and iPhone camera media in the Episode
were not silently reassigned to this take.

The running editor showed `Complete decode failed` on both exact source cards,
disabled spine selection for the failed sources, exposed `Retry complete
decode`, and reported the decoder's `audio-signal-probe-invalid` evidence. The
later QA producer no longer produced a false consent blocker.

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
Quipsly Next.js route generation passed
Quipsly TypeScript typecheck passed
Running-app reload did not append a receipt
Running-app unchanged manual Save did not append a receipt
Session cockpit readback showed the exact five-save ledger and held take
Running editor readback showed both invalid-source decode failures, not a
post-capture collaborator consent failure
```

## Next production slice

Do not manufacture a green fixture by selecting either tiny test WebM as the
production spine. The next serious acceptance run should retain a substantial
browser or iPhone local master, complete source-bound transcription and audio
analysis, explicitly choose the clean high-quality spine, materialize the take,
generate proposals bound to the resulting timeline fingerprint, proof-listen
or proof-watch them, apply accepted operations to a reversible draft, and save
those reviewed draft receipts into the canonical Episode timeline.
