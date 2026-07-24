# Blocked Goal Ledger

This ledger parks goals that were valuable but blocked, deferred, or interrupted so we can loop back deliberately instead of losing the thread.

## 2026-06-22 - Shorts-first production system goal parked

Status: blocked / parked for later

Reason parked: The high-level goal is still correct, but the current implementation path exposed a lower-level blocker. Quipsly Studio can define and export shorts through a temporary proxy-first FFmpeg bridge, but the native app batch exporter accepted commands and wedged before writing files. Before continuing the full shorts-quality loop, the native export path needs to become reliable, observable, and non-blocking.

Original goal:
Build Quipsly Studio into a shorts-first production system that can create genuinely strong short-form content from long-form source material and do so for all three episodes we have so far.

The priority is not simply exporting clips. The priority is making shorts that have a real chance of earning attention on YouTube Shorts, Instagram Reels, Facebook Reels, TikTok-style vertical feeds, LinkedIn, Patreon teasers, and HighGroundOdyssey.com embeds.

Work in tight research-build-dogfood loops:
1. Research what the best current tools do well, especially Riverside.fm, Descript, OpusClip, Captions, CapCut, YouTube Create/Studio, Instagram/Meta tools, Canva, Adobe Express, Premiere, Final Cut, and other relevant short-form editors.
2. Convert that research into Quipsly-specific features that match our architecture: metadata-first, proxy-first, whole synced source lanes, non-destructive edit decisions, agent-accessible controls, and low-anxiety human refinement.
3. Use Episode 1-3 shorts as the live proving ground. Create, score, refine, export, inspect, listen to, and package actual 9:16 shorts.
4. Improve the software whenever the real editing/export loop exposes friction, weak UX, weak automation, missing state, poor crop tools, caption risk, bad pacing visibility, or fragile agent control.

Loop-back trigger: Resume after Quipsly Studio has a reliable native/local export engine that can export all queued shorts without wedging the app and can report progress, failures, and artifact paths clearly.

## 2026-06-22 - Native/local export reliability goal parked

Status: blocked / parked for later

Reason parked: The exporter reliability work is still necessary, but it should not keep the next sprint trapped inside export plumbing. The temporary proxy-first FFmpeg bridge proved the created shorts can be rendered from session metadata and proxies, but the durable app-owned path still needs to become non-blocking, observable, and boring before it is production truth. The next immediate product risk is the editor experience itself: if the visible editing loop is not obvious, scrubbable, and trustworthy, better export plumbing will only create better artifacts from a confusing workflow.

Original goal:
Make Quipsly Studio's native/local export and artifact pipeline production-reliable.

The immediate goal is to turn exporting from a fragile proof path into a dependable product path.

Fix or replace the native batch exporter so it can export all queued shorts without wedging the app, blocking the agent server, or requiring temporary scripts. The exporter must be proxy-first, non-destructive, observable, cancellable where practical, and honest about failures.

Requirements:
1. Export queued 9:16 shorts from Episode 1-3 using the real app/local engine path, not a temporary one-off bridge.
2. Keep original media untouched; use proxies and session metadata as the source of truth.
3. Show progress, current item, output paths, failures, and recovery actions in the app and agent API.
4. Write a manifest for every export batch with session, short title, source lanes, duration, output path, and errors.
5. Make the agent server stay responsive during export.
6. Add a safe fallback path if AVFoundation export fails, preferably an app-owned/local-engine FFmpeg route rather than an ad hoc script.
7. Validate by exporting all current created shorts to Desktop from the app-owned path.
8. Only after this is stable, resume the broader shorts-first creative quality goal.

Product principle:
The creative shorts system cannot be trusted until the artifact pipeline is boring, visible, and dependable.

Loop-back trigger: Resume when the editor surface is usable enough that export is again the bottleneck, or when publishing/deployment requires repeatable app-owned artifact creation rather than the temporary direct proxy-export bridge.
