# Persisted audio range-decision checkpoint

Date: 2026-08-03

## Outcome

Quipsly now converts only fully covered decoded low-energy intervals into an
unapplied exact-range proposal. Applying the proposal creates reversible
timeline metadata, not fabricated transcript text and not modified media.

Episode artifact v3 persists the range, transcript speaker labels, transcript
deactivation state, and the immutable decoded-signal binding. The content
fingerprint includes the same decisions, so an older analysis becomes stale as
soon as the edit changes.

## Playback and render behavior

One deterministic interval projection merges transcript-block cuts and exact
range decisions. Active-edit playback and Remotion render composition split and
ripple around the merged intervals. Source-review mode remains the complete
timeline and is the target for proof-listen.

The Playback cockpit displays:

- source and active-edit duration;
- total safely skipped duration and exact-range count;
- a persistent decision ledger with source bounds, reason, confidence, decoded
  coverage, RMS dBFS, and signal-profile fingerprint;
- Proof-listen source; and
- Restore to edit, which remains undoable and saveable after reload.

## Canonical evidence

A deterministic-signal range records:

- recording asset ID;
- immutable source SHA-256;
- storage generation;
- signal-profile SHA-256;
- measured-low-energy classification;
- coverage fraction;
- strongest covered RMS dBFS; and
- the source's near-silence threshold.

The client accepts the proposal only when that identity exactly matches the
server proposal-set binding and the decoded measurement covers the complete
proposed interval. Overlapping deactivation decisions fail closed.

## Operated acceptance

The dedicated synthetic High Ground QA episode retained one clearly marked
test-only range from `00:04` through `00:07`. Local browser operation proved:

1. the server resolved one current released source;
2. the editor rendered 100% coverage, `-78.0 dBFS`, and the signal-profile
   fingerprint;
3. Proof-listen played the untouched `00:02` through `00:08` context and made
   no edit;
4. Apply created one three-second range decision and the Playback cockpit
   reported one deactivated section;
5. save wrote episode artifact v3;
6. reload restored the ledger, active-edit duration, Charlie/Homer speaker
   labels, source SHA binding, and signal-profile binding from PostgreSQL;
7. Restore removed the persisted decision from the editable state; and
8. Undo restored it while reiterating that source media never changed.

The fixture is synthetic and does not claim physical-iPhone or genuine HGO
audio acceptance.

## Verification

- seven focused suites: 38/38 passing;
- strict Nest TypeScript passing;
- browser apply/save/reload/restore/undo passing;
- PostgreSQL readback: payload v3, one 3-second range at second 4, four retained
  Charlie/Homer labels, and both SHA bindings at 64 hexadecimal characters.

## Next

Persist proposal review receipts separately from the timeline decision so
proof-listen, apply, dismiss, restore, actor, artifact revision, and provider
identity remain auditable. Then connect named speakers to camera sources and
produce an assembled draft with before/after proof and render receipts.
