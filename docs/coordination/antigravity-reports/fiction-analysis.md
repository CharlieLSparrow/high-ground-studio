# Fiction & Book Analysis Beta Integration Report

This report outlines the hardening, security scoping, and dual-purpose branding updates made to the Story Bible and study corpus workflows for the Quipsly Patreon Beta launch.

## 1. Exact Changed Files

We updated both frontend UI panels and backend endpoints to fully implement project scoping, strict organizational tenancy, manual scan triggers, and provenance-first highlighting:

### Backend API Layers
- **[route.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/story-bible/entities/route.ts)**: Integrated `requireProjectAccess` checks for GET and POST endpoints.
- **[route.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/story-bible/entities/%5Bid%5D/route.ts)**: Protected specific entity GET, PATCH, and DELETE operations using project access validation.
- **[route.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/story-bible/actions/route.ts)**: Hardened ledger query and approval actions; added support for transactionally committing `PROPOSE_ENTITY_UPDATE` changes.
- **[route.ts](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/app/api/quipsly-assistant/route.ts)**: Registered `PROPOSE_ENTITY` and `PROPOSE_ENTITY_UPDATE` as safe tool intents, enforced active tenancy validation, aligned LLM prompt generation for provenance-first entity scans, and enabled database persistence for proposed actions.

### Frontend Components
- **[CreateEntityModal.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/CreateEntityModal.tsx)**: Expanded drop-down categories to support both fiction writing and book analysis.
- **[EntityCard.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/EntityCard.tsx)**: [UPDATED IN SPRINT] Overhauled to include a tabbed interface ("Overview" and "Living Notes"), supporting rich editable attributes that sync dynamically to the backend. Added deep provenance tracking event dispatchers for manuscript highlighting.
- **[EntityDirectory.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/EntityDirectory.tsx)**: [UPDATED IN SPRINT] Rewritten as a premium masonry/grid dashboard featuring entity-type pill filters, glassmorphism hovers, and color-coded tag badges.
- **[AssistantInbox.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/AssistantInbox.tsx)**: [UPDATED IN SPRINT] Upgraded to an "Intelligence Inbox" with dynamic high-risk alert styling, an expandable developer payload view, and glowing provenance excerpt boxes.
- **[StoryBibleSidebar.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/StoryBibleSidebar.tsx)**: Configured props to receive active document and visible block data, and implemented the scan execution request handler.
- **[QuipslyAssistantSidebar.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/QuipslyAssistantSidebar.tsx)**: Rebranded the panel tab to `"Story Bible & Study"` and passed active workspace details down to the nested sidebar.

---

## 2. Walled-Garden Safety Notes

To ensure high-fidelity containment of fiction and book analysis details, we established several layers of architectural and conceptual walls:

- **Tenancy Scoping**: Every Story Bible and assistant endpoint now retrieves the corresponding project from the database using its unique identifier and runs `requireProjectAccess(project.slug, action)`. This validates the current user's authenticated session and organization membership, throwing `403 Forbidden` for any cross-project attempts.
- **Strict Data Isolation**: Entities are strictly keyed to a specific `projectId` and query schemas explicitly filter records by the active project. Book analysis from one Nest can never leak into the HGO manuscript or any other user's projects.
- **No Automatic Scans**: Background document scraping is disabled. AI extractions are only executed when the user clicks the explicit "Scan Section" button in the Inbox tab, preventing token cost overruns and unexpected context pollution.
- **Human-in-the-Loop Commit**: All assistant suggestions are registered in the `StudioAssistantAction` database table with a `proposed` status. No writes to the manuscript or entity registry occur automatically. The user must review the proposed action and click "Approve" to commit it.

---

## 3. Next Proposed Fiction/Book Analysis Feature

### Provenance-Linked Mentions Highlight (Completed in Sprint 4)

We successfully implemented interactive inline provenance highlights in the document workspace safely and without mutating the Yjs manuscript.
1. The Story Bible dispatches a global `quipsly:highlight-mention` event when a user hovers over an entity's extracted quote.
2. The `Editor.tsx` component actively listens for this event.
3. The editor resolves the TipTap virtual DOM node that contains the snippet using `editor.state.doc.descendants` and `editor.view.nodeDOM()`.
4. It visually highlights the physical DOM block by temporarily injecting `bg-flare/10` and `ring-flare` CSS classes.
5. It smoothly scrolls the manuscript block into view if it is off-screen.
6. A safety timeout (3 seconds) and a dedicated `quipsly:clear-highlight` listener ensure the highlights automatically vanish and never get stuck.

This gives authors an immediate, high-fidelity visualization of thematic continuity in place, without risking any automated text mutation.

---

## 2026-06-05 Research Proposal - AG-Fiction-Analysis

