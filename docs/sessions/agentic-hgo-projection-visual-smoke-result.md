# Agentic HGO Projection Visual Smoke Result

Date: 2026-05-22

## Scope

Added a no-auth HGO visual smoke artifact pass for synthetic projection preview
surfaces. The pass is meant to let Codex produce screenshots and a route matrix
for later human review without Studio auth, server writes, real manuscript text,
or real HGO content.

## Command

```bash
pnpm hgo:projection:visual-smoke
```

## Outputs

- Report:
  `artifacts/agentic-browser-smoke/hgo-projection-visual-smoke-report.json`
- Screenshots:
  `artifacts/playwright/hgo-projection-visual-smoke/`

Expected latest screenshot names:

- `projection-preview-map.png`
- `projection-preview-import-empty.png`
- `projection-preview-import-rendered.png`
- `projection-detail-synthetic-episode.png`
- `projection-detail-synthetic-field-radio.png`
- `projection-detail-synthetic-book-map.png`
- `projection-detail-synthetic-lantern-archive.png`

## Behavior

- Uses synthetic HGO projection JSON only.
- Starts the web app locally if `HGO_BASE_URL` is not provided.
- Visits `/projection-preview`, `/projection-preview/import`, and discovered
  synthetic detail slugs from the existing synthetic projection fixture.
- Captures full-page screenshots on success.
- Checks known real-content markers are absent.
- Writes route status, screenshot path, page title, heading, warnings, errors,
  commit SHA, and safety confirmations to the JSON report.
- Shuts down any spawned local web dev server.

## Boundaries

This pass does not replace authenticated Studio browser smoke. It does not open
Studio, automate OAuth, write to a server, publish anything, touch Cloud SQL,
change schema, deploy, add autosave, or add collaboration/Yjs behavior.
