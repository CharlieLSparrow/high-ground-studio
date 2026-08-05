# Canon R8 and Shure MV7i Mac preflight

Date: 2026-08-05

## Operated hardware result

The connected Shure MV7i enumerated as the default 48 kHz, two-input,
two-output USB device. A local-only capture returned two 48 kHz channels and
both channels carried the same quiet-room signal during the short proof. This
establishes the call-path device and headphone route; it is not a spoken-level,
LUFS, true-peak, or retained-master proof.

The Canon R8 enumerated as an authenticated USB camera. Canon EOS Utility 3
opened a real Remote Live View feed and reported 4K UHD, 23.98 fps, IPB movie
mode with autofocus and camera audio meters. Canon's virtual camera initially
returned its disconnected USB slate even though the R8 was healthy. The actual
conflict was Canon's background `EOS Utility` launcher retaining ownership of
the camera. Stopping that exact launcher changed the next local sample from the
slate to live R8 video.

The final synchronized reference sample contained:

- live EOS Webcam Utility video at 1280 by 720 and approximately 28.75 fps;
- Shure MV7i AAC reference audio at 48 kHz, two channels;
- a 3.025-second local MP4 with no upload, publication, or source mutation.

## Product adjustment

The Session live-room preflight now shows browser-reported camera resolution
and frame rate separately from microphone evidence. When `EOS Webcam Utility`
is selected, it explains the exact ownership repair: quit both EOS Utility
surfaces, keep the R8 connected and in movie mode, and rerun the preview. It
also states that Canon's browser feed is the call/reference picture while the
R8's on-camera 4K file remains the protected master to align into the capture
group.

The selected device preview still records or uploads nothing. Joining the call
still does not start retained recording or optional provider egress.

## Remaining proof

The in-app browser policy refused loopback navigation even though local Nest
health returned HTTP 200, so this checkpoint does not claim a rendered local
browser operation. The next signed preview/production operation should select
EOS Webcam Utility, Shure MV7i, and the MV7i headphone output, speak through a
real level check, join the room, start a separately visible retained source,
and then inspect the exact Session asset in the editor.
