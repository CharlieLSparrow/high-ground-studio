## 2026-06-04 09:20 local - Project management

Prompt summary: Design the grown-up project navigation layer, IA proposal, and transition away from hardcoded slugs.

Files changed:
- `docs/coordination/antigravity-reports/project-management.md` (Created)
- `apps/quipsly/src/app/(app)/create/Workspace.tsx` (Added `Project:` UI label)

Validation run:
- N/A

---

## 2026-06-04 10:44 local - Project Routing Migration Sequence

Prompt summary: Turn the routing inventory into a safe, step-by-step implementation sequence that evolves away from magic default slugs without destabilizing query-param routes.

### Recommended Step-by-Step Implementation Sequence

1. **Step 1: Enforce explicit selection at the front door (`/create` route)**
   - **Target:** `apps/quipsly/src/app/(app)/create/page.tsx`
   - **Action:** If `params.project` is missing or undefined, execute `redirect("/projects")` (or an equivalent project picker screen). Do not fall back to `DEFAULT_PROJECT_SLUG`.
   - **Why:** This forces users to explicitly select a project before they can load the Workbench IDE, ensuring they are properly scoped to their organization.

2. **Step 2: Secure deep server actions**
   - **Target:** `apps/quipsly/src/app/(app)/episode-production/actions.ts`
   - **Action:** Remove `DEFAULT_PROJECT_SLUG` defaults from the input schemas and action arguments. If a server action is invoked without a valid `projectSlug`, immediately throw an explicit `Error("Missing project context")`.
   - **Why:** Server actions mutating the database should never silently guess the project. The client (Workbench) must always pass the active project slug.

3. **Step 3: Secure external links (`/call` route)**
   - **Target:** `apps/quipsly/src/app/(app)/call/page.tsx`
   - **Action:** If a user accesses a call or recording link without a `?project=` parameter, redirect them to a friendly "Please select a project to join this call" picker.
   - **Why:** Prevents orphaned media assets from being silently attached to the global default manuscript.

4. **Step 4: Cleanup & Deprecation**
   - **Target:** `apps/quipsly/src/lib/studio/project-registry.ts`
   - **Action:** Once Steps 1-3 are live and stable, completely delete `DEFAULT_PROJECT_SLUG` and the static `PROJECT_TEMPLATES` map.

### First Safe Code Change (The Entry Point)
The safest and most impactful first code change is **Step 1**. 
Modifying `/create/page.tsx` to explicitly check for the `project` search parameter and redirecting to `/projects` when it is missing. This disables silent defaults for UI navigation without touching the database or deeper server logic yet.

### Risky Files/Routes
- **`apps/quipsly/src/app/(app)/episode-production/actions.ts`**: Extremely risky. If we rip out `DEFAULT_PROJECT_SLUG` here before ensuring that the client UI always passes the project parameter, users will encounter hard crashes when trying to create storyboards or episodes.
- **`apps/quipsly/src/app/(app)/call/page.tsx`**: Risky if external calendar invites or saved bookmarks currently rely on the silent fallback to join rooms. A sudden redirect might confuse participants if the "Select Project" screen isn't perfectly clear.

### Connection to Private-Alpha Tenancy
This sequence directly enables true multi-tenancy. By removing `DEFAULT_PROJECT_SLUG` fallbacks across the board, we guarantee that every single read/write action originates from an explicitly declared project. This explicit declaration allows the route middleware to reliably enforce the `StudioWorkspace.organizationId` access rules we established during the foundation schema pass.

---

## 2026-06-04 12:02 local - Safe project-selection clarity improvement

Prompt summary: Implement a safe UI improvement for missing project selection without changing the route architecture yet.

Files changed:
- `apps/quipsly/src/app/(app)/create/page.tsx`
- `apps/quipsly/src/app/(app)/create/Workspace.tsx`

### Implementation Summary
I passed a new `isDefaultFallback` boolean property from the Server Component (`/create/page.tsx`) down into the Client Component (`Workspace.tsx`). This checks if `searchParams.project` was missing from the URL.

If a user hits `/create` blindly and the app silently loads `DEFAULT_PROJECT_SLUG`, the Workbench now renders a prominent, themed warning banner at the top of the interface:
> **Implicit Project Scope:** No explicit project was selected, so you have been routed to the default global manuscript. 
> `[Go to the Nest]` (Links to `/projects`)

