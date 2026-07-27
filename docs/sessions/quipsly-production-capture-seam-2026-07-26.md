# Quipsly production capture seam

Date: 2026-07-26

## Outcome

Quipsly now has one implementable source architecture across Nest, iPhone, and
Mac without pretending that a web call or virtual camera is a production
master.

Nest owns Episode Room identity, access, consent, chat, prepared-clip commands,
server-clock exchange, and source status. Quipsly Capture and Quipsly Studio own
local immutable media. LiveKit is the audio-only conversation path. Studio owns
alignment and non-destructive editorial decisions.

## Implemented

- authenticated, room-authorized capture-clock endpoint in Nest;
- bounded three-sample iPhone clock burst stored with audio/video source
  profiles;
- native Mac camera/Core Audio inventory and production route policy;
- crash-recoverable Mac 48 kHz/24-bit PCM WAV recorder;
- in-progress, interrupted, failed, and finalized source receipts;
- streamed SHA-256 and byte-count finalization off the UI actor;
- Episode Capture Setup recording/recovery UI;
- immutable multi-file Canon card ingest with independent source/copy hashes;
- technical media probe and durable card-import receipts;
- automatic local editor attachment for finalized Mac audio and verified Canon
  masters, with capture-group provenance and a separate attachment receipt;
- background loading for the large source-aware waveform map;
- bounded Studio launch status instead of an automatic external-root walk;
- a real playable fixture for the AV composition layering test.

## Verification

- `pnpm --filter quipsly typecheck`
- clock route Jest: 4/4
- QuipslyVideoCore: 22/22, including physical-versus-virtual MV7i receipt
  truth, real-MP4 byte-identical card ingest, and provenance-bearing editor
  attachment
- HighGroundCapture generic iOS Simulator build
- QuipslyMac debug build
- real QuipslyMac launch/readback and one-window capture-setup visual smoke

## Hardware truth on this Mac

MOTIV Mix Virtual is available at 48 kHz, but a direct physical MV7i route is
not. EOS Webcam Utility is available, but a direct Canon R8 UVC device is not.
The iPhone Continuity Camera and microphone are visible. These routes are
reported as observed and are not promoted to physical-master status.

## Next acceptance gates

1. With the MV7i attached and visible directly, grant Quipsly Studio microphone
   permission, record at least 60 seconds, stop, reopen the WAV, inspect both
   channels, read back the JSON receipt, and listen through MV7i headphones.
2. Add the separate LiveKit call branch and prove that its voice processing does
   not alter the local master.
3. Attach finalized Mac/iPhone sources to one Episode Room capture group, build
   proxies, propose alignment with uncertainty and drift, and review the result
   in the Studio timeline.
4. Pass the long-take, route-loss, storage, interruption, recovery, physical
   iPhone, TestFlight, and real episode rehearsal matrices.
