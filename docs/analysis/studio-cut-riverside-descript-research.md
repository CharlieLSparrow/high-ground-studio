# Studio Cut Research: Riverside and Descript

Date: 2026-05-25

This brief records a current product research pass on Riverside and Descript so
Studio Cut can build useful internal equivalents without cloning another
company's interface, branding, copy, or proprietary implementation. Treat the
word "parity" here as "solve the same user job in a Studio Cut-native way."

Studio Cut's advantage should stay clear:

- source media stays whole
- browser editing uses lightweight proxy packages
- decisions stay semantic and reversible
- Sync Map connects canonical episode time back to original assets
- local render remains final truth until cloud render is intentionally designed
- agentic editing should be transparent, inspectable, and rollback-friendly

## Sources Reviewed

Primary sources used for this pass:

- Riverside video editor product page:
  <https://riverside.com/video-editor>
- Riverside editor overview:
  <https://support.riverside.com/hc/en-us/articles/16673658517277-Riverside-editor-Overview>
- Riverside Magic Clips overview:
  <https://support.riverside.com/hc/en-us/articles/12124048765981-About-Magic-Clips>
- Riverside recording file formats:
  <https://support.riverside.com/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview>
- Riverside track upload overview:
  <https://support.riverside.com/hc/en-us/articles/5456549636253-Track-file-uploading-Overview>
- Riverside producer role:
  <https://support.riverside.com/hc/en-us/articles/5252621451805-The-producer-role-Details>
- Riverside teleprompter overview:
  <https://support.riverside.com/hc/en-us/articles/5434132515357-Studio-Teleprompter-Overview>
- Riverside Spotify publishing:
  <https://support.riverside.com/hc/en-us/articles/16677194078109-Publish-my-episode-to-Spotify>
- Riverside video episode hosting:
  <https://support.riverside.com/hc/en-us/articles/33826248198941-Hosting-How-do-I-publish-my-podcast-s-video-episodes>
- Descript tools page:
  <https://www.descript.com/tools>
- Descript Underlord product page:
  <https://www.descript.com/underlord>
- Descript Underlord help page:
  <https://help.descript.com/hc/en-us/articles/36803785502221-Underlord-beta-Your-AI-co-editor-in-Descript>
- Descript export and publishing overview:
  <https://help.descript.com/hc/en-us/articles/10255819601037-Export-and-publishing-overview>
- Descript scenes overview:
  <https://help.descript.com/hc/en-us/articles/10248939749517-Scenes-overview>
- Descript timeline overview:
  <https://help.descript.com/hc/en-us/articles/10249275208717-Timeline-overview-classic>
- Descript wordbar:
  <https://help.descript.com/hc/en-us/articles/10249346632717-The-wordbar>
- Descript filler words:
  <https://help.descript.com/hc/en-us/articles/10164806394509-Filler-words>
- Descript word gaps:
  <https://help.descript.com/hc/en-us/articles/17460915431053-Edit-word-gaps-in-your-script>
- Descript transcript correction:
  <https://help.descript.com/hc/en-us/articles/10119613609229-Correcting-your-transcript>
- Descript Rooms getting started:
  <https://help.descript.com/hc/en-us/articles/28800967976205-Get-Started-with-Descript-Rooms>
- Descript Rooms recording:
  <https://help.descript.com/hc/en-us/articles/30293765617549-Recording-in-a-Descript-Room>
- Descript audio podcast workflow:
  <https://help.descript.com/hc/en-us/articles/10601764003341-Record-edit-and-export-your-audio-podcast>

## Riverside Feature Inventory

### Recording and Asset Intake

Riverside is built around browser/mobile remote recording, local
high-quality participant tracks, cloud backup tracks, separate audio/video
downloads, and upload recovery when local tracks are incomplete. It also has
studio roles such as host, guest, producer, and backstage/live controls.

Studio Cut analogue:

- Cloud Sync Intake is the right lane for this problem.
- Keep the current "messy assets in, Sync Map out" model.
- Add visible upload/recovery status per asset, similar to a track upload
  dashboard, but focused on Charlie's episode package rather than guests.
- Treat "producer" as an internal operator/reviewer role later: someone can
  monitor room state, comment, and request fixes without becoming a recorded
  source.

Implementation implications:

