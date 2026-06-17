# Quipsly Native Editor Agent Control

This is the local control path that lets Codex or another trusted local operator drive the running native QuipslyStudio Mac app without pretending screenshots are proof.

## Current app path

Active control target:

- `apps/QuipslyStudio`
- Xcode project: `apps/QuipslyStudio/QuipslyStudio.xcodeproj`
- macOS scheme: `QuipslyMac`
- control server: `AgentServer` in `Sources/SharedUI/AgentServer.swift`

The app starts a local HTTP server on `127.0.0.1:8080`/port `8080` while running. It is for local development proof, not public network exposure.

## Commands

Use:

```bash
cd apps/QuipslyStudio
script/agentctl.sh health
script/agentctl.sh commands
script/agentctl.sh demo
script/agentctl.sh state
```

Useful edit commands:

```bash
script/agentctl.sh decision charlie 12.5 4
script/agentctl.sh decision homer 18 6
script/agentctl.sh decision skip 31 3
script/agentctl.sh tag "Charlie" active 12.5 4
script/agentctl.sh tag "Homer" cut 12.5 4
script/agentctl.sh offset "Homer" -2.5
script/agentctl.sh clear-tags "Charlie"
```

## What this proves

The control path should let an agent:

1. Confirm the app is running.
2. Load the demo edit.
3. Apply source-lane edit decisions.
4. Query state and see lanes, source offsets, active/cut counts, tags, playhead, and sequence duration.

That is the minimum loop before claiming the native editor can be operated by Codex.

## Current blocker found 2026-06-14

The local build did not reach Swift compilation because the machine was out of disk space during Xcode package extraction:

- volume had roughly `564Mi` free
- Firebase/grpc binary packages failed extraction
- Xcode could not write its result bundle

The broken `apps/QuipslyStudio/DerivedData` folder created during that attempt was removed. Do not retry full Xcode builds until several GB are free.

## Next proof after disk space is available

```bash
cd apps/QuipslyStudio
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project QuipslyStudio.xcodeproj \
  -scheme QuipslyMac \
  -configuration Debug \
  -derivedDataPath DerivedData \
  build

open DerivedData/Build/Products/Debug/QuipslyMac.app
script/agentctl.sh health
script/agentctl.sh demo
script/agentctl.sh decision charlie 12.5 4
script/agentctl.sh state
```

If `/state` reports lane counts and active/cut counts changing after commands, the local control seam is working.
