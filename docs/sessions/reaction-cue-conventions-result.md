# Reaction Cue Conventions Result

## Files changed
- `docs/architecture/living-manuscript-conventions.md`
- `docs/analysis/living-manuscript-viewer-implementation-plan.md`
- `docs/sessions/reaction-cue-conventions-result.md`

## Convention added
- Added a `Reaction Cue Rules` section to the living manuscript conventions.
- Documented the inline `[[REACTION: ...]]` format for draft and production cues.
- Clarified intended uses such as `draft-only`, `social`, `show-note`, and `clip-candidate`.
- Added a future viewer note describing how reaction cues could later appear as collapsible or filterable production notes.

## What was intentionally not done
- No manuscript prose was modified.
- No app code was modified.
- No Prisma schema was modified.
- No publish episode files were modified.
- No generation logic or parsing logic was added.

## Recommended next action
- Start using the `[[REACTION: ...]]` convention in episode breakdowns and other draft/intake layers before introducing it into the living manuscript or viewer parsing logic.