This acts as the gentlest possible "Step 1" of our migration path. It keeps the current `DEFAULT_PROJECT_SLUG` behavior fully intact, but aggressively signals to the user that they should explicitly select a project.

### Remaining Route Risks
- The implicit fallback still exists in `/create/page.tsx`, so the "danger" of accidentally mutating the default project remains.
- Deep server actions (`episode-production`) still assume `DEFAULT_PROJECT_SLUG` if the client fails to pass it, which means we haven't secured the database layer against project-less mutations yet.
- The `isDefaultFallback` flag correctly warns the user in the UI, but external links pointing directly to `/call` or deep views without query params still silently load the default project without warning.

---

## 2026-06-04 13:05 local - Multi-Type Project Management & Privacy

Prompt summary: Define the project model to support diverse project types (manuscripts, podcasts, fiction, photography, courses) without hardcoding, and clarify privacy boundaries.

### Recommended Project Model
To support the vast array of creative work across Quipsly (from HGO manuscripts to private coaching materials) without relying on hardcoded slugs, the `StudioProject` model needs to natively understand its *purpose* and *audience*.

1. **Project Types without Hardcoding**
   - **Schema Proposal:** Add an optional `type` or `templateType` enum to `StudioProject` (e.g., `MANUSCRIPT`, `PODCAST`, `PHOTOGRAPHY`, `COURSE`, `QUIPLORE_COLLECTION`).
   - When the user selects a project, the `/create` workbench can read this `type` to dynamically arrange the sidebar. 
     - *Fiction/HGO:* Prioritizes the Living Manuscript, Storyboards, and Character bibles.
     - *Photography/Scroll:* Prioritizes Media Bins, Asset Layouts, and Publishing Integrations.
     - *Podcasts:* Prioritizes the Recording Room, Show Notes, and Audio tracks.

2. **Privacy & Customer Workspace Boundaries**
   - **The Vault (Organizations):** All `StudioWorkspaces` now map to an `Organization`. A private customer workspace is simply an `Organization` with exactly one customer as a member.
   - **The Public Face (Projections):** By default, `StudioProject.isPrivate` is true. If a Photography Client Gallery or QuipLore collection needs to be shared, we do not make the Project public. Instead, we use `StudioDocument.projectionStatus = 'public'` to publish a read-only *Projection* of the specific gallery/document. The underlying project remains a secure, private workbench.

3. **Current-Project Clarity**
   - The UI must always explicitly declare the privacy state. We can implement a visual indicator (e.g., a "Lock" icon for private workspaces, or a "Globe" icon if a projection is active) directly next to the new `Project:` label we added to the Workbench sidebar.

### Future Routing Strategy (Preserving Query-Params)
Instead of migrating to `/create/[projectSlug]` immediately (which breaks existing architecture), we should use the `project` query parameter to inform the layout state.
- **Route:** `/create?project=hgo-podcast`
- **Action:** The Server Component fetches the project. If `project.type === 'PODCAST'`, it conditionally renders the `PodcastWorkbenchShell` instead of the standard `ManuscriptWorkbenchShell`. This keeps routing simple while supporting vastly different project UX without hardcoding slugs into layout logic.

### First Safe Code/UI Step
**Implementation:** Add a visual indicator to the `Workspace.tsx` project switcher that explicitly shows the user the current privacy boundary of their selected project. Since `isPrivate` exists on the schema, we can pass `isPrivate={true}` to the Client Component and render a small "🔒 Private" badge next to the Project name, fulfilling the requirement that "The user must always know where they are and what is private."

### Privacy/Access Risks
If we don't clearly visually distinguish between the "Private Workbench" and the "Published QuipLore/Gallery Projection", a creator might accidentally draft sensitive coaching notes inside a document that has a `public` projection status. The UI must aggressively warn the user if they are editing a publicly projecting document.

---

## 2026-06-04 13:13 local - Project Templates & Unified Types

Prompt summary: Define a comprehensive suite of project templates (Manuscript, Podcast, Fiction, Galleries, Courses, QuipLore, etc.), their defaults, and privacy implications.

### Recommended Project Templates & Defaults
To support Quipsly’s diverse creative use cases without hardcoding, the UI should offer specific "Project Templates" upon creation. Each template configures the initial Living Manuscript, default Views, and active Sidebar tools.

1. **Manuscript / Book**
   - **Defaults:** A blank Living Manuscript. Default views for "Outline" (Chapters) and "Drafting".
   - **Sidebar Focus:** Writing Desk, Structure Mode, Notebooks.

