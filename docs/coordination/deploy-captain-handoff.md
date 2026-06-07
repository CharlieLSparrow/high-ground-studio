# Deploy Captain Handoff - Quipsly Beta Readiness

## Current release intent

Prepare and deploy the latest Quipsly/Nest beta pass only after Codex/user approval.

This pass includes:

- Nest route/product language additions (`/nests`, `/nests/[slug]`).
- Beta support page and app-shell support links.
- Recording/editor handoff summaries.
- Publishing destination status rail and destination helper usage.
- Research Library source-aware status labels.
- `/api/beta-readiness` endpoint.
- Expanded `scripts/release/quipsly-smoke-preview.sh` checks.

## Pre-deploy checks

Run only when instructed by the user or Codex release lead:

```bash
pnpm --filter quipsly build
```

If this fails, report exact file/line errors. Do not broad-rewrite unrelated lanes.

## Preview/live smoke

After deploy or preview URL is available:

```bash
PREVIEW_URL=https://<preview-or-live-url> HOST_HEADER=nest.quipsly.com scripts/release/quipsly-smoke-preview.sh
```

Then inspect beta readiness details:

```bash
curl -fsS https://nest.quipsly.com/api/beta-readiness | jq
```

`ok: true` means the endpoint works. `ready: true` means the configured environment is beta-ready by current checks. If `readinessStatus` is `needs-config`, report the specific check IDs before deciding whether to promote.

## Host routing smoke

Confirm:

- `https://quipsly.com/` shows marketing/home.
- `https://quipsly.com/support` shows support/Patreon beta page.
- `https://nest.quipsly.com/` lands in the app workbench/sign-in gate, not marketing.
- `https://nest.quipsly.com/projects` and `/nests` render the Nest hub or app gate.
- Marketing article paths stay on `quipsly.com`, not `nest.quipsly.com`.

## Rollback principle

Promote traffic only after smoke succeeds. If post-promote smoke fails, use the release train rollback script rather than patching live by hand.