- `studioCutSyncJobs/{syncJobId}` remains the correct cloud job root.
- Uploaded inputs should always be typed by role and preserve `inputId`.
- Add upload health states: `selected`, `uploading`, `uploaded`, `inspected`,
  `ready_for_sync`, `failed`.
- Add resumable upload support before encouraging full private uploads.
- Preserve local recovery path: local worker can still run from a predictable
  episode folder.

### Studio Controls

Riverside's recording studio includes producer controls, media board, screen
share/presentation, chat, teleprompter/scripts, layout controls, live stream
features, and studio branding.

Studio Cut analogue:

- Do not build live recording yet unless the current sync/edit/render spine is
  stable.
- Build a lightweight "Episode Setup Board" first:
  - assets checklist
  - script/show notes
  - reference links
  - host/guest metadata
  - planned clip moments
  - reusable episode templates
- Later, the same board can become a recording room operator console.

Implementation implications:

- Add a `studioCutEpisodes/{episodeId}/prep` or equivalent metadata model only
  after deciding whether it belongs in the larger Content Management Studio.
- For Studio Cut web now, add script/notes as room metadata or a lane in the
  shared editor before building real-time recording.

### Editing

Riverside's editor emphasizes:

- text-based editing from transcript
- timeline zoom, trim, split, and cut refinement
- transcript correction, participant rename, search
- moving or removing media by text selection
- silence/pause/filler removal
- comments
- layouts, captions, brand kit, background frames, logos
- AI tools for clips, audio cleanup, smart mute, smart layouts, eye contact,
  show notes, hooks, posts, and episode assists

Studio Cut analogue:

- Studio Cut should remain semantic, not destructive.
- Transcript selections should create or refine decision events:
  - mark selection as `Cut`
  - mark selection as `Charlie`, `Homer`, `Both`, or clip layouts
  - create markers/comments
  - generate render-profile suggestions
- Timeline controls should operate on semantic boundaries, markers, and spans.
- "Remove filler words" becomes "propose Cut spans with confidence" first.
- "Smart layout" becomes "propose ProgramState changes with rationale."

Implementation implications:

- Add a transcript model tied to canonical episode time:
  - word/phrase ids
  - speaker
  - start/end ms
  - confidence
  - corrected text
  - decision links
- Add agent operation JSON for transcript-derived edits:
  - `add_decision`
  - `retime_decision`
  - `tombstone_decision`
  - `add_marker`
  - `add_comment`
  - `create_clip_candidate`
- Keep all AI edits as proposals or reversible operations with checkpoints.

### Clips and Social Repurposing

Riverside Magic Clips identifies highlights from recordings/uploads, scores
clips, adds pacing, captions, and optional audio backgrounds, then supports
customization, download, and social sharing. Riverside's marketing surface also
frames clips as part of a broader AI Co-Creator flow with posts, thumbnails,
show notes, and full episode assists.

Studio Cut analogue:

- Build "Clip Candidates" from transcript, comments, markers, and agent review.
- Store clips as semantic ranges on canonical episode time, not rendered files.
- Let render profiles produce:
  - YouTube Shorts 9:16
  - Instagram/TikTok 9:16
  - square or 4:5 social variants
  - audio teaser
  - quote card
- Score candidates with explainable reasons:
  - topic clarity
  - emotional peak
  - standalone context
  - clean start/end
  - visual source availability

Implementation implications:

- Add `ClipCandidate` schema.
- Add a `clips` lane in the editor with statuses:
  `suggested`, `approved`, `rendered`, `published`, `rejected`.
- Add "make clips from markers/comments/transcript" agent command.

### Publishing

Riverside supports export/download of edits and clips, direct publish flows into
Spotify for Creators, YouTube-oriented paths, hosting support, show metadata,
and platform-specific video limitations.

Studio Cut analogue:

- Publishing should be a separate package/output layer, not part of core
  editing.
- First build "Publish Package" export:
  - final 16:9 render path
  - audio-only render path
  - clips list
  - title candidates
  - description
  - show notes
  - chapters
  - thumbnails/cover images
  - captions/subtitles
  - platform checklist
- Direct platform APIs should come later, after local rendering and review are
  trustworthy.

Implementation implications:

- Add `PublicationPlan` and `DistributionTarget` later.
- Keep YouTube/Spotify/Patreon/Audible/Kindle credentials out of the repo.
- Build dry-run publishing manifests before any direct publish buttons.