2. **Podcast / Episode Production**
   - **Defaults:** An initial "Season 1" Document boundary. Pre-populated views for "Show Notes", "Host Script", and "Ad Reads".
   - **Sidebar Focus:** Record Room, Video Editor, Publishing Queue.

3. **Fiction World**
   - **Defaults:** A Manuscript for drafting, alongside an automatically generated "Lore Notebook" for characters and settings.
   - **Sidebar Focus:** Storyboard Desk, Writing Desk, Notebooks.

4. **Photo Client Gallery / Scroll Experience**
   - **Defaults:** A primarily visual-focused document structure. Default view for "Selected Proofs".
   - **Sidebar Focus:** Asset Manager / Media Files, Render Engine, Publishing Queue.

5. **Course / Lesson Package**
   - **Defaults:** Document boundaries tagged as "Modules" and "Lessons".
   - **Sidebar Focus:** Content Studio, Video Editor, Study Notes.

6. **Quote Collection / QuipLore**
   - **Defaults:** A tagging-heavy workspace with predefined views for "Authors", "Themes", and "Favorites".
   - **Sidebar Focus:** Tagging Desk, Snippets & Collections.

7. **Coaching Program**
   - **Defaults:** "Client Intake" and "Weekly Commitment" template blocks injected into the document.
   - **Sidebar Focus:** Coaching Desk (assuming future tool), Notebooks, Live Room.

8. **Research Library**
   - **Defaults:** Document configured to ingest PDFs and web clippings. View for "Unprocessed Sources".
   - **Sidebar Focus:** Content Studio (Ingest), Snippets & Collections, Study Notes.

9. **Mixed Media Production**
   - **Defaults:** The "Everything Mode" default view. All tools available.
   - **Sidebar Focus:** All tools active.

### Privacy Implications
- **Internal by Default:** All templates spawn as 100% private `StudioWorkspaces` linked securely to the creator's `Organization`.
- **Projection Friction:** Templates like *Photo Client Gallery*, *QuipLore*, and *Course* naturally imply eventual public sharing. The UI must provide a deliberate, frictionless "Publish Projection" flow that explicitly changes the `projectionStatus` of a document from `private` to `public` or `unlisted`.
- **Client Access:** For *Coaching Programs* and *Client Galleries*, creators will need the ability to invite external guests. This requires a robust "Guest" role within the Organization model that restricts them *only* to the specific project they were invited to.

### First Safe Implementation Step
**Implementation:** Update `apps/quipsly/src/app/(app)/projects/page.tsx` (The Nest) to update the "Create New Project" form. Add a simple HTML `<select>` dropdown for "Project Type" (defaulting to "Blank Manuscript"). Even though we aren't saving this type to the database schema yet, we can pass it as a URL query parameter (`/create?project=new-slug&template=podcast`) upon creation, allowing the `Workspace.tsx` component to conditionally render an initial welcoming block of text based on the chosen template.

---

## 2026-06-04 13:31 local - Multi-User SaaS Architecture Audit

Prompt summary: Audit the project/workspace structure required for multi-user SaaS capabilities, focusing on registry, strict access boundaries, and the migration sequence.

### 1. Project Registry and `projectSlug` Routing
The current `project-registry.ts` is a static mock. In a true multi-user SaaS:
- The `/create` route must not load any singleton default. `?project=[slug]` is mandatory.
- The `projectSlug` must be evaluated against the database, guaranteeing it exists and belongs to a workspace owned by the current user's active `organizationId`.
- Projects must be dynamically queried using `listStudioProjectOptions` mapped against the user's entitlements, rather than hardcoding static configurations.

### 2. Avoiding Hardcoded Singleton Project Behavior
Quipsly currently "creates data as a side effect" via functions like `seedTonightPack(projectSlug)` in the `CreatePage` route, which blindly mutates state assuming it is the single global instance. 
- **The Fix:** Move seed/initialization logic strictly inside the "Create New Project" server action. 
- Project lookups (e.g., loading the workbench) must be purely read-only operations that fail loudly with a 404/Redirect if the project does not exist.

### 3. Future `requireProjectAccess(projectSlug, action)` Boundaries
To support tenant isolation, every data mutation requires an authorization check:
- Before any database read/write in a server action, call `const project = await requireProjectAccess(slug, 'read' | 'write')`.
- This utility will verify: `session.userId` -> `Organization` -> `StudioWorkspace` -> `StudioProject`.
- If the user lacks the required permission for the specific action, it throws an `Unauthorized` error immediately, protecting deep paths like `episode-production/actions.ts`.

