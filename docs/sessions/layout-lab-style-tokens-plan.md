# Layout Lab Style Tokens Plan

Date: 2026-04-28

Scope:
- inspect the current layout-lab implementation
- extract the repeated variant-specific style selections into a small shared helper layer
- preserve current behavior while reducing inline class sprawl

Repeated concerns to centralize:
- page/shell background treatments for:
  - home
  - coaching
  - library
  - docs
  - episode
- repeated panel/card treatments for:
  - standard cards
  - featured cards
  - featured badges
- repeated text/accent treatments where the same variant mapping shows up multiple times

Planned implementation:
- add a shared style helper module next to `layout-variant.ts`
- keep a small set of named token maps plus a helper for variant lookup
- update current variant-aware components to consume that shared module
- leave one-off composition/layout classes inline where abstraction would hurt readability

Constraints:
- no cookie mechanism changes
- no new routes
- no theme database storage
- no broad design-system rewrite
