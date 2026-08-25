# Fresh native provider-room boundary — 2026-08-24

## Outcome

The fresh native recovery flight at source `9466ff22e8929c33bf2de9da296753756fa85699` now includes an explicit provider-room join/leave stage before recording recovery. The stage operated a brand-new invited client account and canonical coaching Session through the rendered iPhone UI.

On the iOS Simulator, LiveKit reached the CallKit audio-activation boundary and the app failed closed with its retry UI. The test verified that no recording began and reported an explicit skip instead of claiming a provider connection. The subsequent capture-recovery lane passed completely.

## Evidence

- Receipt: `artifacts/coaching-acceptance/b207439d/native-capture-recovery-receipt.json`
- Client-entry result: `artifacts/coaching-acceptance/b207439d/native-client-entry.xcresult`
- Provider-room result: `artifacts/coaching-acceptance/b207439d/native-room-join.xcresult`
- Capture-recovery result: `artifacts/coaching-acceptance/b207439d/native-capture-recovery.xcresult`
- Fresh identifiers were created through the product; retained fixture identifiers were not used.
- Client entry passed without joining or recording automatically.
- Provider-room stage: zero failures, one deliberate Simulator-only skip.
- Provider-room stage did not start recording.
- Capture, playback, server SHA-256 and byte-size verification, forced-process-death recovery, protected offline playback, online re-entry, and durable Studio handoff all passed.
- The required recording was projected into the canonical Session production with `VERIFIED` status, exact bytes verified, and `RELEASED` processing disposition.

## Honest boundary

This result proves the native happy path fails safely when Simulator CallKit cannot activate real call audio. It does **not** prove real provider media, a physical iPhone, first-run microphone permission, natural speech, human listening, novice acceptance, or production scale. Those remain separate acceptance lanes; none is inferred from a green Simulator result.

## Continuous next lane

The next independent lane is a fresh two-browser LiveKit operation against the same local production-shaped services. It can prove provider presence, two-party roster convergence, persisted consent, coordinated independent local sources, recovery, and canonical verification without waiting for physical-device availability. Physical iPhone provider-media proof remains required before claiming mobile call parity.