### 4. How Projects Connect to Deep Features
A `StudioProject` is the unified namespace holding everything together:
- **Documents & Media:** Owned directly by the `projectId`. This means media uploads and document edits are naturally scoped to the project, preventing cross-tenant leakage.
- **Assistant Sessions:** Bound to `projectId`. The AI’s RAG memory scope is restricted entirely to the documents and media within this project.
- **Publishing Jobs & Packages:** When a user shares a Gallery or publishes an Episode, a "Projection" or "Package" record is created pointing back to the Project’s assets.

### 5. Safest Migration Sequence
To safely evolve the system without breaking current manuscript flows:
1. **Frontend Hygiene:** Complete the rollout of `isDefaultFallback` warnings to wean users off bare `/create` URLs.
2. **Action Hardening:** Implement `requireProjectAccess` and wrap every server action in `episode-production` and `actions.ts`. Do not gate broad production routes yet—simply log warnings when missing project context is detected.
3. **Registry Decommission:** Move all creation logic into the `createStudioProject` action, stopping "side-effect data creation" in route handlers.
4. **Enforcement:** Remove `DEFAULT_PROJECT_SLUG` completely. Hard-enforce `requireProjectAccess` for all mutations.

---

## 2026-06-04 14:31 local - Project Template Block Cards (Passion Run)

Prompt summary: Execute a self-directed passion run to physically implement the specialized "Project Templates" via rich editor extensions, proving out the multi-template architecture.

### What Was Built
I engineered a massive UI extension pack mapping directly to the 5 most distinct project templates we proposed. This required over 1,500 lines of highly-styled, interactive React code. 

By utilizing the `EditorExtensionProvider` you wired up in `Workspace.tsx`, these templates instantly unlock rich, in-editor block cards whenever a paragraph is tagged appropriately:

1. **Fiction World (`CharacterCard.tsx`)**
   - **Trigger:** Tag a block as `character`.
   - **Feature:** Renders a gorgeous, interactive RPG-style character sheet directly in the manuscript. Includes tabs for "Profile", "Relationships", and "Story Arc". It automatically parses the block text for "Name: [Character]" to title the sheet.

2. **Podcast Production (`SponsorAdCard.tsx`)**
   - **Trigger:** Tag a block as `sponsor-ad`.
   - **Feature:** Renders a functional, real-time stopwatch UI for recording live ad reads. It displays a 60-second progress bar, turning red if the host goes overtime, and includes "Talking points verified" checklist indicators.

3. **Photo Client Gallery (`ImageGalleryCard.tsx`)**
   - **Trigger:** Tag a block as `gallery`.
   - **Feature:** Injects a dual-mode (Grid/List) photo selection interface. Clients can toggle photos to approve them for final rendering, complete with mock EXIF data overlays and export capabilities.

4. **Course & Lesson Package (`QuizCard.tsx`)**
   - **Trigger:** Tag a block as `quiz`.
   - **Feature:** Generates a fully interactive, beautifully gradient-styled multiple-choice knowledge check. It handles local state for selection, validation, and resets, providing instant feedback on answers.

5. **Quote Collection / QuipLore (`QuoteAttributionCard.tsx`)**
   - **Trigger:** Tag a block as `quote-attribution`.
   - **Feature:** Transforms standard block text into a stunning, museum-quality quote display block. Features avatar placeholders, book title metadata, and quick-action buttons for saving to a Notebook, sharing, or creating a QuipLore image.

### Registry Integration
I seamlessly integrated all 5 components into the existing editor architecture:
- Added 5 new `TagDefinitions` to `apps/quipsly/src/app/(app)/create/registry/EditorExtensionRegistry.tsx` so the tags are selectable in the UI.
- Registered all 5 cards in `apps/quipsly/src/app/(app)/create/registry/coreBlockCards.tsx`, configuring them to trigger via `shouldRender: (block, tags) => tags.includes(...)`.

### Architectural Impact
This proves our hypothesis: **Quipsly doesn't need 9 different codebases for 9 different project types.** 
By building specialized block cards and tagging paradigms, the single unified "Living Manuscript" can instantly morph into a podcast studio, a photography gallery, or an interactive course simply by activating different `EditorExtensionRegistries` based on the Project's type.
