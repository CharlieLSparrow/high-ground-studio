# Antigravity Reboot Packet

Date: 2026-06-04

Purpose: recover the 12-agent Antigravity flock after an Antigravity crash/reboot without losing lane ownership or current mission context.

## Current mission state

Codex is mission control. Antigravity agents work in stable lanes and append reports to their assigned markdown files.

The active product direction:

- Quipsly/Nest is the main creative operating system.
- The `/create` manuscript editor is the critical spine: one living document, Chapter/Episode structure tags, outline navigation, assistant support, and future publishing/media workflows.
- The `/editor` media workflow is the Episode 4 production/editing surface: import media, set spine audio, sync/relink assets, save timeline safely.
- Quipslys are research assistants/librarians first and co-drafters when asked. They may draft, rewrite, freeform generate, and test voices. The product must prevent silent canon mutation, fake provenance, and hidden publishing, not shame users for wanting AI-written drafts.
- HighGroundOdyssey.com is the public applied content/coaching site powered by Quipsly/Nest outputs.
- QuipLore.com is the public quote discovery/curation product powered by Quipsly research, provenance, and API boundaries.

## Stable lane names and report files

Use these exact names. Do not invent variants.

- AG-Editor-Spine -> `docs/coordination/antigravity-reports/editor-qa.md`
- AG-Assistant -> `docs/coordination/antigravity-reports/assistant-qa.md`
- AG-Research-RAG -> `docs/coordination/antigravity-reports/research-rag.md`
- AG-Video-Editor -> `docs/coordination/antigravity-reports/video-editor.md`
- AG-Storyboard -> `docs/coordination/antigravity-reports/storyboard.md`
- AG-Project-Management -> `docs/coordination/antigravity-reports/project-management.md`
- AG-Marketing -> `docs/coordination/antigravity-reports/marketing-positioning.md`
- AG-Patreon-Support -> `docs/coordination/antigravity-reports/patreon-support.md`
- AG-Mobile-Recording -> `docs/coordination/antigravity-reports/mobile-recording.md`
- AG-Agent-Coordination -> `docs/coordination/antigravity-reports/agent-coordination.md`
- AG-HighGroundOdyssey -> `docs/coordination/antigravity-reports/high-ground-odyssey.md`
- AG-QuipLore -> `docs/coordination/antigravity-reports/quiplore.md`

## Important coordination notes

- Normal product direction should use additive language: "build on", "shift toward", "add", "refine", "yes-and".
- Hard brakes are still appropriate for safety: do not delete routes, mutate real manuscript content, run migrations, or expose secrets without explicit permission.
- Schema/infrastructure proposals are welcome, but major schema edits require explicit Codex/user approval unless a prompt grants schema ownership.
- Use `SCHEMA AUTHORITY REQUIRED` when blocked on schema approval.
- Reports stay markdown-only for now. No JSONL.

## Known caution points before rerunning the last prompt round

- AG-Editor-Spine and Codex both touched `apps/quipsly/src/app/(app)/create/Tagger.tsx` and related `/create` UI. Next pass should QA/reconcile before adding more UI.
- AG-Agent-Coordination previously used the variant `AG-High-Ground-Odyssey`; the stable name is `AG-HighGroundOdyssey`.
- AG-Patreon-Support remains schema-authority gated around ProviderEvent / MembershipReconciliation.
- AG-Project-Management should preserve existing query-param routes for now.
- AG-Mobile-Recording should locate the actual iPhone app path before proposing broad native changes.
- AG-QuipLore can build tangible mock-data MVP surfaces in `apps/quiplore` without waiting on a live API.

## Reboot instruction for every Antigravity thread

Paste this before the lane-specific task if the thread lost context:

```text
Antigravity reboot context:

You are continuing your stable AG lane inside /Users/wall-e/Dev/high-ground-studio.

Read docs/coordination/antigravity-reboot-packet.md and your assigned report file before acting.

Use your exact stable lane name and append only to your assigned report file.

Continue from the latest report state. If your previous work did not survive the crash, report that clearly and rebuild only the smallest safe slice.

Do not run build/typecheck/migrations unless explicitly asked.
```

## Last round to rerun

The next post-reboot action is to re-send the 12 lane-specific prompts from Codex's latest prompt pack. If a lane already completed that exact task before the crash and its report survived, it should do a delta report instead of duplicating work.
