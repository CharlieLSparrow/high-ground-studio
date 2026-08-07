# Canonical Episode edit workspace · 2026-08-07

## Outcome

Quipsly now treats the Episode collaboration space as the primary browser editing product. The existing shared cut editor is loaded at the exact Episode URL rather than presented as a separate product.

## Product contract

- Plan and collaborate: `/nests/{project}/episodes/{episode}`
- Record: `/nests/{project}/episodes/{episode}?mode=record#record`
- Edit: `/nests/{project}/episodes/{episode}?mode=edit`
- Audio: `/audio?project={project}&episode={episode}`
- Review and finish: the bound Session output workspace when one exists
- Publish: `/publishing?project={project}&episode={episode}`

The canonical editor still reads and writes the existing Episode edit branch. Its protected baseline, revisions, source identities, program decisions, notes, and provenance did not move or fork.

## Compatibility

The former `/nests/{project}/episode-editor?episode={episode}` address resolves the selected Episode under `?mode=edit`. Session and Nest links now point directly to the canonical address.

## Verification required before commit

- Quipsly typecheck.
- Focused Episode Room, editor, workspace navigation, Session handoff, and migration-route tests.
- Production Next build.
- Signed-in local browser traversal between Plan, Record, and Edit over a retained Episode.
- Confirm the edit revision and protected baseline survive the route transition.

## Next integration slice

Bring transcript selection, waveform/audio state, anchored comments, compare/revert, and finishing status into the same Episode shell. Then make native and cloud materialization jobs visible as interchangeable executors instead of separate editor destinations.
