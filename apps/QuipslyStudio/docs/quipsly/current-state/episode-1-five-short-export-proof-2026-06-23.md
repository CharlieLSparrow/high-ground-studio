# Episode 1 five-short export proof

Date: 2026-06-23

## What this proves

Quipsly Studio can repeatedly export selected Episode 1 short recipes as local 9:16 proxy-based MP4 files through the agent control path.

This proof keeps the Quipsly editor invariant intact:

- Whole synced sources remain intact.
- Shorts are timeline recipes/metadata.
- Export uses proxy media.
- Original media is not mutated.
- Agent-readable state reports the latest selected/exported short truth after each export.

## Validation command

```sh
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
```

Result: passed.

Note: Xcode printed the usual multiple matching macOS destinations warning.

## Export smoke

Output folder:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643
```

Summary:

```text
/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-five-short-smoke-summary.json
```

Each short was selected through `/shorts_queue_select`, exported through `/shorts_export_selected`, and verified against:

- MP4 exists and has non-zero size.
- Manifest status is `completed`.
- Manifest source policy is `proxy-only; original media untouched`.
- `/state.exportOutputPaths` includes the exported file.
- `/state.lastShortExportProof.lastExportedPath` matches the exported file.

## Exported shorts

| # | Title | Duration | Size | Output |
|---|---|---:|---:|---|
| 1 | Test Short - Wednesday Rule moment | 8.13s | 982720 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-01-test-short-wednesday-rule-moment-9x16-short.mp4` |
| 2 | Farm Work Teaches Stewardship | 22.64s | 2166062 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-02-farm-work-teaches-stewardship-9x16-short.mp4` |
| 3 | Learning Why, Not Just What | 40.83s | 3593867 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-03-learning-why-not-just-what-9x16-short.mp4` |
| 4 | Mutual Mentorship | 40.00s | 3511509 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-04-mutual-mentorship-9x16-short.mp4` |
| 5 | Record From Anywhere | 45.00s | 3821954 bytes | `/Users/wall-e/Desktop/QuipslyShortsProof/episode1-five-short-smoke-20260623-030643/episode1-05-record-from-anywhere-9x16-short.mp4` |

## Code change

`AgentServer` now supports a direct selected-short proxy export path:

- Reads the canonical native session JSON from the local MediaVault.
- Stages a lean selected-short export request.
- Launches the app-owned `script/shorts_proxy_export.py` worker.
- Reconciles the completed manifest into `/state`.
- Adds `lastShortExportProof` so agent evidence is not dependent on fragile UI selection timing.

## Still not complete

This is a strong Episode 1 export proof, not the whole goal.

Remaining work:

- Repeat the workflow for Episodes 2 and 3 after their sessions/media are stable.
- Improve the visual Shorts panel UX so humans can refine these without reading JSON.
- Improve short quality, hooks, captions, and platform packaging.
- Add/verify preview and refinement controls for start/end nudging.
- Continue building toward a true publication-ready social queue.
