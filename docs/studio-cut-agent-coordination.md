# Studio Cut Agent Coordination

Date: 2026-05-24

This repo can support multiple agents, but Studio Cut needs clear ownership
lanes so speed does not turn into conflicting edits.

## Operating Principle

Prefer multiple agents when their work can be separated by surface area and
verified independently. Reduce to one agent when a change crosses shared
contracts, release boundaries, or sensitive infrastructure.

The default rule is:

```text
one agent owns one coherent slice, one write area, one verification path
```

## Current Lanes

### Video Workflow Agent

Primary owner for:

- `apps/studio-cut-web`
- `packages/studio-cut-schema`
- `tools/studio-cut-local`
- `tools/studio-cut-cloud-sync`
- `scripts/studio-cut-*`
- `docs/studio-cut*.md`
- `firestore.rules`, `storage.rules`, and `firebase.json` only when the task is
  explicitly Studio Cut related

Responsibilities:

- keep semantic editing and Sync Map architecture coherent
- run `pnpm studio-cut:verify`
- attempt Hosting deploy after passing verification
- push completed commits
- report deploy blockers and rollback commands

### Studio / Manuscript Agent

Primary owner for:

- `apps/studio`
- manuscript editor workflows
- Studio Prisma-backed authoring models
- Studio Cloud Run deployment docs and Docker/build config

This agent should not change Studio Cut surfaces without coordinating through a
doc note or explicit handoff.

### Public Web / Content Agent

Primary owner for:

- `apps/web`
- public High Ground pages
- content projection pages
- coaching and team ops surfaces
- public build stability

This agent should not change Studio Cut unless the task is a shared monorepo
tooling issue.

## Coordination Through Docs

Agents cannot talk live to each other, so the repo docs are the message board.

Use:

- `docs/studio-cut-morning-handoff.md` for current operator truth
- `docs/studio-cut-product-mission.md` for north-star decisions
- `docs/studio-cut-rescue-sync.md` for sync architecture
- `docs/studio-cut-cloud-sync.md` for worker/cloud sync contracts
- `docs/studio-cut-firestore-rules.md` for security posture
- `docs/agents/codex-handoff.md` for broad repo-level handoff notes

When a conclusion will matter tomorrow, write it down. Do not leave product
truth only in chat.

## Before Starting A Studio Cut Slice

Run:

```bash
git status --short --branch
pnpm studio-cut:verify
```

If verification is too expensive for preflight, at least inspect the current
working tree and run the narrower command for the surface being touched.

Read the relevant docs before editing:

- product direction: `docs/studio-cut-product-mission.md`
- web cockpit: `docs/studio-cut.md`
- Rescue Sync: `docs/studio-cut-rescue-sync.md`
- worker contracts: `docs/studio-cut-cloud-sync.md`
- local render CLI: `tools/studio-cut-local/README.md`

## During The Slice

- Keep local/offline mode working.
- Do not commit secrets, `.env.production.local`, service accounts, media,
  proxies, private paths, generated renders, or real episode JSON.
- Prefer additive metadata, tombstones, checkpoints, and rollback commands over
  destructive state changes.
- Preserve the model: canonical timeline, semantic decisions, Sync Map, render
  profiles.
- Update docs in the same commit when behavior or workflow changes.
- Add or update smoke coverage when an agent-facing workflow changes.

## Before Commit

Run:

```bash
pnpm studio-cut:verify
```

Then commit a coherent slice. Good commit examples:

```text
feat(studio-cut): add episode command center
feat(studio-cut): improve rescue sync render handoff
docs(studio-cut): clarify product mission
```

## Deploy And Push

After a passing verifier:

```bash
firebase deploy --project high-ground-odyssey --only hosting
git push
```

If Firebase credentials are expired, push anyway and report:

```bash
firebase login --reauth
firebase deploy --project high-ground-odyssey --only hosting
```

Do not deploy Firestore or Storage rules unless rules tests pass and the target
is explicit.

## When To Reduce Agent Count

Use one agent for:

- schema migrations or shared domain contract rewrites
- auth/security rule changes
- release/deploy incident recovery
- cross-app package manager or lockfile work
- anything where two agents would edit the same files at the same time

Use more agents for:

- independent docs/runbooks
- separate test hardening
- worker implementation vs web UI implementation when contracts are already
  clear
- code review/audit alongside implementation

