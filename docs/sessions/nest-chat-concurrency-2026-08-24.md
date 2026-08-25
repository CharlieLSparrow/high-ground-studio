# Nest chat first-load concurrency proof — 2026-08-24

## Product risk

Two collaborators opening a previously unused Session thread at the same time could both enter Prisma's emulated `upsert` create path. PostgreSQL correctly rejected the losing insert with `P2002` on `(projectId, key)`, but the request surfaced as a failed chat load. Parallel empty-thread loads could also create duplicate Quipsly seed messages.

## Production behavior

- Resolve the canonical `(projectId, key)` row before mutation.
- On a missing row, use PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` through Prisma `createMany({ skipDuplicates: true })`, then read the canonical row back.
- Preserve an explicit source-card title through a narrow update after canonical readback.
- Give the system seed a deterministic identity derived from the canonical thread ID and insert it with the same conflict-safe primitive.
- Verify a skipped seed insert belongs to the exact project and thread rather than suppressing an unrelated identity collision.
- Restrict legacy seed normalization to the one loaded thread and only rows whose visible seed content differs, avoiding project-wide rewrites on every chat load.

No schema migration or tenant-boundary change is required.

## Evidence

Focused route tests:

```text
Test Suites: 1 passed, 1 total
Tests:       17 passed, 17 total
```

Real local PostgreSQL integration, including twelve simultaneous first loads:

```text
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

The integration asserts exactly one `StudioNestChatThread` and exactly one `ted-lasso-believe` seed message after all twelve responses return HTTP 200. The run emitted no expected-conflict Prisma errors after the conflict-safe insert path replaced exception-based convergence.

Quipsly application typecheck:

```text
next typegen && tsc --noEmit --incremental false
Types generated successfully
```

## Deferred evidence

This proves database convergence and request success locally. It does not replace a two-device observation of both participants opening the same new Session thread, which remains useful human validation but is not a blocker for unrelated product work.
