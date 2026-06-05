# Quarantined stray apps/quipsly/app directory

Quarantined during release cleanup on 2026-06-04.

Reason: Next.js detected `apps/quipsly/app/` and built only the stray root app surface instead of the real `apps/quipsly/src/app` application. This made `pnpm --filter quipsly build` appear green while emitting only `/404`.

Contents appear to be experimental Story Bible components. They should be reintroduced under `apps/quipsly/src/components/` or a real route after integration review.
