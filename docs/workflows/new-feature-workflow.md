# New Feature Workflow

Use this before implementing a non-trivial feature in this repo.

## 1. Reconfirm Current State

Read:
- `docs/project-context/current-state.md`
- relevant `docs/sessions/*.md`

Do not assume a feature path is active just because partial code exists.

Examples in this repo:
- cart UI exists, but commerce flow is not active
- coaching page exists, but Stripe checkout is intentionally rolled back
- episodes route exists, but Fumadocs loading is guarded

## 2. Identify The Real Ownership Boundary

Pick the narrowest area that owns the change:
- auth/session
- Prisma schema
- team server actions
- dashboard UI
- content metadata
- episodes loader/content route
- motion engine

Avoid cross-cutting refactors unless the task truly requires them.

## 3. Check Build And Verification Path First

Before changing code:

```bash
pnpm --filter web build
```

and:

```bash
pnpm --filter web exec next build --webpack
```

If the task involves the episodes/content path, also review:
- `docs/sessions/episodes-build-investigation-result.md`
- `docs/sessions/episodes-loader-guard-result.md`

## 4. Write A Short Session Plan

For medium or larger tasks, add a short note under `docs/sessions/` before editing.

That plan should state:
- scope
- what is being verified
- what files are expected to change

## 5. Implement Narrowly

Current repo preference:
- use existing route/page/server-action patterns
- keep Prisma writes explicit
- preserve the public coaching page’s non-checkout posture unless commercialization is the actual task

## 6. Verify And Promote Knowledge

After the change:
- rerun the smallest relevant build/verification step
- update durable docs if the repo’s working assumptions changed
