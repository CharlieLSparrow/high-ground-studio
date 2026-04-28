## Published Discovery Verification Plan

Date: 2026-04-28

Scope:
- inspect the current published content tree under `apps/web/content/publish`
- inspect the curated discovery metadata in `apps/web/src/lib/site.ts` and `apps/web/src/lib/reading.ts`
- add a small repo-root verification script that reports likely mismatches without changing runtime behavior
- add a short runbook note only if the script needs an obvious operator entrypoint

Checks to perform:
- identify which published MDX files should count as canonical episode pages
- identify which published MDX files should count as canonical reading/book pages
- identify which hrefs are currently used by discovery surfaces
- compare published routes to discovery hrefs and report likely drift in a human-readable way

Constraints:
- do not refactor content loading
- do not change app behavior
- do not revisit Stripe or unrelated systems
