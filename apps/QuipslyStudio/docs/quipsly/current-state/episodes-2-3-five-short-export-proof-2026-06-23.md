# Episodes 2 and 3 five-short export proof

Date: 2026-06-23

## What this proves

Quipsly Studio can export selected shorts from explicit native session files, not only from the currently visible app session.

This matters because Episode 1 can stay open in the UI while Codex or another agent proves Episode 2 and Episode 3 export readiness through the app-owned agent endpoint.

## Code capability proved

`/shorts_export_selected` now accepts:

```text
sessionName=<native-session-name>
directory=<absolute-output-folder>
basename=<safe-output-basename>
selectedShortId=<short-id>
selectedShortTitle=<short-title>
```

The direct export path:

- Reads the requested session from the local MediaVault.
- Exports the selected short through the app-owned proxy worker.
- Keeps source media untouched.
- Updates `lastShortExportProof` and `lastShortExportSessionName` so agent evidence does not depend on the currently visible UI selection.
- Only mutates visible selected-short state when the export session matches the active UI session.

## Validation command

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
```

Result: passed.

Note: Xcode printed existing warnings in `WorkspaceView.swift` and the normal multiple matching macOS destinations warning.

## Episode 2 export smoke

Session:

```text
episode-2-codex-overlap-review-v3-wordtimed
```

Output folder:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810
```

Summary:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-five-short-smoke-summary.json
```

Exported shorts:

| # | Title | Duration | Size | Output |
|---|---|---:|---:|---|
| 1 | Episode 2 Review Candidate 01 - 08:24 | 22.56s | 2838128 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-01-episode-2-review-candidate-01-08-24-9x16-short.mp4` |
| 2 | Episode 2 Review Candidate 02 - 11:29 | 20.24s | 2631893 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-02-episode-2-review-candidate-02-11-29-9x16-short.mp4` |
| 3 | Episode 2 Review Candidate 03 - 16:00 | 21.68s | 2786339 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-03-episode-2-review-candidate-03-16-00-9x16-short.mp4` |
| 4 | Episode 2 Review Candidate 04 - 20:59 | 18.56s | 2479196 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-04-episode-2-review-candidate-04-20-59-9x16-short.mp4` |
| 5 | Episode 2 Review Candidate 05 - 24:29 | 19.68s | 2584277 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode2-five-short-smoke-20260623-031810/episode2-05-episode-2-review-candidate-05-24-29-9x16-short.mp4` |

Each export reported:

- Manifest status: `completed`
- Source policy: `proxy-only; original media untouched`
- State output match: true
- `lastShortExportProof` match: true

## Episode 3 export smoke

Session:

```text
episode-3-premiere-rescue-youtube-wordtimed
```

Output folder:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910
```

Summary:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-five-short-smoke-summary.json
```

Exported shorts:

| # | Title | Duration | Size | Output |
|---|---|---:|---:|---|
| 1 | Episode 3 Review Candidate 01 - 03:41 | 20.28s | 4085120 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-01-episode-3-review-candidate-01-03-41-9x16-short.mp4` |
| 2 | Episode 3 Review Candidate 02 - 06:47 | 25.84s | 5093358 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-02-episode-3-review-candidate-02-06-47-9x16-short.mp4` |
| 3 | Episode 3 Review Candidate 03 - 22:13 | 45.00s | 8658744 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-03-episode-3-review-candidate-03-22-13-9x16-short.mp4` |
| 4 | Episode 3 Review Candidate 04 - 26:38 | 45.00s | 8658744 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-04-episode-3-review-candidate-04-26-38-9x16-short.mp4` |
| 5 | Episode 3 Review Candidate 05 - 32:04 | 45.00s | 8658744 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode3-five-short-smoke-20260623-031910/episode3-05-episode-3-review-candidate-05-32-04-9x16-short.mp4` |

Each export reported:

- Manifest status: `completed`
- Source policy: `proxy-only; original media untouched`
- State output match: true
- `lastShortExportProof` match: true

## Current meaning

The mechanical local export path for five shorts per episode is now proven for Episodes 1, 2, and 3.

This does not mean the shorts are publication-quality yet. It means the app can now reliably produce local proof files from short recipes without touching originals.

Next work should focus on:

- Better human-facing Shorts panel UX.
- Better hooks, titles, captions, and platform-native packaging.
- Refinement controls for start/end/crop.
- Watch-once review flow before publishing.
- Social queue handoff and publication receipts.
