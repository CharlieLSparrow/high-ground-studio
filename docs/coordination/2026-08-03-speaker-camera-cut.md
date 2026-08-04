# Speaker-camera cut checkpoint

Date: 2026-08-03

## Outcome

The Episode editor can now turn canonical speaker timing into a persisted,
reversible multicamera draft without introducing a parallel edit format. A
reviewer maps each named speaker to one synchronized camera clip, binds the
current deterministic edit-evidence set, and explicitly assembles the draft.
The edit monitor and Remotion renderer consume the same camera decisions.

## Production contract

Episode artifact v4 adds:

- explicit `speakerCameraMappings`, normalized by canonical speaker key and
  bound to stable clip and asset identities; and
- exact-range `cameraSwitchDecisions` retaining speaker, mapping, clip, asset,
  transcript-block, proposal-set, timeline-fingerprint, status, source, and
  creation evidence.

Mapping changes invalidate prior analysis and clear stale camera decisions.
Assembly refuses unmapped speakers and source ranges the mapped camera does not
cover. It holds overlapping speakers and turns shorter than 1.5 seconds rather
than generating flash cuts. Every accepted draft requires a current
proposal-set binding and successful append-only `APPLIED_TO_DRAFT` receipt.
Restoring a range writes a `RESTORED_TO_DRAFT` receipt before changing local
state. Canonical autosave remains the boundary collaborators reload.

## Shared monitor and render semantics

The program monitor first resolves an exact camera decision, then falls back to
the pre-existing visible-track priority. Remotion divides visual source time at
the same decision boundaries and emits only the selected program video while
leaving audio segments continuous. Deactivated source ranges still ripple in
active-edit mode before camera selection, so transcript cuts and camera cuts do
not disagree about time.

Each assembled camera range now has a direct **Proof-watch cut** control. It
plays the assembled edit with 1.5 seconds of bounded context, stops at the
review boundary, and appends a `PROOF_WATCHED` receipt bound to the exact
camera-switch ID, source range, proposal set, timeline fingerprint, camera
clip/asset, speaker mapping, and transcript blocks. The ledger row then shows a
durable **Proof watched** state and can be watched again. Proof watching does
not approve, save, render, publish, or change source media.

## Operated acceptance

The retained local journey
`pnpm quipsly:retained:speaker-camera-cut` performs real rendered work through
the production APIs and UI:

1. signs in through the rendered login with the local-only retained Firebase
   identity and Keychain credential (the existing local identity seed repairs
   that prerequisite after an emulator reset without printing secrets);
2. saves a two-camera, four-block, two-speaker episode artifact;
3. maps Charlie and Scott in the rendered editor;
4. creates the durable deterministic proposal set;
5. assembles two camera ranges while holding a 0.8-second Scott interjection;
6. observes the exact two-decision canonical autosave request;
7. reloads the episode and reads back both switch ranges and the selected
   Charlie edit-monitor angle;
8. proof-watches an assembled range through the rendered editor and reads back
   its exact durable review receipt and visible reviewed state; and
9. reloads again and proves that review evidence survives independently of the
   reversible camera draft.

The final operation retained two camera mappings, two switch decisions, one
deliberate rapid-turn hold, proposal creation, local-draft application,
canonical-save, and proof-watch receipts. Source media remained unchanged and
the final browser run had no page errors or horizontal overflow.

The first external H.264 fixtures exposed a codec-format error in the headless
environment. They were replaced with a small CC0 WebM fixture so the retained
journey proves Quipsly's selection contract independently of a proprietary
decoder. Physical iPhone/Canon media and final rendered-output probing remain
separate acceptance gates.

## Verification

- focused speaker-cut, review-ledger, and review-route suites: 11/11 passed;
- strict Nest TypeScript: passed;
- complete 166-route Nest production build: passed with an explicit 8 GB Node
  heap after the default 4 GB build worker exhausted memory; and
- retained rendered camera-map, evidence, assemble, autosave, proof-watch,
  receipt reload, and overflow journey: passed.

## Next join

Run the same speaker-camera contract on genuine consented HGO Capture and Canon
sources, then probe an exported render's streams, duration, and switch seams.
In parallel, continue the transcription-provider corpus evaluation so speaker
labels and timing have measured correction-cost evidence rather than assumed
quality.
