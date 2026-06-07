# Antigravity Agent Board

Date: 2026-06-04

Purpose: keep parallel Gemini/Antigravity work useful without letting agents collide with the manuscript spine.

Current editor-spine lesson doc: `docs/quipsly/editor-spine-lessons-learned.md`. Read this before changing `/create`; Chapter/Episode heading tags are the source of truth for outline navigation.

Current midnight sprint handoff: `docs/coordination/midnight-sprint-2026-06-06.md`. Read this before touching Art Foundry, output catalogs, beta readiness, QuipLore visual library, or release smoke coverage.

## Workflow

Codex is mission control for now.

The user can paste prompts from Codex into individual Antigravity threads. Each Antigravity thread should append its report to its assigned report file under `docs/coordination/antigravity-reports/`.

To keep coordination fast and lightweight, **markdown reports are the only standard**. There is no need to write JSONL duplicates.

Each report should include:

- timestamp
- stable agent lane name
- prompt summary
- files changed
- files intentionally avoided
- build/typecheck/smoke status if run
- risks
- recommended next handoff

Agents should not edit each other's report files.

### Schema & Infrastructure Proposals

Do not clutter daily lane reports with massive schema designs. If a prompt requires major schema or infrastructure changes, draft a standalone proposal file in `docs/coordination/proposals/YYYY-MM-DD-topic.md`.

If you are blocked waiting for schema approval, halt your work on that change and add the exact phrase **SCHEMA AUTHORITY REQUIRED** in your lane report, linking to your proposal. Codex will scan for this phrase to quickly unblock you.

## Stable lane names

Use these exact lane names in every prompt and every report. Do not invent new display names or variations for the same lane.

- AG-Editor-Spine: `/create` manuscript editor, document outline, author workflow QA
- AG-Assistant: Quipsly assistant sidebar, assistant API, action ledger, assistant safety
- AG-Research-RAG: retrieval, source libraries, citation/research packet contracts
- AG-Video-Editor: `/editor`, media import, sync, timeline, playback, transcript tooling
- AG-Storyboard: storyboard builder and storyboard/media handoff
- AG-Project-Management: project navigation, project registry, IA, SaaS project surfaces
- AG-Marketing: public Quipsly positioning and landing/philosophy copy
- AG-Patreon-Support: support links, Patreon/provider event planning, entitlement proposals
- AG-Mobile-Recording: iPhone/native recorder, read mode, mobile bridge plans
- AG-Agent-Coordination: coordination protocol, report format, proposal process
- AG-HighGroundOdyssey: High Ground Odyssey website, public route transitions, SEO and public podcast delivery
- AG-QuipLore: QuipLore consumer interface, QuipStream feed, Quote Passports, and shareable assets
- AG-Fiction-Analysis: fiction-writing workspaces, story/world analysis, fiction and nonfiction book analysis tools
- AG-Publishing-Integrations: podcast hosting, YouTube/social/Patreon pushes, owned-site publishing, and destination workflows
- AG-Scroll-Experiences: scroll-native story/course/comic/quote/photo experiences, client review, ratings, comments, and analytics (Note: This is a reusable output engine for content/media delivery, not a separate product island)

## Current lane files

Every active lane has exactly one report file. Do not create new report files or dynamic lanes.
*Note: Sibling file `docs/coordination/antigravity-reports/access-saas.md` is deprecated and archived.*

- AG-Editor-Spine: `docs/coordination/antigravity-reports/editor-qa.md`
- AG-Assistant: `docs/coordination/antigravity-reports/assistant-qa.md`
- AG-Research-RAG: `docs/coordination/antigravity-reports/research-rag.md`
- AG-Video-Editor: `docs/coordination/antigravity-reports/video-editor.md`
- AG-Storyboard: `docs/coordination/antigravity-reports/storyboard.md`
- AG-Project-Management: `docs/coordination/antigravity-reports/project-management.md`
- AG-Marketing: `docs/coordination/antigravity-reports/marketing-positioning.md`
- AG-Patreon-Support: `docs/coordination/antigravity-reports/patreon-support.md`
- AG-Mobile-Recording: `docs/coordination/antigravity-reports/mobile-recording.md`
- AG-Agent-Coordination: `docs/coordination/antigravity-reports/agent-coordination.md`
- AG-HighGroundOdyssey: `docs/coordination/antigravity-reports/high-ground-odyssey.md`
- AG-QuipLore: `docs/coordination/antigravity-reports/quiplore.md`
- AG-Fiction-Analysis: `docs/coordination/antigravity-reports/fiction-analysis.md`
- AG-Publishing-Integrations: `docs/coordination/antigravity-reports/publishing-integrations.md`
- AG-Scroll-Experiences: `docs/coordination/antigravity-reports/scroll-experiences.md`

## Collision rules

- Do not mutate real manuscript content without explicit user approval.
- Schema edits, route deletions, access changes, and deploy pipeline changes require Codex/user approval before implementation.
- Do not change `/create` assistant files unless the assigned lane is assistant QA or Codex asks for a targeted patch.
- Do not hardcode project slugs beyond the shared project registry.
- Keep media/video work connected through `projectSlug` and `episodeSlug`.
- Keep Patreon/provider work as provider-event or documentation work unless Codex/user explicitly approves provider mutation.
- Keep route/auth work compatible with owner local development so the user does not get locked out.
- **Instructional Phrasing**: Normal product direction should use additive language where possible, while safety instructions and security boundaries may still use hard brakes.

## Bold proposals welcome

Do not let these rules make you timid! If a bold architecture or feature change is the right move for the product, propose it. Classify the proposal clearly and ask for approval, rather than avoiding big ideas.

## Report template

Always format your report headers using the exact stable lane name string (e.g., `AG-Editor-Spine` instead of dynamic names like `Editor QA Delta Review`).

```md
## 2026-06-04 HH:MM local - <exact stable lane name>

Prompt summary:

Files changed:

Files intentionally avoided:

Validation run:

Risks:

Recommended next handoff:
```

**AG-Release-Captain:** Initialized, standing by for explicit DEPLOY GO.

## 2026-06-04 20:06 local - AG-Release-Captain

Prompt summary: Deploy go!

Files changed:
- `apps/quipsly/src/app/(app)/editor/RemotionComposition.tsx` (patched deploy blocker)
- `.gitignore` (ignored dev files)
- `cloudbuild.studio.yaml`, `cloudbuild.studio.deploy.yaml` (enforced type errors)
- `scripts/release-quipsly.sh` (new deploy script)

Files intentionally avoided:
- `apps/mobile-capture/` (submodule ignored during dirty-check)

Validation run:
- Local `pnpm typecheck` passed.
- Local `pnpm build` passed.
- Cloud Build Docker image built successfully.
- **FAILED**: Cloud Run deployment.

Risks:
- Deployment blocked by missing IAM permissions.

Recommended next handoff: DevOps / Codex to fix `run.services.get` (Cloud Run Admin) permissions on `659427658635-compute@developer.gserviceaccount.com`.
