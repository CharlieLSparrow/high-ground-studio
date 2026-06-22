# Quipsly Native Editor Spine Doctrine

Last updated: 2026-06-18

This document exists to keep QuipslyStudio aligned while the editor evolves quickly.

## Product promise

QuipslyStudio is not Premiere with friendlier colors. It is a source-spine editor:

- Whole synced sources stay intact.
- SHOW and SKIP decisions live as metadata over those sources.
- The Program monitor shows the current edit.
- The Source Wall keeps every synced source visible for review.
- Play Edit shows the audience cut and skips inactive gaps.
- Play Through follows raw sequence time for source review and recovery.
- The same episode spine produces 16:9 episodes, 9:16 shorts, and podcast audio.

## Non-negotiable editor model

The editor must preserve these truths:

- Source files are not chopped into tiny working clips.
- Proxies are the normal editing media.
- Originals are protected and only touched for explicit relink, proxy generation, waveform generation, or final master work.
- Timeline lanes represent whole synced sources.
- Decisions represent edit intent.
- Short clips are pull-out recipes from the episode spine, not separate mini projects.
- Audio publishing is a first-class output route, not an afterthought.
- Human and Codex editors should be able to observe the same state and perform the same safe semantic actions.

## Core surfaces

### Program monitor

Shows what the audience currently sees.

It must be the visual star of the editor. If Play Edit is in a skipped or no-SHOW gap, the program should communicate that clearly instead of silently showing the wrong source.

### Source Wall

Shows every synced source.

Each card should make these facts obvious:

- Is this source live, proxy-ready, protected, held, or missing?
- What time is the source at for the shared sequence playhead?
- Is this source currently SHOW, SKIP, standby, or out of range?
- What safe action can the editor take now?

### Episode spine map

The timeline is a map of whole lanes plus metadata overlays.

It should distinguish:

- Whole source lane availability.
- SHOW decisions that appear in Play Edit.
- SKIP decisions that Play Edit jumps over.
- Review stops used for navigation.
- Short pull-out recipes used for social outputs.

### Inspector

The inspector edits metadata:

- Baseline framing fixes an entire source lane for a format.
- Keyframes add timed motion or emphasis.
- 16:9 and 9:16 framing are separate output choices.
- None of this mutates source media.

### Publish path

The editor has three primary output families:

- 16:9 episode: YouTube, Patreon, episode pages.
- 9:16 shorts: YouTube Shorts, Instagram, Facebook, LinkedIn.
- Podcast audio: Spotify, Apple Podcasts.

Every future export or publishing feature should attach back to the same episode spine and produce receipts where practical.

### Deliverable readiness model

Do not treat export as a single success flag. Each publishable artifact needs its own readiness state because a real episode can be half-ready:

- Episode master readiness: 16:9 Program Output plays correctly, uses proxy-safe or relinked media, has title/description/package metadata, and can export a master file.
- Shorts readiness: one or more 9:16 pull-out recipes have ranges, framing, caption plan, destination metadata, and export status.
- Podcast readiness: audio route has the intended source/spine, loudness or cleanup notes, title/description metadata, and export status.
- Publication readiness: each destination has either a queued upload, a manual handoff packet, or a receipt URL/id after publishing.

The UI should use plain language:

- `Draft`: useful idea, not ready for export.
- `Ready to review`: playable and understandable, needs human check.
- `Ready to export`: enough media and metadata exist to build the artifact.
- `Exported`: local file exists.
- `Published`: destination receipt exists.
- `Needs attention`: blocked by missing media, missing proxy, missing metadata, failed export, or missing account/credential.

Readiness is descriptive, not moral. It should tell the editor what exists and what is missing without shaming them or inventing fake certainty.

### Human/Codex shared publishing loop

The publishing loop should become:

1. Human or Codex creates or refines SHOW/SKIP decisions.
2. Human or Codex checks Program Output in 16:9.
3. Human or Codex creates 9:16 short pull-out recipes from the same spine.
4. Human or Codex checks podcast audio readiness.
5. The app builds local deliverables.
6. The app prepares upload/handoff packets.
7. Destination uploads or manual publishing create receipts.
8. Receipts come back into the episode so future agents know what actually shipped.

Codex should never have to infer publish state from filenames alone. The editor needs structured state for output family, destination, status, local path, public URL, provider id, generatedAt, publishedAt, and notes.

The native core model now has additive publishing readiness types:

- `PublishOutputFamily`: `episode16x9`, `short9x16`, `podcastAudio`, `platformPublication`.
- `PublishReadinessState`: `draft`, `readyToReview`, `readyToExport`, `exported`, `published`, `needsAttention`.
- `PublishDeliverableReadiness`: a typed read model for one artifact/destination/status row.
- `PublishReceiptRecord.deliverableReadiness(...)`: converts existing receipt rows into the newer readiness language without replacing saved session data.

Future UI should prefer these typed states over raw strings when practical, while still preserving old saved sessions.

## Agent accessibility rule

Codex and other agents need semantic handles, not pixel guesses.

Every important surface should eventually expose:

- Stable accessibility identifiers.
- Current selection.
- Current playhead.
- Current source readiness.
- Current program decision.
- Safe actions.
- Output readiness.
- Diagnostics that distinguish missing source, missing proxy, protected original, and publish-blocking failure.

The agent loop is:

1. Observe state.
2. Choose a safe semantic action.
3. Execute the action.
4. Re-observe state.
5. Report evidence, not vibes.

## Design direction

The editor should feel:

- Professional enough for all-day work.
- Warm enough to reduce systems anxiety.
- Nature-y and organic without becoming decorative clutter.
- Calm about recoverable issues.
- Very clear about irreversible or publish-blocking risks.

Use the Quipsly color language consistently:

- Honey: SHOW, visible output, chosen program state.
- Clay: SKIP, recovery, needs attention.
- Creek: sync, playhead, navigation.
- Moss: ready, safe, proxy-backed.
- Lichen: keyframes, review, expressive tool state.

## Current priority

Episode 1 remains the proof lane until the editor loop is stable.

The immediate proof target is:

- Open Episode 1.
- Scrub one shared playhead.
- See Program and Source Wall stay in sync.
- Use Play Edit and Play Through correctly.
- Drop or adjust SHOW/SKIP decisions.
- Pull 9:16 shorts from the same spine.
- Prepare outputs for episode, shorts, and podcast paths.
