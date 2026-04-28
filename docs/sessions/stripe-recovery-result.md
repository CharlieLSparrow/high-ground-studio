# Stripe Recovery Result

Date: 2026-04-27

Completed Stripe/coaching recovery work:
- Removed the misplaced Next.js route at `apps/web/src/app/api/auth/[...nextauth]/stripe/checkout/route.ts`.
- Removed orphaned Stripe helper files that were only tied to the partial checkout attempt:
  - `apps/web/src/lib/stripe.ts`
  - `apps/web/src/lib/coaching_offers.ts`
- Removed the unused `stripe` dependency from `apps/web/package.json`.
- Updated `pnpm-lock.yaml` to match the package manifest after removing `stripe`.
- Added session notes for this recovery pass:
  - `docs/sessions/stripe-recovery-plan.md`
  - `docs/sessions/stripe-recovery-result.md`

Stripe-related build issue resolved:
- The build-blocking invalid route was caused by nesting `stripe/checkout` under `apps/web/src/app/api/auth/[...nextauth]`.
- That violated Next.js catch-all route rules and produced:
  `Catch-all must be the last part of the URL in route "/api/auth/[...nextauth]/stripe/checkout".`
- Removing that misplaced route resolves the Stripe-specific build failure.

Remaining build issue that appears unrelated to Stripe:
- After the Stripe route fix, the production build no longer fails on the auth/Stripe route tree.
- A separate build problem remains around the `episodes` content pipeline:
  - the webpack build reports `fumadocs-mdx:collections/server` scheme handling failures
  - the default Turbopack build appears to stall during compile after the Stripe error is removed
- This remaining issue is tied to the MDX/Fumadocs episode content system, not the coaching/Stripe files changed in this recovery.

Why the episodes/MDX issue should be a separate task:
- It affects the content/documentation pipeline rather than the coaching checkout transition.
- Fixing it safely likely requires decisions about the `episodes` route, `src/lib/source.ts`, Fumadocs integration, and possibly Next.js build configuration.
- That is a different slice of the app with a different blast radius than the Stripe recovery scope requested here.

Recommended next steps after this recovery:
1. Open a separate task for the `episodes` / Fumadocs / MDX production build issue.
2. Decide whether the repo should stay on the current Next.js production build path or pin versions/config for the content pipeline.
3. Revisit Stripe checkout only after the content build path is stable again.
