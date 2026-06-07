# Quipsly Mac

Native macOS cockpit for the Quipsly local engine.

This app is intentionally separate from the existing Electron `desktop-companion`.
The local TypeScript engine remains the shared power plant on `ws://localhost:4000`;
the native app is the long-term shell for video editing, local ingest, safe offload,
and opt-in research workflows such as Vision Lab.

## Run

```bash
pnpm --filter local-engine exec ts-node src/index.ts
cd apps/quipsly-mac
swift run QuipslyMac
```

## Current modules

- Dashboard: engine connection and capability status.
- Media Engine: ingest, proxy, editing, and safe-offload cockpit placeholder.
- Vision Lab: gated research dashboard for local image identification workflows.
- Local Files: future native file browser and watched-folder controls.
- Cloud Sync: durable vault/offload status.
- Settings: Nest URL, local engine URL, and experimental module visibility.

## Product rule

Nest stays the collaborative cloud workspace. Quipsly Mac stays the local power
tool for files, media, proxies, ML jobs, and hardware-adjacent workflows.
