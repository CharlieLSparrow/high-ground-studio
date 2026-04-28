# Dashboard Settings Feedback Plan

Date: 2026-04-28

Scope:
- inspect the current `/dashboard/settings` page and server action
- add a small explicit feedback mechanism after preference saves
- keep the implementation aligned with the repo’s existing server-action/query-param pattern

Current repo facts:
- `/dashboard/settings` already reads `newsletterOptIn` and `announcementsOptIn` from `User`
- updates already happen through a server action
- team pages already use:
  - redirect-on-submit
  - `success` / `error` query params
  - a small inline status message

Planned implementation:
- update the settings action to redirect back to `/dashboard/settings` with:
  - `success=...` on save
  - `error=...` on failure
- update the settings page to read `searchParams`
- render a lightweight inline status panel using the existing visual approach

Constraints:
- no account-center expansion
- no billing or avatar work
- no auth model changes
- no Stripe, appointments, memberships, or scheduling changes
