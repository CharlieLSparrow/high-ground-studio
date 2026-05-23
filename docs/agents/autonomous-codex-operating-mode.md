# Autonomous Codex Operating Mode

Date: 2026-05-23

Chuck has approved a faster autonomous operating mode for this repo.

## Default Posture

Codex may independently:

- inspect the repo
- choose a coherent narrow sprint
- edit files
- run relevant verification
- commit coherent changes
- push the active branch
- deploy runtime changes when a documented safe deploy path exists
- smoke test the deployed surface
- document rollback

This permission is meant to reduce stop-and-start work. It is not permission to
skip verification, hide failures, or make risky production changes.

## Required Before Commit

- working tree reviewed with `git status --short`
- relevant tests/typechecks/builds run
- known failures or skipped checks understood and reported
- docs updated when the change creates durable product, architecture, deploy, or
  workflow knowledge
- no secrets, local env files, customer data, payment data, service accounts, or
  provider credentials staged

## Required Before Deploy

- the repo already has a runbook or deploy script for the target
- the change touches a deployable runtime surface
- local verification passed or the exact non-blocking caveat is documented
- runtime secrets exist through the approved secret path
- no production database mutation is required unless there is an explicit
  migration and rollback plan
- smoke test routes are known
- rollback command is known

## Stop And Ask / Report Blocker

Stop before doing any of these:

- adding or printing secrets
- creating surprise paid or privileged resources
- mutating production database schema
- wiring live Stripe, Patreon, POD, social, publishing, or payment providers
- storing payment card data
- exposing private Studio manuscript/source material publicly
- deploying without a known rollback path
- committing generated/private artifacts that should remain ignored

## Reporting Shape

End each autonomous sprint with:

- branch and commit SHA
- files changed
- verification commands and results
- deployed URL or exact deploy blocker
- smoke test result
- rollback path
- next recommended sprint
