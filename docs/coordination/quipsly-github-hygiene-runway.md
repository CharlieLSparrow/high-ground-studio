# Quipsly GitHub hygiene runway

Date: 2026-06-14
Status: working cleanup guidance

## Purpose

This repo currently contains a large, valuable, messy amount of WIP. The goal is not to make `git status` look clean by throwing work away. The goal is to make the work legible enough to checkpoint safely and continue fast.

## Current cleanup rule

Do not delete, revert, or overwrite unknown changes.

Classify first:

- product-critical WIP;
- generated artifacts;
- diagnostics/test outputs;
- AG/Marginalia reports;
- docs/process doctrine;
- deploy/auth infrastructure;
- native editor experiments;
- web/Nest application changes;
- public-site/publishing changes.

## Obvious generated artifacts

The root `.gitignore` now excludes common generated local artifacts:

- app bundles;
- Xcode result/user-state files;
- SwiftPM/Xcode local build state;
- Mac test exports;
- Quipsly Playwright/test output;
- temporary TypeScript output;
- ad hoc debug scripts that should not be committed as source.

This does not delete existing files. It only prevents accidental future staging.

## Recommended commit slicing

When ready to checkpoint, prefer small, intentional commits by lane.

Suggested order:

1. `docs: add Quipsly runway and AI-native delivery doctrine`
2. `chore: tighten generated artifact ignores and PR template`
3. `docs: reconcile native editor source-decision architecture`
4. `feat(native-editor): choose survivor and prove source-lane shell`
5. `feat(native-editor): load Episode 1 source/decision packet`
6. `feat(web): stabilize Nest/project/publishing support for HGO`
7. `feat(publishing): publish/update HGO episode pages`
8. `feat(capture): model Episode 4 break-aware source segments`

Do not combine native editor surgery, auth changes, publishing changes, and QuipLore features into one heroic commit unless there is no alternative. Hero commits are where dragons file taxes.

## GitHub PR expectations

Use `.github/PULL_REQUEST_TEMPLATE.md`.

Every PR should identify:

- product intent;
- source truth;
- proof path;
- risk seams;
- docs updated;
- reviewer focus.

If a PR cannot explain source truth and proof path, it is not ready.

## Branch/PR strategy

Until real users depend on the app, architecture correction is allowed. Backwards compatibility should not preserve wrong models.

Still, preserve traceability:

- create checkpoints before risky refactors;
- keep migration notes near schema/model changes;
- cite the coordination doc that defines the intent;
- avoid squash-merging away useful rescue context until the system stabilizes.

## Agent handoff standard

Before handing work to another agent, include:

- exact app/root path;
- exact files expected to change;
- source truth invariant;
- acceptance tests/proof path;
- non-goals;
- where to report back.

Bad prompt:

```text
Make the editor better.
```

Good prompt:

```text
In apps/<chosen-native-editor>, implement the visible source-lane shell. Preserve whole sources plus edit decisions. Do not introduce chopped clip truth. Prove placeholder media can scrub source monitors and program output. Report in docs/coordination/antigravity-reports/video-editor.md.
```

## Morning status questions

Ask these before coding:

1. Which native editor root is active today?
2. What is the one proof target?
3. What source truth must not be violated?
4. What can be safely ignored for this pass?
5. What will count as real proof?

## Current strategic commit target

The next friendly-world checkpoint should make the repo say:

```text
Quipsly is building Episode Spine MVP.
Episodes 1-3 are the first proof.
Episode 4 is the stress test.
The native editor must preserve source lanes and edit decisions.
The repo has a documented cleanup and proof process.
```