## Descript Feature Inventory

### Text-Based Editing Model

Descript's core UX is "edit media like a doc." The transcript/script is the
primary editing surface, with timeline and canvas available for precision.
Transcript correction can avoid changing media, while script edits can affect
aligned audio/video. The wordbar shows word-level alignment and supports word
boundary adjustments and gap edits.

Studio Cut analogue:

- Studio Cut should not make the transcript the only source of truth.
- The source of truth should be:
  - Sync Map
  - canonical episode timeline
  - transcript/time-aligned blocks
  - semantic decisions
- Text editing should create or refine semantic operations, not silently destroy
  media.

Implementation implications:

- Add a transcript lane beside the decision timeline.
- Word selections map to source/canonical time ranges.
- Text corrections are annotations, separate from audio edits.
- "Delete text" should become "propose Cut decision over that word range."

### Scenes, Layouts, Canvas, and Timeline

Descript's scene model treats visual changes like presentation slides: script,
timeline, scene thumbnails/storyboard, layers, layouts, transitions, and visual
properties coordinate around scene boundaries.

Studio Cut analogue:

- ProgramState is already a scene-like semantic layer.
- Studio Cut should add "Scene/Beat" metadata on top of decision segments:
  - topic
  - visual intent
  - active sources
  - b-roll/clip needs
  - render profile overrides
- Do not introduce freeform layer editing until decision editing and render
  profiles are stable.

Implementation implications:

- Add `StoryBeat` or `SceneMarker` later.
- Keep ProgramState as the default layout selector.
- Render profiles translate semantic state into layout/crop/effects per output.

### AI Editing

Descript positions Underlord as an agentic co-editor that can understand script
and video, suggest edits, apply changes, create clips, add captions, alter
layout, add stock media, create trailers, hide jump cuts, translate captions,
adjust sound, and work from high-level prompts.

Studio Cut analogue:

- This is strategically important. Studio Cut should be built to let Codex-like
  agents inspect an episode and propose operations today.
- The agent should never perform opaque destructive edits.
- Agent output should be:
  - structured operation JSON
  - confidence and rationale
  - before/after render preview
  - checkpoints and rollback commands

Implementation implications:

- Continue the current `agent-edit-session` direction.
- Add browser import/apply for agent decision operations.
- Add "Agent Suggestions" panel:
  - review proposed Cuts
  - review clip candidates
  - review layout changes
  - apply selected suggestions
  - export/revert checkpoint
- Add visual packets for agents:
  - contact sheets
  - low-res loop clips
  - transcript excerpts
  - waveform/energy summaries
  - render QA frames

### Cleanup and Audio Enhancement

Descript's visible cleanup toolset includes Studio Sound, filler word removal,
shorten word gaps, clarity edits, retake removal, and speech regeneration.
Several tools offer review flows and safety options because aggressive cleanup
can produce harsh cuts.

Studio Cut analogue:

- Start with analysis and proposed semantic edits:
  - filler words -> optional Cut or "smooth gap" proposals
  - long silences -> Cut proposals
  - cross-talk -> source/layout warnings
  - low-quality audio -> local render FX recommendation
- Apply actual audio cleanup in local render profiles, not the web decision
  layer.

Implementation implications:

- Add `QualityIssue` and `SuggestedEdit` records.
- Store "why" and "confidence" with proposals.
- Preserve original transcript/audio; never force cleanup without preview.

### Recording Rooms

Descript Rooms is a browser recording environment with host/co-host/producer
style roles, screen sharing, teleprompter, live captions, upload status,
recording limits, project handoff, and separate participant tracks.

Studio Cut analogue:

- This is long-term. Studio Cut can become our Riverside-like recorder, but the
  fastest current value is import/sync/edit/render.
- Build recording only after:
  - cloud sync intake is secure and reliable
  - proxy generation works for real episodes
  - local render output is trusted
  - shared rooms are stable

Implementation implications:

- Future recording service should produce the same asset intake format as
  Rescue Sync, so recorded sessions and uploaded external assets use one
  pipeline.

### Export and Publishing

Descript supports export to video, audio, GIF, text, subtitles, non-destructive
timeline exports for other editors, standalone web pages with embeddable player,
and direct publishing integrations including YouTube and podcast hosts.

Studio Cut analogue:

