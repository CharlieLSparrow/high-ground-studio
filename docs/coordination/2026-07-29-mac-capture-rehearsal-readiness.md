# Mac Capture rehearsal-readiness checkpoint

**Date:** 2026-07-29  
**Status:** signed app launch, current hardware enumeration, focused capture
contracts, visible Capture entry, exact-bundle enforcement, and the redacted
native-account control boundary pass; native Quipsly sign-in, app-owned
live-signal confirmation, physical short take, room join, upload, and
cross-device sync remain open

## Rehearsal decision

Quipsly Studio is the preferred Charlie-side surface for the first two-person
rehearsal once its native Quipsly account is connected:

- the Shure MV7i should own both the local microphone master and headphone
  return;
- LiveKit should carry a separate realtime copy for the audio call;
- the Canon R8 USB feed may create a synchronized local reference movie;
- the Canon's on-card recording remains the intended 4K production master;
- Scott/Homer should use Quipsly Capture on iPhone for the remote call plus his
  own local audio/video sources.

The browser Episode Room remains useful for manuscript, Watch, chat, and shared
session state. It is not the preferred owner of Charlie's local MV7i master.

## Current machine readback

macOS currently reports:

- `Shure MV7i` as the default audio input and default audio output;
- USB transport, two input channels, two output channels, and 48 kHz sample
  rate for the MV7i;
- `MOTIV Mix Virtual` as a separate virtual device, not a physical-route proof;
- `EOS Webcam Utility` as an available camera;
- the built-in MacBook Pro camera as a fallback.

This topology is the desired starting point for MV7i microphone and headphone
monitoring. System enumeration does not prove that a take remained on the route
from start through final stop; the app must create that continuity receipt.

## Signed app evidence

The exact safe-worktree Quipsly Studio debug app built, passed strict nested
signature verification, and launched:

`/Users/wall-e/Dev/high-ground-studio-product/apps/QuipslyStudio/DerivedData/Build/Products/Debug/QuipslyMac.app`

Signing team:

`585GUXMY5M`

The app-owned local control service returned healthy and a readable editor
state after launch. The native account projection currently says:

- Nest base URL: `https://nest.quipsly.com`;
- configured email present;
- saved session absent;
- verified Firebase identity absent;
- Home Nest absent;
- status: `Not connected yet.`

The app therefore has no authority to join the production Episode Room yet.
The required next account action is the state-bound Google-to-Nest-to-Mac
handoff from the Account workbench. No password should be created for an
existing Google account.

Episode Capture Setup is reachable from the application menu or
`Command-Shift-R`.

## Exact app and native-account control boundary

The canonical build presents **Continue with Google** as the primary account
action. Its password field remains behind an explicit recovery disclosure; it
is not part of the normal existing-user path.

The local semantic control surface now exposes only:

```text
GET /native_account?action=status|google|check_saved
```

`status` and `check_saved` inspect redacted state. `google` starts the same
state-bound browser handoff used by the human button. The route does not accept
a password, Firebase token, browser handoff code, PKCE verifier, or refresh
token. It has no sign-out, clear, delete, or other destructive account action.
A direct `action=clear` request returns HTTP 400, and `agentctl` rejects the
same action locally with exit 2.

Live smoke:

```bash
apps/QuipslyStudio/script/smoke_native_account_control.sh
```

The smoke passed all seven checks: service health, advertised route, status
acknowledgement, redacted state, absence of secret values, unsafe HTTP denial,
and unsafe CLI denial.

An obsolete installed copy at
`/Users/wall-e/Applications/Quipsly Studio.app` can otherwise be launched by
display name and present stale account UI. `studioctl.sh warn-duplicates` now
compares full executable paths. Runtime proof deliberately launched that copy,
reported its exact noncanonical PID while retaining the canonical PID, and
returned clean after the test copy was stopped. Rehearsal evidence is invalid
whenever `warning=duplicate_quipsly_bundle_running` is present.

The combined Mac editor now keeps **Capture** visible in the global workbench
header instead of relying on the application menu alone. Its accessible label,
help text, and stable identifier are present in exact-app UI readback. The
equivalent semantic command is:

```bash
apps/QuipslyStudio/script/agentctl.sh capture-open-setup
```

