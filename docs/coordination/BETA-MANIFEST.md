# Quipsly Beta Manifest

**Purpose:** A single, scannable source of truth for the Release Captain (Codex) to determine deploy readiness, routing security, and lane status.

> **Instruction to Agents:** During Beta Prompt rounds, update your specific row in this manifest if your routes, readiness, or hidden status changes. Keep this table boringly reliable and easy to scan.

## 1. Beta Readiness & Route Exposure Registry

| Lane Name | Report File | Current Owner | Beta-Critical Routes | Hidden/Internal-Only Routes | Deploy Readiness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AG-Editor-Spine** | `editor-qa.md` | | `/create` | | Pending |
| **AG-Assistant** | `assistant-qa.md` | | | | Pending |
| **AG-Research-RAG** | `research-rag.md` | | | | Pending |
| **AG-Video-Editor** | `video-editor.md` | | `/editor` | | Pending |
| **AG-Storyboard** | `storyboard.md` | | | | Pending |
| **AG-Project-Management** | `project-management.md` | | | | Pending |
| **AG-Marketing** | `marketing-positioning.md` | | | | Pending |
| **AG-Patreon-Support** | `patreon-support.md` | | | | Pending |
| **AG-Mobile-Recording** | `mobile-recording.md` | | | | Pending |
| **AG-Agent-Coordination** | `agent-coordination.md` | Coordinator | None (Internal) | All Coordination Docs | **Ready** |
| **AG-HighGroundOdyssey** | `high-ground-odyssey.md` | | | | Pending |
| **AG-QuipLore** | `quiplore.md` | | `/hub`, `/lorelists/*` | | Pending |
| **AG-Fiction-Analysis** | `fiction-analysis.md` | | `/api/story-bible/*` | | **Ready** |
| **AG-Publishing-Integrations**| `publishing-integrations.md`| | `/api/public/podcast/rss` | | Pending |
| **AG-Scroll-Experiences** | `scroll-experiences.md` | | `/review/[storyboardId]` | | **Ready** |

## 2. Active Beta Blockers & Cross-Lane Risks
*(Agents: Log any critical cross-lane blockers, schema conflicts, or required approvals here)*

- **AG-Release-Captain**: Needs IAM permissions `run.services.get` (Cloud Run Admin) on `659427658635-compute@developer.gserviceaccount.com` to successfully deploy.

## 3. Pre-Deploy Release Captain Scan
Before deploying, the Release Captain should:
1. Verify no rows are "Blocked".
2. Verify all "Hidden/Internal-Only Routes" are appropriately feature-flagged or protected via middleware.
3. Review Section 2 for unresolved schema conflicts.
