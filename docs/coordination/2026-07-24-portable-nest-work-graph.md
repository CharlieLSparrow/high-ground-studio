# Portable Nest work-graph checkpoint

Date: 2026-07-24

Status: implemented and operated across separately administered local environments

## Product result

Owner-controlled Nests now expose **Tools → Backup and transfer**. The
`quipsly-nest-export-v1` package contains canonical tags and aliases, Note
documents and exact anchors, actor-scoped Tasks, actor-owned Goals and progress,
Goal/Task links, and focus-block history.

Restore is preview-first, no-overwrite, deterministic, and transactionally
idempotent. Reminder and recurrence intent remain snapshots. Focus blocks
restore canceled. Sessions, media, credentials, collaborators' assignments,
provider data, and external effects remain excluded.

## Operated local proof

Signed into the rendered local app as `quipsly.qa@local.test`.

Source:

- Nest: `Quipsly Local QA Home Nest`
- Package:
  `quipsly-home-quipsly-qa-at-local-test-nest-2026-07-24.json`
- File bytes: 70,263
- File SHA-256:
  `c2294ca7f7f366a27c342956336c6d5e8051311759ebb95e90bb894ef27d145b`
- Semantic manifest:
  `a4fffd2a8893aaf4398bcd7fcba0bcc8f2dd7802ec81100420a4fb647c76d363`

Destination created through the product:
`Portable Nest recovery rehearsal 2026-07-24`.

The first rendered preview reported:

- 29 tags and 3 source aliases considered;
- 1 Note with 2 blocks;
- 4 Tasks, including 1 reminder snapshot;
- 2 Goals with 1 progress receipt;
- 2 Goal/Task links;
- 3 focus-block snapshots;
- 0 overwrites, 0 source mutations, and 0 external effects.

The real apply completed. Independent PostgreSQL readback found:

- 2 destination documents total: the rehearsal receipt plus 1 restored Note;
- 4 restored Tasks and 2 restored Goals;
- 29 canonical tags and 1 non-conflicting alias;
- the expected Goal progress and Goal/Task links;
- 3 focus blocks, all `CANCELED` with
  `restoredCanceledForSafety:true`;
- 0 `TaskReminder` rows for destination work;
- 0 destination recurrence series.

The rendered destination Work view showed both Goals, three open Tasks, one
resolved Task, the restored canonical vocabulary, and direct links to canonical
Work identities.

## Defect found by operating the app

The first retry preview exposed that two source aliases collided with canonical
tag slugs inside the same package. Apply had correctly deferred them, but the
initial planner had counted all three aliases as creates because it considered
only destination rows, not incoming canonical reservations.

The planner now simulates canonical and alias reservations across the complete
bundle. It reports one creatable alias and two deferred aliases on a clean
destination, and one reused plus two deferred aliases after restore. The
integration fixture now contains this exact cross-record collision.

After the fix, the same package was validated and applied again through the
rendered app. The plan reported:

- 0 new tags or aliases;
- 30 vocabulary routes reused;
- 0 new Notes, blocks, Tasks, Goals, progress receipts, links, or focus blocks;
- 2 aliases intentionally deferred;
- 0 overwrites, 0 source mutations, and 0 external effects.

Post-retry database counts remained exactly 2 documents, 4 Tasks, 2 Goals,
29 tags, 1 alias, 0 active reminder rows, and 0 recurrence series.

## Separately administered recovery proof

The same physical package was then restored through a second rendered Nest at
`127.0.0.1:3022`. This environment used its own Firebase Auth emulator, its own
synthetic account, its own Next build state, and an empty loopback-only
PostgreSQL container at `127.0.0.1:55432`. It did not read or copy the daily
Quipsly database.

All 25 committed migrations applied successfully and created 197 public
tables. Quipsly onboarded the synthetic account and Home Nest in that database,
then created destination Nest
`Independent Portable Recovery 2026-07-24` through the rendered product.

The first plan and Apply matched the original package boundary. The product
then reopened the restored Note and both original blocks; rendered 2 Goals,
3 open Tasks, 1 resolved Task, and all 29 canonical tags; and showed the
25-percent Goal progress receipt. The same-package retry reported:

- 0 new tags or aliases and 30 vocabulary routes reused;
- 0 new Notes, blocks, Tasks, Goals, progress, links, or focus blocks;
- 4 Tasks and 2 Goals reused;
- 2 colliding source aliases still intentionally deferred;
- 0 overwrites, 0 source mutations, and 0 external effects.

Independent second-database readback after retry found 1 restored Note with
2 blocks, 29 tags, 1 alias, 4 Tasks, 2 Goals, 1 progress receipt, 2 Goal/Task
links, 3 focus blocks all `CANCELED`, 0 reminders, and 0 recurrence series.

The recovery lane is now reproducible through
`pnpm quipsly:recovery-lab:up|doctor|down`. Its services survive the invoking
shell, the doctor binds evidence to an exact committed SHA and rejects a dirty
worktree, and shutdown removes only exact labeled lab jobs and the disposable
database. The canonical Nest, Auth emulator, and PostgreSQL remained healthy
through the lifecycle test.

## Verification

- Quipsly TypeScript check passed.
- Manifest validator, route, and authorization tests passed 11/11.
- Rendered owner-control tests passed 2/2.
- Disposable real-PostgreSQL export/restore integration passed 1/1, including
  collaborator exclusion, tag versioning, intra-package alias deferral, exact
  note anchor, reminders, progress, links, canceled focus history, a
  destination-owner tag edit that retry preserved, double apply, and
  independent readback.
- The complete Quipsly run passed 136 suites / 651 runnable tests with 26 suites
  / 71 tests deliberately skipped.
- All 22 tracked TypeScript projects passed the repository-pinned TypeScript
  7.0.2 authority.
- `pnpm quipsly:release:local`, with the explicit local database target, passed
  every contract, coaching/capture schema readiness, and both production web
  builds, reporting `LOCAL SOURCE READY`.
- The operated local browser completed download, validate, apply, Work
  inspection, retry validate, retry apply, and persistence readback.

## Remaining boundary

This closes local second-environment disaster recovery for the included Nest
knowledge-work graph. It does not close production deployment/readback,
physical iPhone, TestFlight-installed workflow, real HGO/coaching completion,
Missing Compliance authorization, media/provider recovery, or App Store
submission.