The command returns the actual `Episode Capture Setup` window count and
visibility after opening it. It does not request camera or microphone access,
choose a room, join LiveKit, start recording, upload, or publish. A live
launcher smoke verifies the signed bundle, advertised route, visible window,
declared side-effect boundary, and absence of any duplicate bundle:

```bash
apps/QuipslyStudio/script/smoke_capture_setup_launcher.sh
```

The smoke passed all six checks. Exact-path Computer Use also read back the
visible **Capture** control in the canonical binary. Addressing the app only by
display name reproduced the stale-installed-copy collision; the duplicate
guard caught it, and only that exact noncanonical PID was stopped.

## Focused capture-contract result

Thirty-eight selected QuipslyVideoCore tests passed with zero failures:

- `MacAudioRoomRouteTests`;
- `MacAudioRoomReceiptTests`;
- `ProductionCaptureTests`;
- `ProductionAudioRecorderTests`;
- `ProductionVideoReferenceRecorderTests`.

The passing contracts cover:

- exact physical MV7i input/output route resolution;
- LiveKit default-proxy binding only after Core Audio default-device readback;
- rejection of matching names with mismatched device IDs;
- fail-closed behavior if the selected input or headphones disappear;
- route-loss receipts that preserve expected and observed routes;
- separation of the realtime call feed from the local production WAV;
- a real 48 kHz/24-bit PCM file contract;
- preserved interrupted and partial audio/video takes;
- final byte, clock, device, and receipt boundaries;
- safe episode/take paths;
- EOS/Canon USB truth as a reference feed rather than a 4K card master;
- fresh pre-start live-image confirmation;
- strict room-binding identity across a companion audio/video take.

Evidence log:

`/var/folders/n8/75lt2yw16752qxw_l6j0khl00000gn/T/quipsly-mac-capture-swift-tests-20260729T135914.log`

## Production service compatibility

A fresh read-only production reviewer smoke passed:

- Firebase email/password sign-in and verified mailbox;
- native bearer verification;
- private Home Nest projection;
- visible capture session;
- participant and consent boundaries;
- lifecycle/readiness state;
- safe boolean recordability and next-action projection.

Evidence:

`/private/tmp/quipsly-production-reviewer-session-current.json`

This proves the deployed native-session boundary for the synthetic reviewer.
It does not prove Charlie's Mac handoff or Scott's first Google sign-in.

## Physical rehearsal sequence

1. Open Quipsly Studio **Account** and complete Charlie's Google handoff.
2. Open **Episode Capture Setup** with `Command-Shift-R`.
3. Select the exact rehearsal Episode Room.
4. Select `Shure MV7i` for the local master and headphone return.
5. Keep `MOTIV Mix Virtual` unselected unless deliberately rehearsing the
   virtual-route fallback; it must never be labeled direct MV7i proof.
6. Select `EOS Webcam Utility`, move in frame, and confirm the live image is
   current rather than a disconnected slate, frozen frame, bars, or placeholder.
7. Record 20-30 seconds locally without joining Scott; stop and inspect the WAV,
   MOV, and receipts.
8. Listen through the MV7i headphones and watch the reference movie.
9. Start a disposable two-person Episode Room, join Scott, and confirm each
   participant can hear the other without echo.
10. Record another 20-30 seconds while Scott flips iPhone cameras and both
    participants pause/resume once.
11. Play and pause **Be Curious** from both sides without starting a recording
    or Watch session implicitly.
12. Stop cleanly, retain every local original, wait for verified upload, and
    inspect the assembled timeline plus exact source identities in Nest/Studio.

## Open proof boundaries

Do not claim the Mac capture lane physically passed until all of these exist:

- native Charlie account verified in the app;
- exact Episode Room selected;
- macOS microphone and camera permission readback;
- fresh EOS live-image confirmation;
- finalized MV7i WAV and Canon reference MOV;
- route-continuity and interruption-safe receipts;
- human listen/watch of the complete disposable take;
- two-participant LiveKit call operation;
- verified upload and same-ID Nest timeline readback;
- separate proof for the Canon R8 on-card 4K master if used.

No recording was started and no source was uploaded during this checkpoint.
