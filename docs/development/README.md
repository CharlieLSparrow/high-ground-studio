# Development

This is the authoritative collaborator entrypoint for local engineering.

## Toolchain

| Tool | Version or policy |
| --- | --- |
| Node | `24.14.0` from `.node-version` |
| pnpm | `10.30.3` from `package.json` |
| TypeScript | package-pinned compiler plus the [TypeScript 7 compatibility gate](typescript-7-migration.md) |
| Xcode | `26.2` for Capture CI parity |
| iOS simulator | iOS `26.2`, iPhone 17 Pro in CI |
| Capture Ruby | `4.0.5` from `apps/mobile-capture/HighGroundCapture/.ruby-version` |
| Capture Bundler / Fastlane | `4.0.11` / `2.236.1` from the Capture lock and Gemfile |
| PostgreSQL | local Docker service for persistent Nest work |
| Firebase Auth | local emulator for disposable identities |

Install:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Capture release tooling must not use or mutate Apple's system Ruby. The
checked-in runner accepts the exact active Ruby from a version manager or the
exact Homebrew Ruby when available, installs the locked gems into the macOS
user cache, and fails if dependency resolution changes committed source:

```bash
apps/mobile-capture/HighGroundCapture/scripts/run-fastlane.sh verify
```

## Choose one surface

| Goal | Start command | Primary guide |
| --- | --- | --- |
| Develop Nest | `pnpm quipsly:local:up` | [Nest local](../runbooks/quipsly-nest-local.md) |
| Validate Nest and HGO | `pnpm quipsly:release:local` | [Testing](testing.md) |
| Develop HGO web | `pnpm --filter web dev` | [Local dev](../runbooks/local-dev.md) |
| Develop Capture | open the shared Xcode scheme; use the pinned Fastlane runner for release lanes | [Capture verification](../../apps/mobile-capture/HighGroundCapture/CAPTURE_VERIFICATION.md) |
| Inspect releases | use the surface runbook | [Release index](../runbooks/release-index.md) |

Do not start every runtime by default. Select the product surface and the
declared dependencies it consumes.

## Environment rules

- Copy `.env.example`; never commit populated `.env` files.
- Use emulator identities and a loopback database for ordinary Nest work.
- Cloud credentials are needed only for explicit credentialed runtime or
  deployment proof.
- App Store Connect credentials and signing keys never belong in the repo.
- Treat production recordings, transcripts, coaching notes, and manuscripts as
  private data, not fixtures.

## Change lifecycle

1. Name the user workflow and source of truth.
2. Use `scripts/ci/plan-changed-surfaces.mjs` to understand affected surfaces.
3. Make one dependency-closed change.
4. Run deterministic checks.
5. Operate the visible app and prove persistence when applicable.
6. Obtain credentialed runtime or delivery proof when the claim requires it.
7. Update durable docs and open a pull request.

The detailed proof levels are in [Testing and proof](testing.md).
