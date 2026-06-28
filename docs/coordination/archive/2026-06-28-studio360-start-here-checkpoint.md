# Studio360 Start Here Checkpoint - 2026-06-28

## Status

Regenerated the Studio360 front-door control artifact from the current external-drive evidence.

Current status:

- `studio360-start-here-repair-first`
- Plain-English meaning: repair blockers are visible, but proof/reframe review can continue where safe.

## Latest artifact

Open:

```bash
open '/Volumes/My Passport/Quipsly Media Workspace/Studio360/StartHere/20260628-153024-403577-studio360-start-here/index.html'
```

JSON:

```text
/Volumes/My Passport/Quipsly Media Workspace/Studio360/StartHere/20260628-153024-403577-studio360-start-here/studio360-start-here.json
```

Latest pointer:

```text
/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-start-here.json
```

## Counts from current evidence

- Assets: `220`
- Asset groups: `100`
- Workflow groups: `100`
- Ready reframe groups: `76`
- Ready recipes: `152`
- Proof outputs present: `16`
- Ready-to-run proof rows: `8`
- Needs-proxy groups: `2`
- Blocked media repair: `6`
- Damaged assets: `7`
- Repair tickets: `3`
- Repair tickets needing source recopy: `1`
- Exports created: `0`
- Renderer commands executed: `0`
- Originals mutated: `0`

## Safety boundary

This pass did not mutate originals, create proxies, execute repairs, run renderers, create exports, upload externally, publish externally, schedule externally, or create receipt truth.

The Start Here artifact is an operator map only. It should route humans and agents to the next safe local action.

## Tooling hardening

`apps/QuipslyStudio/script/build_studio360_start_here.py --help` now prints usage instead of accidentally treating `--help` as an output root.

## Follow-up refresh

Generated the safe local operator surfaces:

```bash
python3 -m py_compile apps/QuipslyStudio/script/build_studio360_source_desk.py apps/QuipslyStudio/script/build_studio360_next_source_card.py apps/QuipslyStudio/script/build_studio360_renderer_preflight.py apps/QuipslyStudio/script/studio360_repair_decision.py apps/QuipslyStudio/script/build_studio360_start_here.py
bash -n apps/QuipslyStudio/script/agentctl.sh
apps/QuipslyStudio/script/agentctl.sh studio360-source-desk
apps/QuipslyStudio/script/agentctl.sh studio360-renderer-preflight
apps/QuipslyStudio/script/agentctl.sh studio360-repair-status
apps/QuipslyStudio/script/agentctl.sh studio360-next-source-card
apps/QuipslyStudio/script/agentctl.sh studio360-start-here
```

Fresh local packets:

- Source Desk: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/SourceDesk/20260628-153314-772532-360-source-desk/index.html`
- Renderer Preflight: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/RendererPreflight/20260628-152957-103499-360-renderer-preflight/index.html`
- Repair Status: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/repair-status/20260628-152951-850651-360-repair-status/index.html`
- Next Source Card: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/NextSourceCards/20260628-153024-075873-360-next-source-card/index.html`
- Start Here: `/Volumes/My Passport/Quipsly Media Workspace/Studio360/StartHere/20260628-153024-403577-studio360-start-here/index.html`

Current source-desk evidence:

- Assets: `220`
- Groups: `100`
- Reframe-ready groups: `76`
- Recipes: `160`
- Export candidate rows: `152`
- Renderer dry-run ready rows: `152`
- Existing proof outputs: `16`
- Repair tickets: `3`
- Repair decisions: `0`
- Originals mutated: `false`
- Exports created: `0`
- External publishing: `false`

Next source card:

- Group key: `20250613-143420`
- Route: `proxy-safe-reframe-review`
- Assets: `5`
- Original count: `2`
- Proxy count: `1`
- Companion count: `2`
- First proof candidate: `20250613-143420-16x9-v007`
- First proof output exists: `false`
- First proof command is prepared but not executed.

Pointer hardening:

- `build_studio360_source_desk.py` now writes both `latest-360-source-desk.json` and `latest-studio360-source-desk.json`.
- Both pointers resolve to `/Volumes/My Passport/Quipsly Media Workspace/Studio360/SourceDesk/20260628-153314-772532-360-source-desk/360-source-desk.json`.

## Next safe 360 action

Open the Start Here page, then choose one of these reversible paths:

1. Repair-first: inspect repair status/preflight and mark one group as needs-source, needs-redownload, use-companion, park, or review after human confirmation.
2. Proof-review: review the 16 existing proof outputs before rendering more.
3. Reframe-review: inspect the 76 reframe-ready groups and 152 recipes before any full export.
4. Proxy-prep: route the 2 needs-proxy groups into managed proxy prep.

No full export should be treated as ready until renderer preflight and human approval are captured for that candidate/version.
