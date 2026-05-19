# Studio First Live Operator Brief

Date: 2026-05-19

## Purpose

When Chuck sits down for the first live Studio deployment session, this is the
fast path: prove the private Studio service on Cloud Run, prove `/structure`,
and stop before custom-domain or broader platform work.

Use this as the operator briefing. Use the deeper runbooks for exact commands
and verification details.

## Do Not Do From Codex

Do not initiate these from an agent session:

- no agent-initiated deploy
- no Cloud Build submission from Codex
- no Google Cloud resource creation from Codex
- no IAM mutation from Codex
- no DNS mutation from Codex
- no Secret Manager mutation from Codex
- no remote `db:push`

Codex can prepare docs, scripts, and code. The operator owns the live Google
Cloud session.

## Known First-Live Target

- Service: Studio
- Runtime target: Cloud Run
- Route to prove: `/structure`
- Health route: `/api/health`
- Useful MVP storage: browser `localStorage`
- Structure Mode storage key: `high-ground-studio.structure-mode.v1`
- First live database posture: no remote database dependency
- Auth posture: Google OAuth plus temporary `STUDIO_AUTH_MODE=allowlist`

The first live success is not the whole platform. It is one private Cloud Run
service that lets an allowlisted user use Structure Mode in a browser.

## Operator Sequence

1. Run `pnpm studio:cloudrun:preflight`.
2. Choose and set the GCP project.
3. Set the Cloud Run region.
4. Enable required APIs.
5. Create the Artifact Registry Docker repository.
6. Create Secret Manager secrets.
7. Create the Cloud Run runtime service account.
8. Grant least-privilege secret access to that service account.
9. Build the image with `pnpm studio:cloudbuild:image:sha`.
10. Deploy to the generated Cloud Run URL.
11. Configure the Google OAuth callback URL.
12. Verify `/api/health`.
13. Sign in with an allowlisted Google account.
14. Smoke test `/structure` with
    `docs/runbooks/studio-structure-mode-smoke.md`.
15. Only then consider a custom domain.

## Required Values To Prepare

Prepare these placeholders before the session:

- `PROJECT_ID`
- `REGION`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_SECRET`
- `STUDIO_ALLOWED_EMAILS`
- Cloud Run service name, expected first value: `studio`
- Artifact Registry repository name, expected first value:
  `high-ground-studio`

Do not put real secret values in the repo, chat, shell history, or screenshots.

## Stop Conditions

Stop the operator session if any of these happen:

- `pnpm studio:cloudrun:preflight` reports blocked items
- the wrong GCP project is active
- the intended Cloud Run region is unclear
- required secrets are missing
- the OAuth callback URL is not configured
- `/api/health` does not return the expected non-sensitive JSON
- an allowlisted account cannot sign in
- a non-allowlisted account can access Studio
- `/structure` does not load
- `/structure` cannot persist a browser-local draft through refresh
- Cloud Run logs show unresolved startup or auth errors

Do not paper over these in the first-live session. Fix the blocker, document
the result, and retry from the last safe step.

## Cloud Developer Practice

This session maps directly to practical Google Cloud Developer skills:

- Cloud Build for container image builds
- Artifact Registry for image storage
- Cloud Run for serverless container runtime
- Secret Manager for runtime secrets
- IAM and service accounts for least-privilege runtime identity
- environment variables and secret injection
- Cloud Run logs, revisions, rollbacks, and health checks

Later Vertex AI, Gemini, embeddings, and evaluation work belongs to the ML path.
It is intentionally out of scope for this first live service.

## Pointers

Use these deeper docs during the session:

- `docs/runbooks/studio-cloud-run.md`
- `docs/runbooks/studio-structure-mode-smoke.md`
- `docs/architecture/platform-service-boundaries.md`
