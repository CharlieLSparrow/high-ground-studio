# Canonical project-access parity

Date: 2026-08-06

## Defect

Audio Studio could list every project for a session selected by an email-based
administration shortcut. Its episode-inventory request then used the canonical
Nest resolver and denied that same project. The first surface promised content
visibility that the content API correctly refused.

This was an authorization-policy mismatch, not an inventory or recording bug.
Making the API copy the shortcut would have widened private content access.

## Resolution

`listStudioProjectsForAccess` is now the canonical project-list decision. It
and `resolveStudioProjectAccess` use the same authorities:

- active project grants across the person's verified primary and alias emails;
- the legacy workspace owner label across those same verified emails;
- persisted application staff roles;
- the requested action (`read`, `write`, or `manage`) and its allowed project
  roles.

Email allowlists, local owner overrides, and UI-only operator shortcuts do not
grant content visibility. `listProjectsVisibleToEmail`, shared-project
summaries, Audio Studio's project picker, and direct episode inventory now meet
at this boundary. A VIEWER is listed for reads and omitted for writes; OWNER and
EDITOR behavior remains explicit.

The retired `QUIPSLY_OWNER_OVERRIDE` remains retired. No environment switch was
reintroduced.

## Retained operation

The signed-in retained coach opened:

`/audio?project=high-ground-odyssey-manuscript&episode=capture-sync-rendezvous-qa-20260805&asset=cmsfpifim000sb9xlvm2bqcn8&at=1.250&focus=access-parity-audit`

The canonical High Ground Odyssey project and episode stayed selected, four
permission-filtered sources loaded from episode inventory, and the protected
source landed at 1.249 seconds while paused. The page and inventory therefore
agreed for the same authenticated account and exact source binding.

## Verification

- Quipsly TypeScript passes.
- Project-access unit coverage passes: 4 tests.
- Audio Studio server-page regression coverage passes: 1 test. A staff session
  must still use the canonical visible-project list rather than query every
  project directly.
- Disposable PostgreSQL authorization coverage passes: 4 tests for persisted
  staff access, verified aliases/workspace ownership, VIEWER read/write
  separation, and separate-account denial.
- Five affected caller suites pass: 24 tests across Projects, Calendar,
  Quipsly core, and work tags.
- The complete default Quipsly run passes: 348 active suites and 1,800 active
  tests. Forty-two database/provider-gated suites remain intentionally skipped
  in that default run; the new database suite was enabled and passed separately.

## Remaining boundary work

Project slugs are unique only inside a workspace. The next slice established a
stable ID-plus-slug locator in the canonical resolver and Audio Studio inventory
boundary; ambiguous slug-only requests now fail closed instead of resolving by
recency. Remaining project-scoped APIs and human-facing routes still need to
carry that stable identity before multi-workspace tenancy is public.

This slice proves local retained access parity. It does not replace a fresh
rendered second-account browser attempt, production authorization readback, or
physical-iPhone source access.
