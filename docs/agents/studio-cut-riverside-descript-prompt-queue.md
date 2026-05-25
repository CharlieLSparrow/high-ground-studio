# Studio Cut Riverside/Descript Prompt Queue

Date: 2026-05-25

Use this document as the standing autoprompt queue for Studio Cut feature-parity
work inspired by `docs/analysis/studio-cut-riverside-descript-research.md`.
"Parity" means solving the same internal job in a Studio Cut-native way, not
copying another product's branding, UI, or proprietary implementation.

## Autoprompt Protocol

When an agent is about to finish a Studio Cut pass and would otherwise ask the
operator for the next prompt:

1. Open this document.
2. Pick the first unchecked prompt whose prerequisites are satisfied.
3. Execute a coherent implementation pass.
4. Update docs and tests with the same pass.
5. Run `pnpm studio-cut:verify`.
6. Commit the completed work.
7. Deploy Hosting when the web app or deployable Studio Cut runtime changed:
   `firebase deploy --project high-ground-odyssey --only hosting`.
8. Push the branch.
9. Mark the prompt status here if the pass changes this file.
10. Continue to the next prompt when there is productive, safe work remaining.

Hard boundaries remain:

- Do not commit secrets, local env files, credentials, service accounts, media,
  proxies, private episode data, generated renders, or local real Episode JSON.
- Keep full-resolution media whole and local unless a future sprint explicitly
  designs a safe cloud lifecycle.
- Keep semantic decisions reversible and explainable.
- Do not deploy Firestore/Storage rules unless tests pass and the target is
  explicit.

## Prompt 01: Transcript Edit Lane

Status: complete in this pass

Mission:
Turn imported timed transcripts from passive diagnostics into a fast editing
surface.

Build:

- Show transcript segments in a dedicated Transcript Edit Lane.
- Highlight the segment under the current source time.
- Let the operator click a transcript segment to scrub to its start.
- Let the operator set the range handles from a transcript segment.
- Let the operator apply a selected ProgramState across a transcript segment,
  using semantic decision events and restoring the previous state at the segment
  end when needed.
- Keep transcript data browser-local unless explicitly exported.
- Update Playwright smoke to verify transcript navigation and state application.

Why:
This is the first Descript-style editing speed win that still respects Studio
Cut's source-preserving semantic model.

## Prompt 02: Agent Suggestions Inbox

Status: complete in this pass

Mission:
Make agent operation JSON feel like a first-class review queue instead of a
hidden import/export trick.

Build:

- Add an Agent Suggestions Inbox panel.
- Import agent operation JSON into visible suggestion cards.
- Show operation type, affected time range, state, rationale, confidence, and
  warnings.
- Let the operator apply all, apply selected, or reject selected suggestions.
- Preserve the existing all-or-nothing import path as a fallback.
- Add smoke/helper coverage for selected suggestion apply/reject.

Why:
Descript's Underlord direction is strategically important, but Studio Cut should
make agent edits inspectable, selective, and reversible.

## Prompt 03: Clip Candidate Lane

Status: next

Mission:
Create the first Magic Clips-style internal lane without rendering clips yet.

Build:

- Add shared schema for `ClipCandidate`.
- Let humans create a clip candidate from the current segment, selected range,
  transcript segment, or marker-to-marker span.
- Store title, summary, score/reasons, source range, status, and target render
  profiles.
- Show clip candidates in the editor.
- Export clip candidate JSON with decisions/agent context.
- Add a local render dry-run command that lists approved clip candidates.

Why:
Short-form repurposing is a high-leverage output, but clips should remain
semantic ranges until render time.

## Prompt 04: Episode Output Board

Status: queued

Mission:
Create a Riverside/Descript-style output cockpit for full episode publishing
prep.

Build:

- Add an Episode Output Board in the web app.
- Show current decision count, active duration, cut duration, approved clip
  count, transcript status, Sync Map status, proxy status, and render readiness.
- Generate a platform-neutral publish package draft:
  title candidates, description draft, chapters, captions status, clip list,
  render commands, and checklist.
- Export the package as JSON/Markdown.

Why:
Direct YouTube/Spotify/Patreon integrations should wait, but a dry-run publish
package can become useful immediately.

## Prompt 05: Upload/Sync Job Timeline

Status: queued

Mission:
Make the cloud sync path visibly understandable to Charlie.

Build:

- Add a Sync Job Timeline panel.
- Show statuses:
  `draft -> uploading -> uploaded -> inspected -> syncing -> package_ready -> room_published`.
- Show per-role upload health, missing files, recoverable failures, and next
  command/action.
- Add docs and smoke coverage for the visible timeline in local mode.

Why:
Riverside's upload/recovery confidence is a core product lesson. Studio Cut
needs the same clarity around Rescue Sync.

## Prompt 06: Transcript Cleanup Suggestions

Status: queued

Mission:
Convert filler clusters, transcript gaps, and likely fluff into reversible edit
suggestions.

Build:

- Extend transcript review tasks into `SuggestedEdit` records.
- Show suggestions with confidence, rationale, and affected transcript text.
- Let operators apply selected suggestions as semantic decision operations.
- Keep every suggestion reversible through undo/checkpoint.

Why:
This is the Studio Cut-native version of filler word and silence removal.

## Prompt 07: Caption And Social Profile Scaffold

Status: queued

Mission:
Prepare render profiles for captioned clips and social variants.

Build:

- Add profile metadata for YouTube 16:9, Shorts/Reels/TikTok 9:16, square, and
  audio teaser outputs.
- Add caption style presets as data, not hard-coded render behavior.
- Add local render plan output that explains how each clip/full episode would
  render for each profile.

Why:
Captions and aspect variants are core Riverside/Descript jobs, but Studio Cut
should keep them in render profiles.

## Prompt 08: Episode Setup Board

Status: queued

Mission:
Add the first pre-recording/pre-sync board for scripts, notes, host metadata,
and planned media.

Build:

- Add a browser-local/shared room setup board.
- Store episode title, guests, links, script/teleprompter notes, planned clip
  beats, and asset checklist.
- Keep it lightweight and compatible with future Content Management Studio
  episode planning.

Why:
This is the safe precursor to Riverside-like studio controls without building
live recording yet.

## Prompt 09: Recording Room Research Spike

Status: queued

Mission:
Design, but do not yet build, the Studio Cut native recording room.

Build:

- Create a technical design doc for browser recording, roles, upload recovery,
  local track capture, and handoff into Rescue Sync.
- Include risks, browser APIs, storage costs, failure modes, and rollback.

Why:
Native recording is strategically large, but it should not interrupt the
sync/edit/render spine until the design is explicit.
