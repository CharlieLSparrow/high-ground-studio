# Repo Map: The Master Index

This document serves as the master index for the `high-ground-studio` monorepo. It outlines where every application, package, and script lives.

## `apps/` (The Frontends & Daemons)
These are the executable entry points of the ecosystem.

- **`apps/studio/`**: The primary Next.js web application. This is the UI where you edit podcasts (NLE), view Niche Hubs, and control the Local Engine.
- **`apps/studio-collab/`**: A WebSocket collaboration server for multiplayer editing in the Studio.
- **`apps/web/`**: The public-facing marketing and content delivery site (Next.js).
- **`apps/local-engine/`**: The Node.js hardware daemon that runs locally on the M4 Mac. Handles SD card ingest, FFmpeg hardware encoding, and Insta360 packaging.
- **`apps/video-dashboard/`**: The Electron prototype container (Option 1) for wrapping the ingest tracker in a native OS window.
- **`apps/ai-hub/`, `apps/photography-hub/`, `apps/video-hub/`**: Specialized Next.js hubs for specific content niches.

## `packages/` (Shared Logic & Domains)
These are internal NPM packages shared across the `apps/`. By keeping logic here, we ensure the backend and frontend never duplicate code.

- **`packages/worldhub-domain/`**: The core business logic for the WorldHub platform (e-commerce, Patreon webhooks, connections).
- **`packages/content-studio-domain/`**: Domain logic for the podcast editing NLE, including EDL parsing and timeline state.
- **`packages/quipsly-domain/`**: Core logic for the "Quipsly" sub-feature.

## `scripts/` (Automation & CI)
A massive collection of standalone Node.js and Python scripts used for automation, deployment, testing, and AI operations.

- **`scripts/insta360-agent.py`**: The UI automation agent that commandeers the Mac to export perfect optical `.mp4`s from Insta360 Studio.
- **`scripts/ingest-media.mjs`**: The legacy script that inspired the new `apps/local-engine/` daemon.
- **`scripts/studio-cloud-run-deploy.mjs`**: Deployment scripts for pushing the Studio app to Google Cloud Run.
- **`scripts/agentic-studio-hgo-browser-smoke.mjs`**: Puppeteer/Playwright scripts used by our autonomous testing agents.
- **`scripts/seed-*.mjs`**: Database seeding scripts for membership plans and test data.

## `prisma/` (Database & Schema)
- **`prisma/schema.prisma`**: The master ledger of all durable state (Users, Appointments, Orders, etc.).

## `pathways/` (Course Materials)
- A specialized directory containing Markdown and JSON data for educational pathways and course assignments (e.g. `WDD-430-web-full-stack-development`).
