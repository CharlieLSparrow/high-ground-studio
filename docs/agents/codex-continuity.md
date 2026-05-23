# Codex Continuity Note

Date: 2026-05-23

This note is the durable handoff I would want a future Codex session to read
when picking up the project after this terminal closes.

## North Star

High Ground Studio should become the private operating system for getting
Charlie and Homer's ideas into the world.

The center is not a generic dashboard. The center is a set of creative and
business workflows that preserve source material, keep spans addressable, make
tags actionable, treat public outputs as projections, and keep rollback sacred.

The working product should grow into a complete Content Management Studio for:

- long-form book writing
- speech and talk writing
- podcast audio and video production
- travel video production
- HGO episode pages and educational sites
- content schedules
- social posting packages
- analytics, SEO, and marketing follow-through
- coaching operations
- supporter, Patreon, merch, and offer workflows
- future Kindle, Audible, podcast-host, and provider export packages
- agentic research, review, quotation, and production assistants

The tool should be useful before it is complete. Each slice should make the next
real workflow easier for Charlie and Homer, not just satisfy an architecture
diagram.

## Product Principles

- The manuscript is the star. Collaboration, annotations, presence, and review
  tools should layer around one long manuscript surface rather than replacing it
  with disconnected cards.
- Source material is preserved. Imports, transcripts, notes, and source blocks
  should remain recoverable.
- Spans are addressable. Quotes, claims, comments, citations, and edits should
  attach to ranges instead of floating as vague notes.
- Tags are actionable. Metadata should drive review, filtering, readiness, and
  publishing decisions.
- Outputs are projections. HGO pages, show notes, social packets, Kindle files,
  and other public formats should derive from private source state.
- Rollback is sacred. Manual snapshots, checkpoints, staged artifacts, and
  review gates should make recovery normal rather than heroic.
- Agents need rails, not cages. The repo should give Codex agents tests,
  ownership boundaries, message boards, and rollback notes so they can move
  quickly without corrupting the work.

## Current Best Strategy

Keep the multi-agent setup, but make the Supervisor real.

The Supervisor should own coordination, merge order, branch health, deploy
records, and rollback posture. It should not quietly become the feature owner
for every lane. When it does feature work, it should label that mode explicitly.

Recommended lanes:

- Supervisor / Integration Captain: board, progress thread, merge order,
  validation matrix, deploy records, rollback notes.
- Content Studio: private Studio command surface and content project packets.
- Manuscript Collaboration: local Yjs lab, spans, annotations, checkpointing,
  future room identity, and eventual private collaboration route.
- Studio Cut / Media: video/audio editing and production packages.
- WorldHub / Business Infrastructure: offers, memberships, supporter state,
  merch, Patreon, coaching packages, and provider-neutral business models.

Do not add more agents until these lanes are cleanly named on the board with
branches, owned paths, and current status. More agents are useful only after
the board can show where they will not collide.

## Near-Term Build Path

1. Land the current Content Studio branch through PR, then redeploy from the
   merged SHA so `main` and live Studio stop drifting.
2. Add focused tests and smoke coverage for `/content-studio`.
3. Add import/export roundtrip for Content Studio handoff packets.
4. Decide the first shared Content Studio persistence boundary: Prisma model,
   API boundary, or small service.
5. Continue the manuscript collaboration lane with room identity and recovery
   semantics before any real provider/server.
6. Connect HGO staged artifacts to Content Studio episode-page projects without
   public publishing.
7. Connect Studio Cut media packages to Content Studio podcast/video projects.
8. Integrate WorldHub offers/supporter/coaching follow-through as business
   infrastructure, not as scattered one-off buttons.

## Safety Rails To Keep

Fast movement is good. These still deserve explicit scope and rollback notes:

- Prisma schema and production database mutation
- Cloud SQL changes
- Cloud Run config changes beyond image deploys
- DNS, OAuth, billing, secrets, and IAM
- real manuscript text or real HGO source content in tests
- public publishing
- provider calls to Stripe, Patreon, merch/POD, social, analytics, email, or
  podcast-host systems

Image-only deploys to the private Studio Cloud Run service are acceptable after
validation when the rollback revision is recorded.

## What Future Codex Should Do First

Read:

- `AGENTS.md`
- `docs/coordination/agent-board.md`
- `docs/coordination/progress-thread.md`
- `docs/agents/multi-agent-collaboration.md`
- `docs/agents/restart-playbook.md`
- this file

Then run:

```bash
git status --short --branch
git log -1 --oneline
git rev-list --left-right --count HEAD...origin/main
```

If continuing a feature lane, start from the lane branch recorded on the board.
If starting new work, create a focused branch from current `main` and update the
board before editing.

## Open Things I Would Not Forget

- The live Studio revision may be ahead of `main` when a feature branch is
  deployed before merge. Keep a visible live-vs-main table.
- Branches that touch `apps/studio/src/app/studio-nav.tsx`, `package.json`,
  lockfiles, Prisma, Dockerfiles, or deploy config are shared-file branches.
- The Collaboration Lab should keep proving real production mechanics in
  synthetic/local-only form before wiring production `/manuscript`.
- HGO staged artifacts and Store Lab are preparation for private review and
  promotion, not public publishing.
- Browser-local prototypes are useful first cuts, not a permanent refusal to
  add a real database or service boundary.
- Content Studio should eventually be the workbench that ties manuscript,
  media, staged projections, schedules, offers, and analytics into one coherent
  operating surface.

## Closing Thought

If this terminal closes, nothing important should die with it.

The durable work is in tests, commits, docs, runbooks, rollback paths, and
clear next steps. A future Codex should be able to pick up the thread, respect
the same boundaries, and keep building toward a Studio that helps Charlie and
Homer turn rough source material into finished work.
