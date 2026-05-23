# Multi-Agent Collaboration

Date: 2026-05-23

This repo can support multiple Codex agents moving fast, but only if each agent
makes its lane, branch, file ownership, and handoff visible before editing.
The goal is momentum with collision avoidance, not a permission queue.

## Source Of Truth

Use this board as the async coordination surface:

```text
docs/coordination/agent-board.md
```

Do not create a second coordination system. Update the board when starting,
pausing, finishing, blocking, or handing off a sprint.

Append short human-readable progress notes here:

```text
docs/coordination/progress-thread.md
```

Use the progress thread like a single async project chat: concise updates,
branch names, checks, blockers, and links to commits or docs. Do not require
agents to wait for approval unless they hit overlapping file ownership or a
fast-approval zone.

## Recommended Roles

- Integration / release captain
- Studio / Content Management Studio agent
- Manuscript collaboration agent
- Studio Cut / media-tooling agent when needed
- WorldHub / business-infrastructure agent

Do not put multiple agents on the same files without an explicit handoff on the
board.

## Agent Start Protocol

Before editing:

1. `git fetch --all --prune`
2. `git status --short --branch`
3. Read `docs/coordination/agent-board.md`
4. Add or update your lane entry with:
   - branch
   - goal
   - files or directories likely to be touched
   - explicit no-touch areas
   - planned verification
5. Stop if another active lane owns overlapping files.

## Agent Finish Protocol

Before leaving a sprint:

1. Run relevant verification.
2. Commit and push if the slice is coherent.
3. Deploy only when the target has a documented safe deploy path.
4. Update `docs/coordination/agent-board.md` with:
   - commit SHA
   - files changed
   - checks run
   - deploy status
   - blockers
   - next recommended handoff

## Branch Rules

- `main` is the clean integration runway. Do not do feature work directly on
  `main`.
- Use one branch per lane, then merge through the integration captain.
- Integration captain is a traffic controller for merge order and validation,
  not the owner of every product decision.
- Use `project/worldhub` as the current WorldHub integration branch unless the
  integration captain records a replacement branch on the board.
- Do not commit directly to `project/worldhub` unless you are acting as
  integration captain for that merge cycle.
- If a branch is behind `main`, update it from `main` before stacking new
  product work on top of it.

## Collision Rules

- If another agent owns a file path, do not edit it without taking over the
  lane in the board.
- If two branches touch the same runtime app, integration captain decides merge
  order and runs the final build/smoke.
- Treat `package.json`, `pnpm-lock.yaml`, Dockerfiles, Prisma files, auth files,
  deployment configs, and top-level docs as shared files.
- If generated files appear, verify they are expected before staging.
- Do not resolve conflicts by deleting another agent's work unless Chuck
  explicitly asks for that outcome.

## Fast-Approval Zones

Database, API, deployment, provider, and service-boundary work is not forbidden
when it is the right move. It just needs explicit scope, rollback thinking, and
fast approval before mutation. Do not contort the repo into a monolith to avoid
a clean database update, a new API boundary, or a small deployable service.

## Durable Message Bus

Agents cannot talk to each other live unless an external service is wired in.
For now, use repo artifacts:

- `docs/coordination/agent-board.md` for current state
- `docs/agents/*` for agent instructions
- `docs/sessions/*` for completed deployment or investigation records
- PR comments for review and merge discussion when branches are published

This is slower than live chat, but it is durable, reviewable, and works inside
the repo without new services or credentials.
