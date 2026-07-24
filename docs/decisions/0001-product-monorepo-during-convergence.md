# ADR 0001: Retain a product monorepo during convergence

- Status: accepted
- Date: 2026-07-23
- Owners: repository maintainers

## Context

Capture, Nest, shared document semantics, Prisma migrations, Studio, HGO web,
and large generated assets accumulated without enforced operational
boundaries. The checkout and release pipeline became expensive and ambiguous.
An immediate source split would move the ambiguity into several repositories
without first creating versioned contracts or clean release ownership.

## Decision

Keep Capture, Nest, their shared Quipsly contracts, and the shared schema in one
product monorepo during convergence. Enforce surface-aware CI, exact-commit
release contexts, binary budgets, and independent runtime/delivery proof.

Stage later extraction by product ownership:

1. asset production and unsupported prototypes;
2. native Studio after its handoff contract is stable;
3. HGO web after it consumes versioned Quipsly contracts;
4. Capture and Nest only if they eventually gain independent owners and release
   cadences.

## Alternatives considered

- Immediate split by top-level app: rejected because shared contracts and
  active WIP are not yet versioned or cleanly owned.
- Keep one undifferentiated pipeline: rejected because unrelated changes
  trigger expensive builds and deploy risk.
- Rewrite Git history now: rejected while unreconciled work and release work
  still depend on current history.

## Consequences

- Cross-surface product contracts can change atomically.
- CI and release tooling must maintain an explicit ownership map.
- The repository remains larger than the steady-state target during migration.
- Binary originals and generated evidence need external storage.
- A future split is gated by independent ownership, versioned APIs, clean local
  setup, and verified history extraction.

## Migration and rollback

The approach is incremental. Each guardrail is independently reversible from
Git. The pre-cleanup asset state remains reachable at commit `f04cc42`.
Repository extraction requires a separate backed-up migration plan and does not
block TestFlight or Cloud Run delivery.

## Proof

- changed-surface planner unit tests;
- Capture-only CI on a pinned macOS/iOS toolchain;
- exact-commit Nest release context;
- binary asset budget in every pull request;
- clean-context Nest typecheck and production build;
- physical-device and TestFlight proof remain distinct release gates.

## References

- [Product and repository map](../architecture/product-and-repository-map.md)
- [Repository and release boundaries](../architecture/repository-and-release-boundaries-2026-07-23.md)
- [Repository and pipeline recovery](../plans/repository-pipeline-recovery-2026-07-23.md)
