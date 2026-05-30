# Infrastructure Map: Deployment Targets

The High Ground Studio platform spans across local hardware and cloud environments. This map defines the boundaries of where code runs.

## 1. The Cloud (Google Cloud Platform & Vercel)
- **Frontend UIs (`apps/web`, `apps/studio`)**: Deployed to Vercel (or GCP Cloud Run via `scripts/web-cloud-run-deploy.mjs`). These are globally distributed and handle the web traffic, NLE interface, and Niche Hubs.
- **Database (`prisma/`)**: Deployed to a managed PostgreSQL instance (Cloud SQL).
- **Storage Buckets**: Google Cloud Storage holds the raw Insta360 `.insv` packages safely away from local SSDs.
- **WorldHub Webhooks**: Exposed endpoints that listen for Patreon/Stripe events.

## 2. The Local Engine (M4 MacBook Pro)
- **`apps/local-engine`**: Runs *only* on the local Mac. It is never deployed to the cloud.
- **Why?** It requires physical access to `/Volumes/Bender` (the SD Card) and raw access to the M4's Media Engine (`h264_videotoolbox`) for blistering fast FFmpeg renders.
- **The Bridge:** The Cloud UI communicates with this local daemon via a WebSocket (`ws://localhost:4000`), allowing the web app to trigger hardware-heavy tasks.

## 3. Docker (Local Dev)
- **`compose.studio.yml`**: Used for spinning up local development databases (`studio-postgres`) so developers can test without hitting the production Cloud SQL database. (See `pnpm studio:db:up`).