- Build export artifacts before direct publish:
  - render plan JSON
  - decision JSON
  - Sync Map
  - captions
  - transcript
  - show notes
  - metadata
  - platform checklist
- Later add direct publishing connectors behind env/secret-gated integrations.

## UI And UX Patterns To Borrow Carefully

Use these patterns as product lessons, not visual copies.

### Recording/Setup UX

Common pattern:

- a guided session/project setup
- track-specific readiness and upload status
- clear roles for host/guest/producer
- visible recovery paths when uploads fail

Studio Cut priority:

- make Cloud Sync Intake feel like a control checklist
- show exactly what is missing
- show what will happen next
- show "Mako can join when..." readiness

### Editor UX

Common pattern:

- transcript/script as fast navigation
- video canvas/program preview as confidence check
- timeline as precision layer
- side panels for properties, AI tools, captions, layout, comments
- export/share in the top-level workflow

Studio Cut priority:

- keep current four-pane source monitor and program preview
- add transcript lane and agent suggestions without hiding decision events
- keep decision timeline and current segment visible
- make "semantic state from here" actions faster than manual trimming

### AI UX

Common pattern:

- AI generates candidates but users can customize/export
- product language emphasizes speed and confidence
- advanced operations are packaged as simple user jobs:
  "remove filler words", "make clips", "create show notes"

Studio Cut priority:

- agent runs should always produce inspectable artifacts:
  operation JSON, rationale, warnings, previews, rollback
- the UI should expose "review/apply agent suggestions" instead of "trust me"

### Publishing UX

Common pattern:

- edit first
- generate clips/show notes/captions
- choose destination
- export or publish

Studio Cut priority:

- build one "Episode Output Board" with render, clips, captions, show notes,
  and platform metadata before adding direct integrations.

## Implementation Architecture For Studio Cut Parity

### Existing Pieces To Preserve

- `DecisionEvent`: semantic state at canonical time
- `DerivedSegment`: state spans until next decision
- `EpisodeManifest`: browser editing package
- `SyncMap`: durable bridge to original media
- Rescue Sync worker: inspection, extraction, reference rail, correlation,
  proxy package generation
- shared room metadata: manifest/proxy/Sync Map/report for browser editing
- local render CLI: turns decisions and Sync Map into output
- agent edit session tools: analyze/propose/apply/verify

### New Domain Objects To Add

These should be designed before adding major UI:

- `TranscriptDocument`
  - episode/room id
  - language
  - speakers
  - word or phrase blocks with start/end ms
  - confidence
  - corrected text history
- `SuggestedEdit`
  - source: agent, transcript tool, silence detector, human
  - operation type
  - range
  - rationale
  - confidence
  - status
- `ClipCandidate`
  - range
  - title/summary
  - score and scoring reasons
  - render profiles
  - approval state
- `PublicationPlan`
  - outputs
  - platform targets
  - metadata
  - captions/subtitles
  - thumbnails
  - status
- `StudioRole`
  - owner/operator/editor/reviewer/producer
  - room permissions

### Key Technical Workstreams

1. Transcript import/generation and time alignment.
2. Transcript-to-decision operations.
3. Agent suggestion lifecycle.
4. Clip candidate model and render profiles.
5. Episode Output Board.
6. Upload/resume/recovery UX for asset intake.
7. Direct publishing connectors later.
8. Recording room later.

## Priority Plan

### P0: Episode 4 Usability And Agent-Ready Editing

Goal: make current Studio Cut faster than Premiere for the immediate podcast
workflow.

Build next:

1. Transcript lane for existing generated/local transcripts.
2. Text selection -> create semantic decisions.
3. Import/apply agent operation JSON in the web editor.
4. Agent Suggestions panel with rationale, warnings, and selective apply.
5. ClipCandidate schema and manual clip candidate creation from markers/ranges.
6. Episode Output Board v0: decisions, render command, checkpoint, clip list,
   show note draft placeholder.

Why first:

- This compounds current Studio Cut work.
- It helps Charlie tag faster before full cloud sync is perfect.
- It makes Codex more useful as a transparent editing assistant.

### P1: Riverside-Like Shared Setup Without Recording

Goal: Charlie uploads or points Studio Cut at raw assets, gets a room link, and
Mako edits without files or JSON.

Build next:

