# Agentic Browser Auth State

Date: 2026-05-22

## Purpose

The browser smoke harness can drive the synthetic Studio/HGO workflow only when
an operator supplies a private authenticated browser storage state. This keeps
the harness useful without weakening Studio auth.

The harness must not automate Google OAuth, scrape credentials, print secrets,
or commit auth material.

## Private Storage State Path

Default path:

```text
artifacts/auth/studio-storage-state.json
```

This path is ignored by git. Never commit it, paste it into chat, or share it as
a fixture.

## Create Or Refresh Auth State

Start the local Studio server in the normal way, then run:

```bash
pnpm studio:hgo:capture-auth-state
```

This opens a headed browser at Studio `/manuscript`. Sign in manually through
the browser. Do not type credentials into the terminal. After the signed-in
Studio manuscript page is visible, return to the terminal and press Enter. The
helper saves browser cookies/storage to:

```text
artifacts/auth/studio-storage-state.json
```

If Playwright reports that no browser executable is installed, install Chromium
for local development:

```bash
pnpm exec playwright install chromium
```

## Delete Auth State

To force a fresh sign-in later, remove the private file:

```bash
rm artifacts/auth/studio-storage-state.json
```

Do not commit the deletion or the file itself; `artifacts/auth/` is generated
operator state.

## Run Browser Smoke

With Studio and HGO dev servers running and private auth state present:

```bash
pnpm studio:hgo:browser-smoke
```

Defaults:

```text
STUDIO_BASE_URL=http://localhost:3000
HGO_BASE_URL=http://localhost:3001
STUDIO_AUTH_STORAGE_STATE=artifacts/auth/studio-storage-state.json
AGENTIC_BROWSER_HEADLESS=true
```

Use `AGENTIC_BROWSER_HEADLESS=false` when you need to watch the browser.

## Report Path

The browser smoke writes:

```text
artifacts/agentic-browser-smoke/studio-hgo-browser-smoke-report.json
```

Failure screenshots, when available, are written under:

```text
artifacts/playwright/
```

Both output folders are ignored by git.

## Report Status

- `blocked`: auth storage state is missing. The harness did not open a browser
  and did not perform server writes.
- `passed`: the browser used private auth state, loaded synthetic Studio data,
  created synthetic-only Studio records, generated HGO projection JSON, imported
  it into HGO, and confirmed warnings/rendering.
- `failed`: the browser run started but a selector, auth state, server, render,
  or validation expectation failed. Check `errors`, `steps`, and screenshots in
  the report.

## Safety Boundary

The browser smoke may create synthetic-only manuscript-library and manual
snapshot records when it runs with valid auth. It must not use real manuscript
text, real HGO content, public publishing, autosave, Yjs/collaboration, Cloud
SQL schema changes, Cloud Run config changes, DNS/OAuth/billing/secrets/IAM
changes, or deployments.
