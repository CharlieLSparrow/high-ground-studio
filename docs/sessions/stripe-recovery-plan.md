# Stripe Recovery Plan

Date: 2026-04-27

Scope:
- Stabilize the current Stripe/coaching transition without redesigning unrelated app areas.
- Restore a valid Next.js route tree and get `pnpm --filter web build` passing.

Observed issues before changes:
- `apps/web/src/app/api/auth/[...nextauth]/stripe/checkout/route.ts` is nested under the NextAuth catch-all route, which causes the current build failure.
- That misplaced file duplicates the coaching offer UI and posts to `/api/stripe/checkout`, but no `apps/web/src/app/api/stripe/checkout/route.ts` exists.
- `apps/web/src/lib/stripe.ts` and `apps/web/src/lib/coaching_offers.ts` appear to be leftovers from a partial Stripe checkout implementation and are not referenced by any active route.
- `apps/web/package.json` and `pnpm-lock.yaml` still include `stripe`, even though the live coaching flow currently builds around a non-checkout path.

Recovery steps:
1. Remove the invalid nested Stripe checkout route from the NextAuth catch-all subtree.
2. Remove orphaned Stripe helper files if they are not part of a working route.
3. Sync `apps/web/package.json` and `pnpm-lock.yaml` to the stabilized code state.
4. Re-run the web build and record the result plus the remaining next steps.
