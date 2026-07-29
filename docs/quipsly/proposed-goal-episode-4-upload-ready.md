# Proposed Goal: Episode 4 Upload-Ready Production Proof

Make Episode 4 an upload-ready proof of Quipsly's production loop while stabilizing the project.

Active surface: `apps/QuipslyStudio`. Improve Nest, local-engine, Tower, and shared code only where this proof or factory safety requires it. Follow `docs/architecture/quipsly-production-realignment-2026-07-14.md` as current direction, not dogma.

## Outcome

Produce the strongest publishable Episode 4 package: a professional 16:9 YouTube episode, mastered podcast audio for Spotify/Apple Podcasts, at least five strong 9:16 shorts, transcript/captions, metadata, and validation evidence. Optimize for a compelling complete episode, not an arbitrary duration.

## Production truth

1. Inventory and checksum sources without mutating originals.
2. Build one immutable source manifest and whole-source sync baseline with explicit gaps.
3. Keep equal-length Charlie, Homer, and clip/source stems as canonical editorial truth.
4. Make audio treatment staged: sync repair, activity masks, bleed/echo/noise control, restoration, EQ/dynamics, loudness match, and delivery mix.
5. Measure dialogue LUFS, loudness range, true peak, noise floor, clipping, retained speech, and bleed.
6. Create treatment, editorial, and output branches. Never turn whole sources into thousands of chopped clips.
7. Edit for human pacing: speakers, reactions, J/L cuts, natural pauses, jump cuts, clip integration, framing, color, captions, and music.
8. Version every output; never overwrite prior work.

Deliver a YouTube-ready video, archival WAV, upload-ready podcast audio, five or more 9:16 shorts, transcript, captions, chapters, title/description/thumbnail candidates, platform metadata, manifests, and validation evidence.

## Studio quality

1. Improve the native editor whenever production exposes friction.
2. Keep one playhead across monitors, timeline, audio, transcript, and agent state.
3. Make sources, treatment, decisions, and outputs visually distinct.
4. Prefer direct professional controls over reports, approval forms, and explanatory UI.
5. Humans and agents use the same commands for scrub, audition, select, edit, compare, render, undo, and inspect.
6. Prove work through the real app and Episode 4 data, not compile-only claims.

## Factory stabilization

1. Recover at least 50 GB of SSD space using verified external/cloud custody. Never delete the only verified copy.
2. Continue the Podcast archive safely: hydrate, copy, checksum, then locally evict without deleting cloud originals.
3. Rotate exposed credentials; use Secret Manager or Keychain.
4. Inventory cloud infrastructure when reauthenticated, but do not let auth block local work.
5. Classify app roots as active, reference, or quarantined.
6. Separate generated artifacts from source, preserve the dirty tree, create coherent rescue commits, and push before broad refactors.
7. Decompose Studio at PlaybackClock, AudioWorkbench, DecisionTimeline, RenderPipeline, and AgentBridge seams.
8. Replace broad production Prisma pushes with reviewed migrations and preview deployment.

## Validation

Run checksum, ffprobe, stream, duration, resolution, aspect, A/V sync, loudness, true-peak, caption, manifest, and version checks. Audition stems separately and together. Inspect beginning, middle, end, and edit boundaries. Watch final outputs through real playback or deterministic agent evidence. Do not publish without explicit approval. Commit only coherent progress.

## Fallback

If one operation blocks, record the exact blocker and continue elsewhere. Missing clips and cloud auth must not stop other work. Cleanup must not replace Episode 4 output.

## Acceptance

Episode 4 has verified source, sync, treatment, editorial, and output truth. Charlie and Homer sound balanced, natural, and professional. Episode and shorts are compelling, versioned, and upload-ready. Packages contain required files and metadata. QuipslyStudio is easier for humans and agents. Repository and media custody are more recoverable, with no source loss or false publication claims.
