# Quipsly Video

Status: active standalone native video editor experiment.

Read first:

```text
../../docs/coordination/native-video-editor-control-room.md
```

## What this app is

`apps/quipsly-video` is the independent Swift macOS/iOS editor lane.

It is the current place to build the lightweight native Quipsly editor:

- full source lanes;
- synced source monitor wall;
- program output;
- explicit `Play Through` and `Play Edit`;
- proxy-first playback;
- non-destructive edit decisions.

## What this app is not

This is not the old Quipsly Mac shell.

Do not pull assumptions from:

- `apps/quipsly-mac` unless explicitly porting a useful isolated component;
- the old web `/editor` unless translating a concept intentionally;
- Premiere's clip-fragment model;
- 360/INSV experiments ahead of the normal podcast editor.

## Product invariant

Source media stays whole.

The editor stores sync and edit decisions over source media.

The program output is derived from decisions.

Skipped material remains available in `Play Through`.

## Current known rough edges

As of 2026-06-14, this app still has prototype behavior that must be corrected:

- `WorkspaceView` has a hardcoded Episode 1 WAV auto-import path.
- The editor UI can still hide core surfaces until a player exists.
- `DualViewers` uses one shared `AVPlayer` for source and output.
- The timeline's left label strip is not the Synced Source Monitor Wall.
- `ProxyEngine` writes temporary UUID proxies.
- `VideoTag` is compatibility scaffolding, not final edit-decision truth.
- `AgentServer` is a local automation helper, not product architecture.

## Correct next slices

1. Visible editor shell.
2. WAV import proof.
3. MP4/proxy proof.
4. Two-camera placeholder edit.
5. Episode 1 Premiere packet import.
6. Then export.

Do not skip straight to export.

