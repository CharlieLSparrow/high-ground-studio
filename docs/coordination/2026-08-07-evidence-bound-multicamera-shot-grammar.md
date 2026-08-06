# Evidence-bound multicamera shot grammar

Date: 2026-08-07

Status: production-shaped automatic-assembly depth slice

External mutation: none; retained database operation was read-only

## Outcome

Quipsly's automatic camera draft is no longer one hardcoded active-speaker
rule. Episode artifact v5 can persist an explicit shot-grammar policy, bind it
into the timeline fingerprint, generate reversible speaker and wide-angle
decisions, disclose unavailable coverage, and show exact canonical readiness
before anyone runs assembly.

The system still does not alter a recording, infer a person's camera, approve
source synchronization, save a draft, render, promote, or publish on its own.

## Primary-source research

- Riverside distinguishes locally recorded high-quality participant tracks
  from lower-quality cloud reference tracks and offers raw aligned tracks with
  start padding. Quipsly therefore keeps high-quality local sources as the
  editing authority and treats network media as reference/recovery evidence.
  [Riverside recording formats](https://support.riverside.com/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview)
- Adobe separates synchronization from camera switching, supports timecode,
  audio, marker, and manual in/out synchronization, preserves unmatched clips,
  and lets editors choose whether audio follows video. Quipsly likewise keeps
  source alignment, program audio, and camera decisions as different records.
  [Premiere multicamera source sequences](https://helpx.adobe.com/premiere/desktop/edit-projects/set-up-multi-camera-sequences-for-editing/create-a-multi-camera-source-sequence.html)
- Premiere's text-based editing keeps transcript timecode connected to the
  timeline while retaining ordinary timeline refinement. Quipsly uses the
  canonical timed transcript as evidence for a reversible rough cut, not as a
  replacement for the timeline or proof-watch.
  [Premiere Text-Based Editing](https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html)
- Descript exposes active-speaker versus automatic styles, explicit camera
  setup, and cutaway cadence. Its documentation also names the blank-scene
  failure when selected tracks do not overlap. Quipsly adopts the useful
  controls but refuses each uncovered wide range instead of rendering a blank
  selection.
  [Descript Automatic Multicam](https://help.descript.com/hc/en-us/articles/28736507904525-Automatic-multicam)
- DaVinci Resolve 20 exposes minimum edit duration, switch delay, selected or
  detected wide angles, wide use during overlap/silence/intro/outro, and
  audio-only versus video-aware analysis. Quipsly's first policy layer adopts
  the deterministic controls while reserving lip movement, composition, and
  visual-quality scoring for separately inspectable evidence.
  [DaVinci Resolve 20 New Features Guide](https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf)

## Artifact v5 contract

`CameraAssemblyPolicy` persists:

- one stable policy identity and creation time;
- `active-speaker`, `natural-conversation`, or `dynamic` style;
- minimum shot duration and speaker-switch delay;
- explicit wide-camera clip identity;
- wide behavior for overlap, silence, intro/outro, and periodic cutaways; and
- bounded silence, cadence, and cutaway-duration controls.

The policy contributes to the canonical timeline fingerprint. A policy change
therefore clears stale draft camera decisions and requires a fresh durable edit
evidence binding. Undo restores the prior policy and decisions through normal
timeline history.

Every generated decision retains the policy ID, assembly reason, transcript
block IDs, proposal-set identity, timeline fingerprint, source clip identity,
and draft status. Wide decisions use the same program-monitor and Remotion
decision vocabulary as speaker decisions. Program audio is not switched by
this policy.

## Readiness and refusal behavior

The deterministic readiness projection reports:

- active video-source count;
- active and speaker-labeled transcript coverage;
- unique and explicitly mapped speakers;
- mapped-camera existence and complete speaker-range coverage;
- requested wide-camera existence and complete program coverage; and
- `ready`, `speaker-only`, or `blocked` status with the next exact action.

Timeline placement is explicitly not relabeled source-sync proof. Readiness
creates no decision. Assembly still requires current transcript/timeline
fingerprints and a successful append-only local-draft receipt.

When a wide camera is missing or does not cover a requested interval, Quipsly
keeps the existing speaker shot and emits a visible range-specific warning. It
never substitutes the highest track, invents camera identity, or emits a blank
wide decision.

## Operated retained-data result

The guarded PostgreSQL inventory inspected ten retained High Ground Odyssey
episode-production rows without writing them. No row yet contains the complete
canonical combination required for real multicamera assembly:

- `capture-sync-rendezvous-qa-20260805` has one video source and no transcript;
- `deterministic-edit-evidence-20260803` has four active transcript blocks and
  two speakers, but no video sources or camera mappings; and
- the other inspected episode rows have no materialized web timeline.

The readiness projection correctly blocks those fragmented records rather than
joining unrelated episodes or claiming a real HGO assembly. This is a useful
product finding: the next operated gate is a canonical Studio/Capture handoff
that puts synchronized camera sources, labeled transcript evidence, and
explicit mappings on one episode timeline.

## Verification and open gates

- Domain tests cover conservative legacy behavior, readiness, rapid turns,
  overlap refusal, wide overlap/silence/intro/outro, switch delay, periodic
  cutaways, and missing-wide refusal.
- Browser tests cover policy configuration, evidence rebinding, durable draft
  receipt content, artifact v5 save, and persisted wide decisions.
- The guarded retained-HGO database operation passes and truthfully reports no
  eligible canonical timeline.
- Sixty-one editor tests across twelve suites pass. The domain shot-grammar
  suite passes seven tests, artifact v5 passes two tests, and the guarded
  retained-HGO inventory passes separately.
- Quipsly, the shared domain package, and the production Next.js build pass
  type validation. The production build completes all 189 static-page steps.
- Physical iPhone sources, a real two-camera HGO artifact v5 timeline, human
  proof-watch, final render probe, and publication readback remain open.
