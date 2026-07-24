# Quipsly Native Editor Complete Publishing Contract

Last updated: 2026-06-18

This document defines what the native editor must become before we can honestly call it a complete edit-to-publish system for humans and Codex.

## Product thesis

Quipsly Studio is not a traditional clip cutter. It is a proxy-first, metadata-first episode production system.

The source files stay whole. The editor builds a shared episode spine, synchronized source lanes, reversible SHOW/SKIP decisions, reframing metadata, short recipes, transcript/caption context, export artifacts, publishing packets, and receipts.

A finished Quipsly editing session should answer five questions without panic:

1. What source media exists and is it proxy-ready?
2. What does the episode edit show at this playhead?
3. What short/podcast/publishing outputs can be made from this episode spine?
4. What artifacts have actually been exported or prepared?
5. What has actually been published, scheduled, or proven with receipts?

## Completion requirements

### 1. Human editing experience

Required state:

- Program Hearth shows the current edit output.
- Source Grove shows every synced video source at the shared playhead.
- Episode Trail Map shows whole lanes, not chopped source clips.
- SHOW decisions are visibly distinct from quiet-gap/SKIP decisions.
- Scrubbing the timeline keeps Program Hearth and all source monitors synchronized.
- Pinch/zoom and zoom buttons make fine cuts practical.
- Keyboard editing is first-class: play, play through, jump, switch cameras, select decisions, nudge, trim, delete metadata.
- Program framing supports baseline crop and keyframed crop for both 16:9 and 9:16.
- Humans can understand what is selected, what will change, and whether the operation edits metadata or source media.

Proof required before completion:

- A human can open Episode 1, scrub, switch between Charlie/Homer/Both/Skip, tune a selected decision, and see Program Hearth change truthfully.
- A human can zoom into a dense section and adjust at least one decision boundary.
- A human can switch between 16:9 and 9:16 and understand which output is being framed.

### 2. Codex editing experience

Required state:

- Codex can query editor state without scraping UI text.
- Codex can identify loaded sequence, current playhead, selected source, selected decision, playback mode, media readiness, and output format.
- Codex can safely execute or propose editing actions through explicit endpoints or payload contracts.
- Codex can distinguish safe metadata edits from unsafe source-media operations.
- Codex can copy/export diagnostic JSON for timeline, source readiness, short recipes, and delivery path.

Proof required before completion:

- Codex can load or inspect Episode 1 state, identify the current output truth, select or report a source lane, and describe the next safe action.
- Codex can produce a delivery-path JSON showing what artifacts exist and what receipts are missing.
- Codex can help a human continue after confusion without guessing about publication proof.

### 3. 16:9 episode output

Required state:

- The editor can prepare a 16:9 episode master from the shared spine.
- Wide output respects SHOW/SKIP decisions, source switching, both-speaker layouts, reference clips, and crop metadata.
- Export or handoff clearly distinguishes proxy preview from final/original-quality render.
- The wide master has a publishing packet for YouTube, Patreon, and episode pages.
- The system never marks the episode published until a URL/provider receipt is captured.

Proof required before completion:

- A wide master artifact or dry-run artifact packet can be generated for Episode 1.
- The artifact path, next upload action, and missing receipt state appear in Ship mode.
- The delivery path JSON reports wide episode status accurately.

### 4. 9:16 short output

Required state:

- Short clips are recipes over the episode spine, not duplicated mini projects or chopped source files.
- A short can contain one continuous segment or multiple ordered segments.
- Short recipes can target YouTube Shorts, Instagram, Facebook, and LinkedIn.
- 9:16 framing can be adjusted independently from 16:9 framing.
- Exported short artifacts, thumbnails/captions/copy, and platform status can be tracked.
- The timeline shows selected short pull-out rails clearly enough to understand what segment(s) will export.

Proof required before completion:

- Episode 1 has at least one short recipe that can be selected, previewed, and represented on the timeline.
- A social shorts packet can be generated or its missing prerequisites are clearly reported.
- Ship mode can report short packet/artifact and receipt status.

### 5. Podcast audio output

Required state:

- Podcast audio handoff is tied to the episode spine.
- Audio output can be prepared for Spotify and Apple Podcasts.
- Metadata packet includes title, description, show notes, episode reference, and artifact path when available.
- Publication state remains separate from artifact readiness.

Proof required before completion:

- A podcast-ready packet can be generated or the blocker is clearly visible.
- Ship mode reports audio handoff status separately from video and social shorts.
- Receipt capture supports Spotify and Apple Podcasts as explicit targets.

### 6. Publishing and receipt truth

Required state:

- Ship mode distinguishes artifact readiness, upload intent, and publication proof.
- Publication receipts include platform, public/scheduled URL, provider ID when available, status, notes, and artifact link.
- Missing receipts can be copied as a checklist.
- Delivery-path JSON is copyable and suitable for Codex handoff.
- Direct upload automation is never implied unless channel auth and API upload are actually implemented.