1. Cloud Sync Intake readiness dashboard.
2. Resumable upload progress per role.
3. Sync job status timeline:
   `draft -> uploading -> uploaded -> inspected -> syncing -> package_ready -> room_published`.
4. One-click "Publish Generated Package" from worker outputs.
5. Room share and diagnostics hardening.
6. Clear failure/recovery instructions for missing or partial assets.

Why second:

- It makes the primary workflow link-first for Mako.
- It keeps heavy technical sync work visible and operator-friendly.

### P1: Descript-Like Transcript And Cleanup

Goal: text becomes a fast editing layer without replacing semantic decisions.

Build next:

1. Transcript correction annotations.
2. Word/phrase range selection tied to canonical time.
3. Remove filler words as suggested Cut spans.
4. Shorten gaps as suggested Cut/span operations.
5. Speaker search and "show me all Homer/Charlie mentions".
6. Comments attached to transcript ranges and decision events.

Why P1:

- Descript's biggest lesson is speed through text.
- Studio Cut can do this while staying reversible.

### P2: Social Clip Factory

Goal: one full episode produces shorts, captions, thumbnails, and copy.

Build next:

1. Clip candidate lane with scoring and status.
2. Render profiles for 9:16, 1:1, 4:5, and audio teaser.
3. Caption styling presets.
4. Thumbnail/contact sheet selection.
5. Short title/hook/description drafts.
6. Batch render package output.

Why P2:

- Strong leverage for the broader Content Management Studio.
- Needs transcript and render profiles to be useful.

### P2: Audio/Visual Enhancement Pipeline

Goal: make rough outputs good enough to share and review.

Build next:

1. Loudness normalization in local render.
2. Noise/room cleanup profile hooks.
3. Smart mute/crosstalk warnings.
4. Jump-cut cover suggestions.
5. Camera crop presets from manifest/Sync Map.
6. Optional eye-contact/background tools only if a safe model/API is chosen.

Why P2:

- High value, but quality-sensitive.
- Keep as render profile transforms instead of browser decision state.

### P3: Direct Publishing And Analytics

Goal: turn the Content Management Studio into a publishing operations center.

Build later:

1. Publish package manifest.
2. YouTube upload integration.
3. Podcast host/Spotify workflow.
4. Patreon post drafts.
5. SEO metadata and website publishing.
6. Kindle/Audible research and export pipeline.
7. Content calendar and analytics loop.

Why later:

- Requires credentials, approval flows, platform-specific limits, and rollback.
- Safer after output packages are predictable.

### P3: Native Recording Room

Goal: eventually replace Riverside-style remote recording for High Ground.

Build later:

1. Browser recording room prototype.
2. Host/guest/producer roles.
3. Local participant recording with upload recovery.
4. Teleprompter/script board.
5. Screen/media board.
6. Automatic handoff into Rescue Sync.

Why later:

- High strategic value, but much higher failure risk than current import/sync
  workflow.
- It should emit the same raw intake shape as current uploads.

## Near-Term Concrete Build Recommendation

The next coherent Studio Cut implementation pass should be:

1. Add `TranscriptDocument`, `TranscriptBlock`, and `SuggestedEdit` schema.
2. Add a local transcript import path in the web editor.
3. Show a transcript lane beside decision tools.
4. Clicking transcript text moves source/canonical time.
5. Selecting a transcript range can create a `Cut` or ProgramState decision
   span.
6. Add an agent operation import/apply panel that can apply reviewed operations
   from `agent-edit-session`.
7. Extend web smoke to create one decision via transcript or verify the
   transcript lane renders in local mode.

This is the highest leverage bridge between current Studio Cut and the best
parts of both Riverside and Descript: it accelerates real editing, gives agents
an inspectable surface, and keeps all media decisions semantic and reversible.

The executable prompt queue for continuing this work lives in
`docs/agents/studio-cut-riverside-descript-prompt-queue.md`. Agents should use
that queue when they would otherwise stop and ask for the next Studio Cut
feature prompt.

## Design Guardrails

- Do not clone Riverside or Descript visual design.
- Do not use their names in user-facing feature names.
- Avoid opaque "AI did it" actions. Prefer inspectable proposals.
- Keep every edit reversible.
- Keep source time/canonical episode time visible.
- Keep media privacy boundaries obvious.
- Let direct publishing wait until render packages are trustworthy.
- Build for Charlie's actual episode flow first, then generalize.
