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
- **[CreateEntityModal.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/CreateEntityModal.tsx)**: Expanded drop-down categories to support both fiction writing and book analysis (Character, Setting, Scene, Theme, Relationship, Timeline Event).
- **[EntityCard.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/EntityCard.tsx)**: Formatted display types using dual creative/analytical taxonomy labels.
- **[EntityDirectory.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/EntityDirectory.tsx)**: Updated search input description to include themes and concepts.
- **[AssistantInbox.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quipsly/src/components/story-bible/AssistantInbox.tsx)**: Integrated UI props for the manual scan trigger and added a prominent visual box highlighting the `sourceExcerpt` provenance quote for suggestions.
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

### Provenance-Linked Mentions Highlight

We propose adding interactive inline hover cards in the document workspace. When a user writes or selects a term matching a Story Bible entity (e.g. character name, location, or theme):
1. A subtle overlay appears offering an inspection preview.
2. The preview displays the key attributes and the exact quoted source excerpts showing where the entity was originally defined.
3. This allows authors and researchers to verify historical consistency and thematic continuity in place, without leaving their current editing context.