Proof required before completion:

- A user can see the four delivery families: 16:9 episode, 9:16 shorts, podcast audio, and receipts.
- A user can prepare/review artifacts without marking them published.
- A user or Codex can capture receipts after manual upload/scheduling.

## Current surfaces known to exist

These are implementation surfaces already present or recently added. They still require runtime verification before being treated as complete.

- Program Hearth / Monitor Wall language and layout.
- Source Grove right-side synced source cards.
- Episode Trail Map with whole lanes, SHOW/SKIP overlays, zoom controls, and operator hint strip.
- Tool Bay modes: Frame, Shorts, Script, Ship.
- Frame Bench with baseline/keyframe crop concepts.
- Ship Delivery Path primer.
- Copyable delivery-path JSON.
- Publish packet, social packet, podcast packet, receipt, and command-center code paths appear to exist in `WorkspaceView.swift`, but each must be proven in-app.

## Known high-risk gaps

These are the places most likely to block real weekly publishing.

1. Runtime build health after recent UI refactors.
2. Real Episode 1 proof after the redesign.
3. Whether source scrubbing remains synchronized under the redesigned surfaces.
4. Whether 16:9 and 9:16 export paths produce usable artifacts, not just packet JSON.
5. Whether short recipes are easy enough to create, edit, preview, and export.
6. Whether podcast audio output is a real artifact path or only a planning packet.
7. Whether Codex endpoints/state reflect the new Ship Delivery Path JSON.
8. Whether receipt capture is ergonomic enough after manual uploads.

## Recommended implementation order

### Pass 1: Stabilize and prove redesign

- Build/relaunch only when explicitly approved.
- Fix compile issues introduced by UI refactors.
- Open Episode 1 and prove Program Hearth, Source Grove, Timeline Map, Tool Bay, and Ship mode are visible.
- Confirm the Delivery Path JSON copies successfully.

### Pass 2: Complete human edit loop

- Improve timeline readability and selected decision ergonomics.
- Prove camera switching changes Program Hearth.
- Prove Play Edit skips quiet gaps and Play Through inspects source time.
- Make keyboard shortcuts visible in all relevant buttons/tooltips.

### Pass 3: Complete short clip loop

- Make short creation obvious.
- Make selected short rails unmissable on the timeline.
- Support one-segment and multi-segment short recipes.
- Export or packetize shorts with platform-specific copy.

### Pass 4: Complete publishing loop

- Generate or prove 16:9 episode artifact packet.
- Generate or prove 9:16 social shorts packet.
- Generate or prove podcast audio packet.
- Capture receipts and show missing proof clearly.

### Pass 5: Complete Codex loop

- Expose delivery-path payload through agent state or a stable command endpoint.
- Add safe agent actions for report, select, prepare, copy checklist, and copy packet JSON.
- Add guardrails so Codex cannot claim publication without receipt proof.

## Non-negotiable doctrine

- Whole source lanes stay whole.
- Proxies power editing by default.
- Originals remain protected unless explicit access is needed.
- SHOW/SKIP/crop/shorts are metadata, not destructive cuts.
- Publishing proof requires receipts.
- Codex and humans should see the same truth, only through different interfaces.
- Calm is a feature. Clarity is a feature. Anxiety reduction is a feature.

## Agent-readable delivery state

The Ship delivery path must be available to Codex in two ways:

1. Human-triggered handoff: the Ship workbench `Copy path JSON` button copies the same truth a human sees.
2. Structured state: agent-readable state payloads should include `deliveryPath`, using the same output-family rows as the UI.

Codex should treat `deliveryPath` as the first stop for publishing work. It answers:

- Which output families exist.
- Which artifacts or packets are ready.
- Which destinations are implied by each output family.
- Which receipts are captured or missing.
- What the next safe action is.

Codex must not infer publication from artifact readiness. Publication requires captured receipt proof.

## Codex editor capability boundary

Codex is a first-class editor assistant, but not an invisible publisher or destructive media operator.

The complete editor must make Codex capable of:

- Reading the same episode truth a human sees.
- Explaining what is selected and what will change.
- Preparing exports, packets, checklists, and delivery JSON.
- Proposing edits and applying approved metadata changes.
- Helping capture receipt proof after human upload or scheduling.

The complete editor must prevent Codex from:

- Treating artifact readiness as publication proof.
- Mutating source media.
- Converting whole synced lanes into chopped clip architecture.
- Hiding proxy/original/media-readiness problems.
- Making irreversible or expensive actions feel casual.

This boundary is not anti-agent. It is what makes agentic editing trustworthy enough to use while producing real episodes.
