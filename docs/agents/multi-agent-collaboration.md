# Multi-Agent Collaboration

Date: 2026-05-23

This repo can support multiple Codex agents, but only if each agent makes its
lane, branch, file ownership, and handoff visible.

## Recommendation

Use multiple agents, but keep them lane-scoped:

- one integration/release captain
- one Studio/content-workflow agent
- one WorldHub/business-infrastructure agent
- one Studio Cut/media-tooling agent when needed

Do not put multiple agents on the same files without an explicit handoff.

## Source Of Truth

The async coordination board is:

```text
docs/coordination/agent-board.md
```

Each agent should update that board when starting, pausing, finishing, or
blocking a sprint.

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

## Collision Rules

- If another agent owns a file path, do not edit it without taking over the lane
  in the board.
- If a branch is meant for integration, do not commit directly to it unless you
  are acting as release captain.
- If two branches touch the same runtime app, integration captain decides merge
  order and runs the final build/smoke.
- If generated files appear, verify they are expected before staging.
- Do not resolve conflicts by deleting another agent's work unless Chuck
  explicitly asks.

## Suggested Branch Shape

- `main`: production/current merged trunk
- `project/worldhub`: integration branch for WorldHub and platform foundation
- `codex/worldhub-*`: focused WorldHub task branches
- `codex/studio-*`: focused Studio task branches
- `codex/studio-cut-*`: Studio Cut/media-tooling task branches

## Live Conversation

Agents cannot talk to each other live unless an external service is wired in.
For now, use docs as the message bus:

- `docs/coordination/agent-board.md` for current state
- `docs/agents/*` for agent instructions
- `docs/sessions/*` for completed deployment or investigation records
- PR comments for review and merge discussion when branches are published

This is slower than live chat, but it is durable, reviewable, and works inside
the repo without new services or credentials.
