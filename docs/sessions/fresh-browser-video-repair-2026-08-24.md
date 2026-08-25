# Fresh browser video repair — 2026-08-24

## Defects found by the operated flight

Component tests proved rendering after a synthetic remote-track event, but a fresh two-browser LiveKit operation uncovered two lifecycle defects:

1. Local and remote media elements were attached to the lobby DOM. React replaced that stage when the call became connected, so the real tracks survived while their rendered elements disappeared.
2. Camera-off muted the LiveKit publication without unsubscribing it. Quipsly listened only for subscribe/unsubscribe and could leave the stale remote tile mounted.

## Production repair

- Local camera-track ownership now lives independently of the current `<video>` element. A newly mounted lobby or connected-stage video is rebound to the active track.
- Remote LiveKit tracks now live in a keyed registry independent of the current media container. A newly mounted container reattaches every active track.
- `TrackMuted` removes a remote video tile and `TrackUnmuted` restores it.
- Turning the local camera off clears the local preview; turning it back on binds the new publication track.
- Device fallback and camera switching use the same local-track binding path.
- Audio-first coaching remains the default. Video requires the ordinary Camera on action.

## Verification

- Strict Quipsly TypeScript passed.
- `live-session-room.test.tsx`: 31/31 passed, including remote-video mute/unmute behavior.
- Fresh operated video flight passed with two separately authenticated users and no retained fixture identifiers.
- Receipt: `artifacts/coaching-acceptance/b207439d/browser-live-room-receipt.json`
- Receipt fields include `browserVideoOperation: passed`, `twoPartyVideoStageProven: true`, `cameraTogglePreservedCall: true`, and `audioFirstCameraDefaultObserved: true`.
- The same operation also passed two-party presence, chat, consent, coordinated local-source recording, two independent verified source owners, safe-close state, and consent restoration after re-entry.

## Honest boundary

The operated cameras were Chromium fake-media devices. This proves real local LiveKit transport and DOM lifecycle behavior, not physical-camera image quality or human visual acceptance.