### Research Sources & Examples Reviewed
- **Campfire & World Anvil:** Provide encyclopedic, modular worldbuilding templates (species, magic systems). Powerful but can detach authors from direct manuscript drafting if too detached.
- **Plottr:** Focuses intensely on visual structural plotting (e.g., Save the Cat, Hero's Journey) rather than deep lore database management.
- **LivingWriter & Aeon Timeline:** Lead in providing robust, pre-built structural templates (like *Romancing the Beat*) and stringent chronological consistency tracking, which is vital for romance and series continuity.
- **Sudowrite:** Leads the AI-assisted drafting space, using a community-driven "Story Bible" feature to maintain consistency across AI generations and utilizing uncensored models tuned for specific emotional/romantic beats.
- **Literary Analysis Workflows:** Rely on tracking thematic occurrences, rhetorical devices, and character arcs across large corpuses, structurally similar to worldbuilding but strictly analytical.

### Current Fiction/Analysis State Summary
- **Entity Storage:** The Quipsly Story Bible currently relies on `StoryEntity` records strictly scoped to a `projectId`, utilizing a dynamic `attributes` JSON for flexible metadata (e.g., source excerpts, living notes).
- **Security & Scoping:** Strict backend validation (`requireProjectAccess`) guarantees that entities cannot bleed into unrelated projects or teams.
- **UI & UX:** The UI features a tabbed "Entity Card" (Overview & Living Notes), a masonry-style "Entity Directory", and a high-fidelity "Intelligence Inbox" for manually triggered AI extractions.
- **Editor Integration:** `Editor.tsx` now listens to `quipsly:highlight-mention` events to visually map Story Bible provenance excerpts onto the manuscript via DOM manipulation without mutating the underlying Yjs document.

### Recommended Product Model
1. **The "Integrated Ledger" Model:** Quipsly should avoid becoming a detached "wiki" product (like World Anvil). The Story Bible should remain a contextual sidebar that acts as an "overlay" on the writing process, providing immediate insights and continuity checks where the author is actually writing.
2. **Dual-Lens Design:** The flexible `attributes` schema allows the exact same backend to serve both fiction writing (tracking *character motivations* and *magic systems*) and book analysis (tracking *thematic occurrences* and *rhetorical devices*). Quipsly should dynamically adjust its terminology and templates based on the user's defined project context.
3. **Private Romance Compartmentalization:** For romance/adult content, we must maintain strict multi-tenant isolation. Furthermore, Quipsly should consider allowing specific Story Bible entities or draft blocks to be marked as "Vaulted" (locally encrypted) to guarantee privacy from standard team collaborators if desired.

### Proposed Next Implementation Pass
**Feature:** Structural Beat Sheet & Timeline Overlay
Generative drafting is allowed, including freeform AI-written rough material. Quipsly's advantage is that drafts can sit beside structure, continuity, character maps, and source/canon context. The safest next implementation step is still to introduce Plottr/Aeon-style visual structure directly into the Story Bible sidebar so drafts have a strong canon scaffold.
1. Add a "Timeline & Beats" view to the Story Bible panel.
2. Allow users to map existing Story Entities (scenes, characters) to structural beats (e.g., Inciting Incident, Midpoint, Dark Night of the Soul).
3. Synchronize this timeline with `Editor.tsx` so clicking a structural beat smoothly scrolls the manuscript to the corresponding section.

### Files Likely Touched
- `apps/quipsly/src/components/story-bible/StoryBibleSidebar.tsx` (Add new Timeline Tab)
- `apps/quipsly/src/components/story-bible/TimelineView.tsx` (New Component)
- `apps/quipsly/src/app/api/story-bible/entities/route.ts` (Extend creation logic to support "Beat" or "Event" entity types)
- `apps/quipsly/src/components/Editor.tsx` (Add intersection observers to track which beat is active)

### Privacy/Safety Risks
- **Data Leakage:** Syncing beats to editor scroll positions could inadvertently expose plot structure to users who shouldn't have access. Tenancy must cover the metadata.
- **Model Censorship Risk:** Standard foundational models often false-flag romance/adult structural analysis. We must ensure prompt routing for these specific lane requests utilizes an uncensored or explicitly tuned model.

### Questions for Codex/Product Owner
1. **Templates:** Should Quipsly offer pre-built templates for specific genres (e.g., *Romancing the Beat*) out of the box, or should we rely on users building their own structures via the flexible `attributes` system?
2. **Model Routing:** Are we comfortable using our standard LLM models for private romance/adult analysis, or do we need to route those specific requests to uncensored models to prevent safety rejections?
3. **Data Model:** For the "Timeline Overlay" pass, should we store "Beats" as a distinct Prisma model, or just leverage a new `type: "beat"` within the existing `StoryEntity` table?

---

## 2026-06-05 Marginalia Beta Sprint - AG-Fiction-Analysis

### 1. What changed
To adopt Codex's new `source-aware` foundation, I upgraded the provenance-linked highlight system. The Story Bible no longer relies solely on raw `snippet` strings for manuscript overlays. It now constructs formal `SourceSelector` objects (specifically `createTextQuoteSelector`) from `@high-ground/quipsly-domain/source-aware` and dispatches them via a new `quipsly:source-overlay-preview` event. The `Editor.tsx` component was updated to parse these formal selectors, rendering the visual highlight while maintaining backward compatibility with the legacy event.

### 2. Files touched
- `apps/quipsly/src/components/story-bible/EntityCard.tsx`
- `apps/quipsly/src/components/Editor.tsx`

### 3. Risks or follow-up needed
- The hardcoded `"current-document"` ID in `createTextQuoteSelector` assumes the Story Bible overlay always targets the active document editor. If the workspace moves to a multi-document layout, we will need to pass the real `documentId` context to the Story Bible Sidebar so it can target cross-document selectors accurately.

### 4. Recommendation for Codex
**Keep**. The changes are purely additive, strictly adhere to the new `quipsly-domain` contracts, and do not mutate the database schema or the Yjs document state.
