# Studio First Live Operator Brief Result

Date: 2026-05-19

## Summary

This pass added a concise operator briefing for the eventual first live private
Studio Cloud Run deployment session.

Added:

```text
docs/runbooks/studio-first-live-operator-brief.md
```

## What It Covers

The brief covers:

- what the first live Studio target is
- what must not be done from Codex
- the Cloud Run deployment sequence at checklist level
- required placeholder values to prepare before the session
- stop conditions for the operator
- how the session maps to Cloud Developer certification practice
- links to the deeper Cloud Run, Structure Mode smoke, and platform-boundary
  docs

## What Remains Manual

The operator still owns:

- selecting the real GCP project
- setting the Cloud Run region
- enabling APIs
- creating Artifact Registry resources
- creating Secret Manager secrets and versions
- creating and granting IAM to the runtime service account
- running Cloud Build
- deploying Cloud Run
- configuring Google OAuth callback URLs
- verifying the live service and logs

No live DevOps action was performed in this pass.

## Validation

Completed validation for this docs-only pass:

```bash
pnpm studio:cloudrun:preflight
pnpm studio:structure:test
pnpm studio:cloudrun:test
git diff --check
```

The preflight reported no blocked items. It warned that `gcloud` is not
installed or not on `PATH`, so installing and initializing the Google Cloud CLI
remains a prerequisite for the future operator session.

## Safety

This pass did not deploy, run Cloud Build, create GCP resources, change IAM,
change DNS, create or mutate secrets, mutate databases, add dependencies, or
run remote `db:push`.
