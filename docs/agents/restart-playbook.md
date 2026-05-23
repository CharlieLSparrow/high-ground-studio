# Restart Playbook

Date: 2026-05-23

Use this after a reboot, crash, context loss, or long pause. The goal is to get
the captain and worker lanes moving again without remembering the whole system.

## One-Minute Recovery

Open Codex in:

```text
/Users/wall-e/Dev/high-ground-studio
```

Paste this:

```text
Resume as integration captain for High Ground Studio.

First:
- read AGENTS.md
- read docs/coordination/progress-thread.md
- read docs/coordination/agent-board.md
- read docs/agents/multi-agent-collaboration.md
- read docs/agents/restart-playbook.md

Then run:
- git fetch --all --prune
- git status --short --branch
- git worktree list --porcelain

Report current branch, dirty files, pushed branches, and the next safest action.
Keep coordination lightweight. If DB/API/deploy/service work is the right move,
ask for that approval directly and keep moving.
```

## Single Progress Thread

Use this as the readable project chat log:

```text
docs/coordination/progress-thread.md
```

Every agent should append short updates there:

```text
### Agent / branch

- Did:
- Checked:
- Blocked:
- Next:
```

## Captain Can Spawn Workers

When sub-agent tooling is available, the captain may spawn workers for bounded,
disjoint tasks. Use this only when it removes friction. Do not spawn workers onto
the same files at the same time.

Good captain-spawned worker tasks:

- inspect one route or package and report risks
- write docs for one lane
- add tests for one pure helper package
- implement one isolated UI panel or API route
- run verification in a separate worktree

Bad captain-spawned worker tasks:

- broad product ownership with unclear file boundaries
- conflicting edits to shared files
- production DB/provider/deploy mutation without approval
- any task where the captain is blocked waiting for the result before moving

## Worker Packets

### Manuscript Collaboration Agent

Use when continuing collaboration lab work.

```text
ROLE: Manuscript Collaboration Agent
WORKTREE: /Users/wall-e/Dev/high-ground-studio or a fresh manuscript worktree
BRANCH: create a fresh codex/studio-collab-* branch from current main

Read first:
- AGENTS.md
- docs/coordination/progress-thread.md
- docs/coordination/agent-board.md
- docs/project-context/current-state.md
- docs/runbooks/studio-collaboration-lab.md
- docs/architecture/studio-realtime-collaboration-plan.md

Own:
- apps/studio/src/app/manuscript/collaboration-lab/*
- scripts/studio-collaboration-*.test.mjs
- docs/runbooks/studio-collaboration-lab.md

Do not touch without handoff:
- apps/studio/src/app/content-studio/*
- production /manuscript persistence
- prisma/schema.prisma
- real manuscript text

Next useful work:
- continue synthetic-only collaboration lab evolution
- preserve current main collaboration state
- append progress to docs/coordination/progress-thread.md
```

### WorldHub Integration Agent

Use when integrating business infrastructure and the foundation branch.

```text
ROLE: WorldHub Integration Agent
WORKTREE: /Users/wall-e/Dev/hgs-worldhub-project
BRANCH: project/worldhub

Read first:
- AGENTS.md
- docs/coordination/progress-thread.md
- docs/coordination/agent-board.md
- docs/agents/multi-agent-collaboration.md
- docs/architecture/content-management-studio.md
- docs/project-context/current-state.md
- docs/architecture/system-overview.md
- docs/architecture/domain-model.md

Own:
- project/worldhub merge prep
- packages/worldhub-domain when present
- apps/web/src/app/team/worldhub/* when present
- provider-neutral WorldHub docs

First job:
- update project/worldhub from current main
- integrate codex/worldhub-001-foundation without deleting current Studio
  collaboration work
- treat package.json, pnpm-lock.yaml, apps/studio, apps/web, and docs as shared

Fast-approval zones:
- Prisma/schema, providers, deploys, billing, secrets, IAM, DNS, Firebase

Append progress to docs/coordination/progress-thread.md.
```

### Studio Cut Agent

Use when continuing media tooling.

```text
ROLE: Studio Cut / Media Tooling Agent
WORKTREE: /Users/wall-e/Dev/high-ground-studio-codex-studio-cut-001
BRANCH: codex/studio-cut-001-web-shell

Read first:
- AGENTS.md
- docs/coordination/progress-thread.md
- docs/coordination/agent-board.md
- docs/studio-cut.md
- docs/studio-cut-morning-handoff.md
- tools/studio-cut-local/README.md

Own:
- apps/studio-cut-web/*
- tools/studio-cut-local/*
- scripts/studio-cut-web-smoke.mjs
- Studio Cut deploy/verify docs

Do not touch without handoff:
- apps/studio/src/app/content-studio/*
- apps/studio/src/app/manuscript/*
- WorldHub provider/domain packages

Next useful work:
- keep offline-first media workflow healthy
- unblock Hosting/auth only when approval and credentials are ready
- append progress to docs/coordination/progress-thread.md
```

### Content Studio Agent

Use when extending the command surface started on
`codex/content-studio-command-001`.

```text
ROLE: Content Studio Agent
WORKTREE: /Users/wall-e/Dev/high-ground-studio
BRANCH: codex/content-studio-command-001 or a fresh codex/content-studio-* branch

Read first:
- AGENTS.md
- docs/coordination/progress-thread.md
- docs/coordination/agent-board.md
- docs/architecture/content-management-studio.md
- docs/plans/content-studio-now-next-later.md
- apps/studio/src/app/content-studio/page.tsx
- apps/studio/src/app/content-studio/content-studio-client.tsx

Own:
- apps/studio/src/app/content-studio/*
- Content Studio docs
- future focused tests or smoke for /content-studio

Next useful work:
- add import for exported browser packets
- add focused model tests
- decide whether the first shared persistence step should be Prisma, API, or a
  small service

Append progress to docs/coordination/progress-thread.md.
```

## Green-Light Guidance

Safe to run now:

- Content Studio follow-up agent on a fresh branch from
  `codex/content-studio-command-001`
- Manuscript collaboration agent on a fresh branch from current `main`
- Studio Cut agent in its existing worktree

Run WorldHub integration after the captain or WorldHub agent has explicitly
updated `project/worldhub` from current `main`, because the existing foundation
branch diverges from the latest Studio collaboration commits.
