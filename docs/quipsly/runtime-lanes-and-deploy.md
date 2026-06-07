# Quipsly runtime lanes and deploy architecture

Status: active operating model as of 2026-06-07.

Quipsly is no longer one app blob. It is a product system with separate runtime lanes. Mixing those lanes is why deploys got slow, Mac auth got awkward, and local media work started contaminating web releases.

## Runtime lanes

### 1. Nest Web

Owner: `apps/quipsly`

Production service: Cloud Run service `studio`

Primary host: `https://nest.quipsly.com`

Responsibilities:

- Browser app shell, Nest/project hub, manuscript editor, media editor, recorder/call routes, publishing cockpit, admin tools, and public-safe app APIs.
- Server-owned auth, sessions, role checks, project access grants, and production metadata.
- The database-facing source of truth for durable collaboration state.

Deploy rule:

- Build inside Linux Cloud Build.
- Do not deploy a macOS-built `.next/standalone` artifact.
- Do not exclude `apps/quipsly/public` unless those assets have already moved to durable external static hosting.
- Deploying a new image should not rewrite Cloud Run secrets/env unless the change explicitly needs runtime config.

### 2. Quipsly Mac

Owner: `apps/quipsly-mac`

Runtime: native SwiftPM macOS app on the user's machine.

Responsibilities:

- Native production cockpit for local files, import comfort, sync prep, Premiere rescue, and embedded Nest routes.
- System-browser sign-in using `ASWebAuthenticationSession`.
- Local app settings for Nest base URL, local engine URL, default Nest/project/episode, and session token storage.

Deploy rule:

- The Mac app is packaged and distributed separately from the Nest Web Cloud Run image.
- Mac build products never belong in Cloud Build contexts for `studio`.
- Native auth should use external/system browser handoff, not embedded WebView OAuth as the primary path.

### 3. Local Engine

Owner: `apps/local-engine`

Runtime: local Node/WebSocket worker.

Responsibilities:

- ffprobe/ffmpeg media probing, proxy/thumb generation, local queue processing, upload/register commands, and upload/auth error classification.
- It is the machine-room process for local media work, not the collaboration source of truth.

Deploy rule:

- Local engine is not bundled into the Nest Web Cloud Run image.
- If it later becomes a cloud worker, it gets its own service and deployment path.

### 4. Static/media assets

Owners:

- App chrome assets currently live in `apps/quipsly/public`.
- Durable user media belongs in GCS under the media-vault path policy.

Responsibilities:

- App chrome and marketing visuals required at runtime.
- Raw/proxy/thumb media objects for real episode work.

Deploy rule:

- Current web deploys must include `apps/quipsly/public` because the app still serves those assets from the Next runtime.
- The next architecture improvement is moving heavy public image/cosplay libraries to object storage or CDN so web deploys can become small without asset loss.

## Current deploy commands

Stage a complete web-only context without starting a deploy:

```bash
pnpm quipsly:web:stage
```

Build and deploy the Nest Web service:

```bash
pnpm quipsly:web:deploy
```

Optional local validation before remote build:

```bash
LOCAL_VALIDATE=1 pnpm quipsly:web:deploy
```

The deploy script stages only the files needed for a Linux Next build, but it includes all public assets. It intentionally excludes `apps/quipsly-mac`, `apps/local-engine`, local build products, local media, docs, and reports.

## Anti-patterns we are retiring

- Calling a script "fast" when it silently drops assets.
- Treating the Mac app as part of the web deploy context.
- Treating the local engine as a hidden dependency of the web runtime.
- Using embedded WebView OAuth as the primary native app sign-in path.
- Rewriting Cloud Run secrets/env as part of ordinary image deployment.
- Assuming a green local macOS build artifact is deployable to Linux.

## Near-term architecture backlog

1. Move heavy public image libraries from `apps/quipsly/public` to GCS/CDN-backed static hosting.
2. Add a first-class release report that records build ID, image digest, revision, smoke target, and rollback revision.
3. Split schema jobs into a smaller DB-sync image so additive data work does not pay the full app build tax.
4. Package Quipsly Mac through a real distribution lane with signing/notarization when beta distribution needs it.
5. Promote local engine configuration into a visible desktop settings and diagnostics panel.
