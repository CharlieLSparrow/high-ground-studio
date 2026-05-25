# Studio Cut Product Mission

Date: 2026-05-24

Studio Cut is the video wedge of the larger High Ground Content Management
Studio. The immediate goal is to make podcast/video production simple enough
that Charlie can set up an episode, Mako can edit or review from a room link,
and final outputs can be rendered without returning to Premiere.

## North Star

Charlie handles messy setup once. Studio Cut builds order from that mess. Mako
opens a link and edits. Homer can review the result. The system preserves source
truth, keeps rollback available, and turns decisions into many outputs:
YouTube, shorts, audio-only, clips, posts, and future publishing workflows.

The broader Studio should eventually support books, speeches, podcasts, travel
video, coaching material, publishing schedules, social distribution, analytics,
SEO, Patreon, merch, coaching operations, and agentic research assistance. Video
is the critical first workflow because it forces the system to solve source
preservation, semantic edits, collaboration, render projection, and rollback.

## Product Laws

- Full-resolution source media stays whole.
- Source files are never destructively cut.
- Edits are semantic decisions over canonical episode timeline time.
- `Cut` means inactive/skipped in program playback, not deletion.
- Lightweight proxies are for browser editing.
- Local render remains final truth until cloud render is intentionally built.
- Sync Map is the durable bridge from canonical timeline time to asset-local
  original media time.
- Checkpoints, JSON exports, and branch-like fix-forward paths remain safety
  hatches.
- Mako should not import JSON, manage local paths, or perform sync rituals in
  the primary workflow.

## Primary Workflow Target

The workflow we are building toward:

1. Charlie gathers episode assets in a predictable episode workspace.
2. Rescue Sync inspects media, extracts audio, builds a multi-piece reference
   rail, estimates offsets, and writes a Sync Map.
3. Rescue Sync generates aligned low-res proxies, a 2x2 source-monitor proxy,
   an Episode Manifest, and a sync report.
4. Charlie publishes the generated package into a shared Studio Cut room.
5. Mako opens the room link, signs in, sees the proxy, and edits semantic
   decisions in real time.
6. Charlie exports decisions or uses shared decision state as the handoff.
7. The local render CLI uses Sync Map plus decisions to render rough 16:9 output
   from local original or high-quality proxy assets.
8. Future render profiles turn the same decisions into 9:16, audio-only,
   highlights, and distribution packages.

## Current Working Truth

The current system already has:

- a deployed Studio Cut web editor at <https://high-ground-odyssey.web.app>
- Firebase Auth and High Ground domain allowlist
- shared rooms, realtime decisions, presence, and tombstoned cloud removes
- Rescue Sync package publishing for manifest, proxy, Sync Map, and sync report
- Sync Review, Shared Room Diagnostics, Episode Command Center, and Local Render
  Handoff panels
- local Rescue Sync worker with media inspection, audio extraction, reference
  rail assembly, waveform correlation, Sync Map generation, proxy package
  generation, and synthetic smoke coverage
- local render CLI for rough 16:9 output from Sync Map plus Studio Cut decisions
- `pnpm studio-cut:verify` as the integrated safety gate
- agentic decision-review and decision-operation commands so current Codex CLI
  agents can inspect, propose, apply, verify, and roll back semantic edits
- a one-command `agent-edit-session` pass for local Rescue Sync workspaces that
  writes a sanitized workspace index, transcript-aware review, suggested ops,
  and human-readable rationale without mutating the source decision export

The current system does not yet have:

- deployed cloud worker orchestration
- final full-resolution render quality
- drift-aware long-form final render correction
- production-trusted Firestore/Storage rules deployment for private footage
- automated publishing to YouTube, Patreon, Kindle, Audible, podcast hosts, or
  social platforms

## Near-Term Build Path

1. Make the one-folder Rescue Sync session path easy enough for real Episode 4.
2. Keep making the browser cockpit show the next operator action directly.
3. Harden shared-room package publishing and Sync Review.
4. Improve local render quality from Sync Map, starting with audio and layout
   correctness.
5. Expand agentic editing support: transcript-aware review, operation JSON
   import in the web cockpit, and assistant-visible episode workspace manifests.
6. Add cloud worker orchestration only after rules, retention, cost, and failure
   modes are explicit.
7. Use the video workflow lessons to shape the larger Content Management Studio.

## Non-Goals For The Current Sprint

- Do not rebuild Premiere as a generic nonlinear editor.
- Do not upload full-resolution originals casually.
- Do not build cloud render before local render is trustworthy.
- Do not make Mako handle JSON or local paths as the primary flow.
- Do not remove the local/offline fallback while cloud collaboration is still
  being hardened.
