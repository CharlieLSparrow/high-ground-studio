# Shorts targeted review handoff proof - 2026-06-23

## What changed

Quipsly Studio now exposes per-short, agent-safe review handoff controls in the live `/state` payload.

Each short recipe can report:

- `reviewCommands.keep`
- `reviewCommands.refine`
- `reviewCommands.reject`
- `towerHandoff.status`
- `towerHandoff.nextAction`
- `towerHandoff.contract`

The handoff status is explicit readiness metadata. It does not publish, upload, schedule, capture receipts, or mutate original media.

## Product invariant preserved

Shorts remain output recipes over sequence time. They are not chopped media files. Source media and episode decisions remain untouched by review-status commands.

## Validation run

Commands run:

```bash
bash -n script/agentctl.sh
git diff --check
./script/build_and_run.sh --verify
./script/agentctl.sh health
./script/agentctl.sh state
./script/agentctl.sh shorts-review-target index 1 needs-captions "should fail"
```

Results:

- `bash -n script/agentctl.sh`: pass
- `git diff --check`: pass
- `./script/build_and_run.sh --verify`: pass; app launched through the real Quipsly Studio path
- `./script/agentctl.sh health`: pass; agent server reported `status: ok`
- Live state showed Episode 1 with 13 short recipes and review command strings on the first short
- Invalid targeted review status now fails safely before mutation

## Live state evidence

First short after restoration:

```json
{
  "firstTitle": "Test Short - Wednesday Rule moment",
  "firstReviewStatus": "needs-captions",
  "firstTowerHandoff": {
    "status": "needs-platform-review",
    "reviewStatus": "needs-captions",
    "exportProofReady": true,
    "platformReadyFraction": "0/7",
    "nextAction": "Resolve platform target: needs review.",
    "contract": "Handoff status is readiness metadata only. It does not publish, schedule, upload, or mutate source media."
  },
  "firstReviewCommands": {
    "keep": "script/agentctl.sh shorts-review-target id FC28A75E-451B-4D74-9636-2E842805F106 keep \"proof watched; ready for Tower handoff\"",
    "refine": "script/agentctl.sh shorts-review-target id FC28A75E-451B-4D74-9636-2E842805F106 refine \"needs another edit pass\"",
    "reject": "script/agentctl.sh shorts-review-target id FC28A75E-451B-4D74-9636-2E842805F106 reject \"not strong enough for publication\""
  }
}
```

## Important finding

A smoke attempt with unsupported status `needs-captions` showed why the CLI needed a stricter contract: the endpoint accepted the command, but the cached state normalized the unsupported status back to `draft`. The CLI now allows only `keep`, `refine`, and `reject` through `shorts-review-target`.

Other queue/readiness states should be changed through explicit queue metadata commands, not through the review handoff command.

## Next production lane

Pivot to Episode 4 sync once this slice is committed:

- Discover Episode 4 local media and existing session/project artifacts.
- Build the best stacked whole-source timeline possible.
- Sync clips that clearly belong together.
- Put questionable or non-syncing files in a visible held/quarantine lane instead of forcing them into the edit.
- Try both long-form episode cuts and shorts cuts from the synced timeline.
