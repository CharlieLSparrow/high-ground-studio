# Agentic HGO Projection Browser Smoke Result

Date: 2026-05-22

## Scope

Added a no-auth browser smoke for the HGO projection import/render path. This
does not open Studio, does not require private auth state, does not write to a
server, and does not use real manuscript or real HGO content.

## Result

- Added `pnpm hgo:projection:browser-smoke`.
- Added `scripts/agentic-hgo-projection-browser-smoke.mjs`.
- The script writes:

```text
artifacts/agentic-browser-smoke/hgo-projection-browser-smoke-report.json
```

## Behavior

The smoke uses inline synthetic HGO projection JSON, opens
`/projection-preview/import`, pastes the JSON, confirms validation warnings,
confirms the shared projection renderer root appears, checks known real-content
markers are absent, and writes a JSON report.

If `HGO_BASE_URL` is provided, the smoke uses it. If not, it starts the `web`
app on an available local port, waits for `/projection-preview/import`, runs the
smoke, and shuts the dev server down.

If Chromium is missing, the script writes a `blocked` report with:

```bash
pnpm exec playwright install chromium
```

## Validation Note

Chromium was installed locally with:

```bash
pnpm exec playwright install chromium
```

The smoke then passed against an auto-started local HGO dev server.

## Boundaries

No Studio auth, Google OAuth automation, database/schema changes, Cloud SQL,
Cloud Run config, DNS, billing, secrets, IAM, deploy, autosave,
Yjs/collaboration, real manuscript text, or real HGO content were involved.
