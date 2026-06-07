# Quipsly iPad and iPhone Workflow

## Product direction

Quipsly mobile should not be a squeezed web editor.

- iPad is a production studio: manuscript center, media/sync/editor tools nearby,
  inspector on the side, strong keyboard/pointer support, and a calm command rail.
- iPhone is a session companion: manuscript first, clip cue visible, local audio
  capture reliable, uploads resilient, and controls reachable by thumb.

## Borrowed control ideas worth adapting

We should borrow patterns, not product identity:

- Three-pane editor structure on iPad: library/sidebar, work canvas, inspector.
- Bottom or floating transport controls for play/record/scrub actions.
- Inline media cards inside the writing surface.
- Inspector panels for selected clip, tags, outline, and sync.
- Focus mode that hides everything except the current block and cue.
- Horizontal quick-action rails for touch-first workflows.
- Persistent transport controls for play, scrub, record, and mark-break actions.
- Keyboard shortcuts on iPad/Catalyst for play, step, record, and break markers.
- Explicit upload/network status so creators trust capture sessions.

## Quipsly-specific rule

The living document remains the spine. Mobile controls should attach to the
document, not create a separate mobile-only project shape.

## Current implementation

The existing `HighGroundCapture` app now opens through
`AdaptiveQuipslyMobileShell`:

- iPad and regular-width layouts use `IPadQuipslyStudioView`.
- iPhone and compact layouts use `IPhoneQuipslySessionView`.
- Existing native pieces remain available:
  - `NativeEditorView`
  - `NativePublishingView`
  - `UploadManager`
  - timeline/reframing models

## Next build steps

1. Replace sample manuscript blocks with data loaded from Nest.
2. Wire record buttons to `AudioCaptureController`.
3. Render real clip cue embeds from the episode production payload.
4. Persist mobile actions back to the same document/tag/media spine.
5. Add pointer/keyboard shortcuts on iPad for editor actions.
6. Add iPhone lock-screen/background capture affordances after basic flow is stable.
