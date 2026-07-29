# Quipsly Studio Source Map and Change Discipline

This document is a trail map, not a cage. Quipsly Studio can and should change structure when the product needs it, but every structural move should be intentional, visible, and based on the current repo truth.

## Current active surface

- Active app: `apps/QuipslyStudio`
- Active build path: `apps/QuipslyStudio/script/build_and_run.sh --verify`
- Active control path: `apps/QuipslyStudio/script/agentctl.sh`
- Native UI surface: `apps/QuipslyStudio/Sources/SharedUI`
- Core edit/playback/export logic: `apps/QuipslyStudio/Sources/QuipslyVideoCore`
- Studio docs and production logs: `apps/QuipslyStudio/docs/quipsly`

## Source-map rule

Folder paths are not sacred. Product truth is sacred. If the source layout changes, update this map or the relevant runbook in the same pass so future agents do not follow stale paths.

## Change discipline

Before moving, replacing, or deprecating a major surface, record:

1. What is changing.
2. Why the old shape is hurting the product.
3. What becomes the new active path.
4. What evidence proves the new path works.
5. What is intentionally quarantined, parked, or deleted.

## Stale-path handling

When an old instruction points at a missing path, do not blindly recreate it and do not assume the latest visible file is correct. Locate the live build/script/UI/model path, update the source map, and leave a short note explaining the drift.

## Rabbit-hole guardrail

A rabbit hole is work that follows an old path, prototype, or naming habit without proving it still serves the current product. The antidote is not rigidity. The antidote is current evidence plus explicit intent.
