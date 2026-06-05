# Quipsly Beta Manifest

**Purpose:** A single, scannable source of truth for the Release Captain (Codex) to determine deploy readiness, routing security, and lane status.

> **Instruction to Agents:** During Beta Prompt rounds, update your specific row in this manifest if your routes, readiness, or hidden status changes. Keep this table boringly reliable and easy to scan.

## 1. Beta Readiness & Route Exposure Registry

| Lane Name | Report File | Current Owner | Beta-Critical Routes | Hidden/Internal-Only Routes | Deploy Readiness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AG-Editor-Spine** | `editor-qa.md` | Antigravity | `/create` | Owner-gated HGO publish button | **Needs Codex Review** |
| **AG-Assistant** | `assistant-qa.md` | Antigravity | `/api/assistant`, `/api/quipsly-assistant` | Manuscript-mutating assistant actions | **Needs Codex Review** |
| **AG-Research-RAG** | `research-rag.md` | Antigravity | Manuscript assistant/research side panels | pgvector/vector generation | **Needs Codex Review** |
| **AG-Video-Editor** | `video-editor.md` | Antigravity | `/editor` | Real MP4 render/export queue | **Needs Codex Review** |
| **AG-Storyboard** | `storyboard.md` | Antigravity | `/storyboards/builder` | `/storyboard` (redirect) | **Ready** |
| **AG-Project-Management** | `project-management.md` | Codex + Antigravity | `/projects`, `/nests`, `/create?project=*` | Implicit `/create` fallback | **Needs Codex Review** |
| **AG-Marketing** | `marketing-positioning.md` | | `/` (homepage) | `/marketing/campaigns`, `/storyboards/builder` | **Ready** |
| **AG-Patreon-Support** | `patreon-support.md` | AG-Patreon-Support | `/api/webhooks/patreon`, `/api/cron/patreon-reconcile` | `BetaAccessView` | **Ready** |
| **AG-Mobile-Recording** | `mobile-recording.md` | AG-Mobile-Recording | `/read` (web fallback) | `HighGroundCapture` (TestFlight iOS App) | **Ready** |
| **AG-Agent-Coordination** | `agent-coordination.md` | Coordinator | None (Internal) | All Coordination Docs | **Ready** |
| **AG-HighGroundOdyssey** | `high-ground-odyssey.md` | Antigravity | `/`, `/episodes/[[...slug]]`, `/episodes/[slug]/read`, `/library`, `/dashboard` | `/team/hgo-publish-queue`, `/team/hgo-publish-draft-lab` | **Ready** |
| **AG-QuipLore** | `quiplore.md` | Antigravity | `/stream`, `/quotes/*`, `/hub`, `/lorelists/*` | Authenticated Nest saves | **Ready** |
| **AG-Fiction-Analysis** | `fiction-analysis.md` | AG-Fiction-Analysis | `/api/story-bible/*` | | **Ready** |
| **AG-Publishing-Integrations**| `publishing-integrations.md`| Antigravity | `/api/public/podcast/rss/*` | `/publishing-suite/*` | **Ready** |
| **AG-Scroll-Experiences** | `scroll-experiences.md` | | `/review/[storyboardId]` | Storyboard Builder (Review Feedback UI) | **Ready** |

## 2. Active Beta Blockers & Cross-Lane Risks
*(Agents: Log any critical cross-lane blockers, schema conflicts, or required approvals here)*

- **AG-Release-Captain**: Refresh IAM/deploy assumptions before DEPLOY GO; older reports claim `run.services.get` is blocked, but this may be stale after recent successful deploys.
- **Codex Project/Nest reconciliation**: Blank project slugs no longer normalize to the HGO manuscript. Customer-facing entry must pass explicit `?project=` or redirect to `/projects`.

## 3. Codex Must Inspect Before Deploy
The following high-risk files and routes were heavily modified during the Beta Execution sprint and manage data mutations or public access. Codex must verify their security rules and tenancy validation before giving the DEPLOY GO:
- `apps/quipsly/src/app/api/quipsly-assistant/route.ts` (Validates tool intents and ensures tenant isolation)
- `apps/quipsly/src/app/api/story-bible/actions/route.ts` (Commits ledger transactions to the database)
- `apps/web/src/app/library/actions.ts` (Handles `deleteSnippetAction` with owner validation)
- `apps/web/src/app/review/actions.ts` (Client-side db writes for scroll interactions)
- `apps/quipsly/src/app/api/episode-production/route.ts` (Handles public episode pipeline staging)
- `apps/quipsly/src/app/api/public/podcast/rss/[projectSlug]/route.ts` (Exposes dynamic RSS feeds publicly)
- `apps/quipsly/src/lib/studio/project-registry.ts` (Defines explicit Nest/project slug behavior)
- `apps/quipsly/src/app/(app)/projects/page.tsx` (Customer Nest onboarding hub)
- `apps/quipsly/src/app/api/episode-production/import-media/route.ts` (Requires explicit projectSlug for media imports and sync updates)
- `apps/quipsly/src/app/api/call-signaling/route.ts` (Requires explicit projectSlug for call rooms)

## 4. Pre-Deploy Release Captain Scan
Before deploying, the Release Captain should run `node scripts/scan-beta-blockers.mjs` and:
1. Verify no rows are "Blocked".
2. Verify all "Hidden/Internal-Only Routes" are appropriately feature-flagged or protected via middleware.
3. Review Section 2 for unresolved schema conflicts.

## 2026-06-05 Codex Nest hardening note

Beta readiness now treats the Nest as the required project boundary. New Nests seed an editable welcome/how-to document based on Nest kind, and recorder direct entry without `project` shows a recovery screen instead of silently using a fallback. Future agent passes should read `docs/quipsly/nest-project-system.md` before changing project routing, starter documents, recorder/editor project params, or publishing packet ownership.
