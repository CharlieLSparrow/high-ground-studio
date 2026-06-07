# Quipsly video editor hardening note

Last updated: 2026-06-06

## Product rule

The video editor is the episode production cockpit. It should always answer:

- what episode/Nest am I editing,
- what clip is selected,
- what source is attached,
- whether the source is safe for preview or render,
- what the next useful action is,
- what will be saved,
- and what is still worker-gated or beta-only.

## 2026-06-06 Codex pass

Changes made:

- Added a top-level edit cockpit to `/editor` so the user sees episode state, timeline duration, imports, broken sources, selected clip, and next best moves without digging through side panels.
- Renamed the header from prototype/NLE language to `Episode Editor` and made the Nest visible.
- Fixed clip source detaching by allowing the timeline reducer to set an empty clip source.
- Fixed selected-clip source replacement to use the same DB-backed attach/sync-history path as the normal attach flow.
- Fixed co-pilot rollback for added timeline clips so rollback removes the added clip instead of trying to re-add it.
- Changed Remotion audio behavior so missing audio tracks do not render visual placeholder layers on top of video.
- Reworded the export modal from fake "render complete" language to honest render package/readiness language.

## Anti-regression rules

- Do not claim an MP4 was rendered unless a real render worker created and stored the output file.
- Do not make audio tracks create visual placeholder layers in the composition.
- Do not change clip source without an undo/sync-history path when the action is user-facing.
- Do not let imported media appear "attached" if the timeline clip only stores an internal asset id that cannot play.
- Keep the panic-proof production cockpit visible in real editing work.

## Next hardening targets

- Add a real render-job record and status surface once the render worker is ready.
- Add selected-clip source preview that clearly distinguishes playable preview, YouTube embed preview, and renderable bucket media.
- Add timeline issue filters: missing source, broken source, YouTube-only, overlaps, unsaved.
- Add a true source relink workflow that can replace all clips using the same missing source.
- Add a production-safe export preflight that blocks final render only for real blockers and never blocks normal editing.
