# QuipslyStudio Release Export Hardening Notes

Last updated: 2026-06-17

## Why this exists

Episode 1 produced a real full release candidate through QuipslyStudio, but the run exposed two production hardening needs:

1. One global export progress number can look frozen while AVFoundation is actively writing a large artifact.
2. After the release candidate artifacts were created, the QuipslyStudio control server/app process was no longer running when inspected from `agentctl`.

Both matter because a complete editor must be usable by humans and Codex. A human needs calm truth in the UI. Codex needs machine-readable state that distinguishes active writing from stuck/failure.

## Evidence from Episode 1 release candidate

Release folder:

`/Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate`

Command used:

```bash
./script/agentctl.sh full-release-prepare /Users/wall-e/Movies/QuipslyExports/Episode1FullRelease/2026-06-17-release-candidate episode1-the-wednesday-rule
```

Observed artifact results:

- 16:9 master: `episode1-the-wednesday-rule-16x9.mp4`, `1920x1080`, about `76m 19s`, about `5.7GB`
- 9:16 master: `episode1-the-wednesday-rule-9x16.mp4`, `1080x1920`, about `76m 19s`, about `4.2GB`
- Podcast audio: `episode1-the-wednesday-rule-podcast-audio.m4a`, audio-only, about `74m 04s`, about `132MB`
- Social shorts: 9 exported 1080x1920 MP4s
- Delivery packet: generated
- Publish packet: generated
- Podcast packet: generated manually after app/control server exit

Observed control-plane issue:

- `agentctl full-release` stopped working after the artifacts were present because the local server was no longer listening on `127.0.0.1:8080`.
- The artifacts were real and probeable, so this was not an export-output failure.
- Treat this as an app/control-server lifecycle bug until proven otherwise.

## Code hardening already added

`Sources/SharedUI/WorkspaceView.swift` now derives artifact-level export status from the planned output paths:

- `ready`: final file exists and is nonzero
- `writing`: final file is missing/empty, but an AVFoundation sidecar exists and is nonzero
- `empty`: final file exists but is zero bytes
- `missing`: no final file and no sidecar evidence

The export state payload now includes:

- `artifactStates`
- `artifactSummary`

The full release payload now includes:

- `artifactSummary`

The UI export/full-release copy also warns that large exports may continue writing/finalizing even if one progress value appears unchanged.

Full release prep now also writes a durable receipt named:

`<basename>-release-finalization-receipt.json`

That receipt is updated at major phases:

- `started`
- `exports-completed`
- `delivery-packet`
- `publish-ledger`
- `publish-packet`
- `social-shorts-packet`
- `podcast-packet`
- `completed`
- `failed`

This means a release folder can tell humans and agents the last known successful
phase even if the app/control server exits before the final UI state can be read.

## Next hardening targets

1. Keep QuipslyStudio alive after full release export completes.
2. Ensure the local `AgentServer` stays listening after long export runs or restarts cleanly with a clear diagnostic.
3. Add artifact-level progress/status to the visible release console, not only `/state` and `/full_release` payloads.
4. Add ffprobe-derived media facts directly to the release-finalization receipt after final success.
5. If the app exits intentionally or crashes, write a local crash/export lifecycle note into the release folder before shutdown where possible.
6. Add a narrow smoke command that verifies a release folder contains: 16:9 master, 9:16 master, podcast audio, shorts, delivery packet, publish packet, podcast packet.

## Product principle

Do not ask humans or agents to infer media pipeline truth from a single progress number. Release status should report artifact truth: planned, writing, ready, failed, and missing.
