# Antigravity Agent Board

Date: 2026-06-04

Purpose: keep parallel Gemini/Antigravity work useful without letting agents collide with the manuscript spine.

Current editor-spine lesson doc: `docs/quipsly/editor-spine-lessons-learned.md`. Read this before changing `/create`; Chapter/Episode heading tags are the source of truth for outline navigation.

Current standalone native video editor control doc: `docs/coordination/native-video-editor-control-room.md`. Read this before changing `apps/quipsly-video`; the Synced Source Monitor Wall, full source lanes, explicit `Play Edit` / `Play Through`, and proxy-first playback are the operating model.

Current Premiere rescue workflow doc: `docs/quipsly/premiere-rescue-workflow.md`. Read this before changing Premiere import, `/editor`, Mac Premiere Draft Edit, or media recovery flows; source monitors, program edit, preserved decisions, restore previews, and backup-before-promotion are the operating model.

Current midnight sprint handoff: `docs/coordination/midnight-sprint-2026-06-06.md`. Read this before touching Art Foundry, output catalogs, beta readiness, QuipLore visual library, or release smoke coverage.

## Workflow

Codex is mission control for now.

The user can paste prompts from Codex into individual Antigravity threads. Each Antigravity thread should append its report to its assigned report file under `docs/coordination/antigravity-reports/`.

To keep coordination fast and lightweight, **markdown reports are the only standard**. There is no need to write JSONL duplicates. Avoid reporting empty planning summaries; only log Delta Reports when you actually change code or architecture.

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

### Bounding Box Autonomy (Moving Fast)
Agents operate with **100% autonomy inside their bounding box**.
- **Free Innovation:** You do not need approval for internal UI, component logic, styling, local state, non-breaking nested route additions, and mock data APIs. Do not let safety boundaries make your product work timid.

### Schema & Infrastructure Proposals (Safety Boundaries)
- **Requires Approval:** Database schema migrations, shared `package.json` updates, IAM/Auth changes, and destructive public route deletions.
- Do not clutter daily lane reports with massive schema designs. Draft a standalone proposal file in `docs/coordination/proposals/YYYY-MM-DD-topic.md` (Context, Options, Proposed Decision, Consequences).
- **Never Freeze Progress:** If you hit a schema blocker, log **SCHEMA AUTHORITY REQUIRED** linking your proposal, and *immediately pivot to building the frontend against mock data*.

## Stable lane names

Use these exact lane names in every prompt and every report. Do not invent new display names or variations for the same lane.

- AG-Editor-Spine: `/create` manuscript editor, document outline, author workflow QA
- AG-Assistant: Quipsly assistant sidebar, assistant API, action ledger, assistant safety
- AG-Research-RAG: retrieval, source libraries, citation/research packet contracts
- AG-Video-Editor: `apps/quipsly-video` native editor first; older `/editor`, media import, sync, timeline, playback, and transcript tooling only when explicitly scoped
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
- AG-Scroll-Experiences: scroll-native story/course/comic/quote/photo experiences, client review, ratings, comments, and analytics
- AG-Release-Captain: Deployment, pipeline unblocking, IAM, release smoke testing, and rollback

## Current lane files

Every active lane has exactly one report file. Do not create new report files or dynamic lanes.
*Note: Any report file not listed here (e.g., `access-saas.md`, `project-systems.md`, `marketing-site.md`) is a deprecated dynamic lane and should be ignored.*

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
- AG-Release-Captain: `docs/coordination/antigravity-reports/AG-Release-Captain.md`

## Collision rules

- Do not mutate real manuscript content without explicit user approval.
- Schema edits, route deletions, access changes, and deploy pipeline changes require Codex/user approval before implementation.
- Follow `docs/quipsly/quipsly-content-partner-doctrine.md`: Quipslys may create serious publishable-intent drafts, packets, edits, examples, and research when a workflow needs living material. Do not call serious agent work a placeholder just because an agent made it. Preserve authorship, provenance, review state, and receipt truth.
- Do not change `/create` assistant files unless the assigned lane is assistant QA or Codex asks for a targeted patch.
- Do not hardcode project slugs beyond the shared project registry.
- Keep media/video work connected through `projectSlug` and `episodeSlug`.
- For `apps/quipsly-video`, do not confuse the timeline lane-label column with the Synced Source Monitor Wall.
- For `apps/quipsly-video`, do not claim success from build success, screenshots, or stale tests; prove visible editor state through the actual app/backdoor path.
- For `apps/quipsly-video`, do not chase export, 360/INSV, or broad UI redesign before WAV import, MP4/proxy import, monitor wall, full-lane timeline, and explicit transports are proven.
- Keep Patreon/provider work as provider-event or documentation work unless Codex/user explicitly approves provider mutation.
- Keep route/auth work compatible with owner local development so the user does not get locked out.
- **Instructional Phrasing**: Normal product direction should use additive language where possible, while safety instructions and security boundaries may still use hard brakes.

## Bold proposals welcome

Do not let safety rules make you timid! We need aggressive, premium product development. If a bold architecture or feature change is the right move for the product, propose it. Classify the proposal clearly and ask for approval, rather than avoiding big ideas. The difference between safety boundaries and timid product work is that safety boundaries protect the data; timid product work hurts the user experience.

## Report template

Always format your report headers using the exact stable lane name string (e.g., `AG-Editor-Spine` instead of dynamic names like `Editor QA Delta Review`).

```md
## YYYY-MM-DD HH:MM local - <exact stable lane name>

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
