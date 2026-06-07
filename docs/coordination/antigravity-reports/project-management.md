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

By building specialized block cards and tagging paradigms, the single unified "Living Manuscript" can instantly morph into a podcast studio, a photography gallery, or an interactive course simply by activating different `EditorExtensionRegistries` based on the Project's type.

---

## 2026-06-05 15:15 local - Beta Posture: Prompt 1 (PLAN ONLY)

**Target:** The single highest-leverage beta pass for AG-Project-Management.

### 1. Current Beta Readiness
- **Nests & Workspaces (DB):** Keep but adjust (Schemas exist, backfills run, multi-tenancy is modeled).
- **`?project=` Routing:** Keep (It works and safely separates contexts).
- **`/projects` Dashboard:** Keep but adjust (Needs to serve as the required entry point instead of a side door).
- **`DEFAULT_PROJECT_SLUG` fallbacks:** HIDE FROM BETA / DESTROY. This is highly unsafe for real multi-tenant usage.

### 2. Biggest Beta Blocker
The global `DEFAULT_PROJECT_SLUG` fallback. If a new Patreon beta user navigates to `/create` or clicks a deep link without a `?project=` parameter, the app currently falls back to `HGO_PROJECT_SLUG` and silently mutates a global document via `seedTonightPack()`. This completely breaks tenant isolation and will result in 50 beta testers simultaneously rewriting the same global manuscript.

### 3. Highest-Leverage "Do Pass" (Prompt 2 Recommendation)
**True Tenancy Onboarding & Default Slug Extinction.**
We must completely rip out `DEFAULT_PROJECT_SLUG` across the app. In its place, we implement explicit redirects and a "Starter Nest" onboarding flow. If a user logs in and has 0 Nests, we automatically provision their first private Nest (e.g., "My First Manuscript") and redirect them there. If they hit `/create` without a slug, we redirect them to `/projects` (The Nest) to explicitly choose a project.

### 4. Files/Routes/Models to Touch
- `apps/quipsly/src/app/(app)/create/page.tsx` (Remove fallback, add redirect to `/projects`)
- `apps/quipsly/src/app/(app)/projects/page.tsx` (Implement the "0 Nests -> Auto-create Starter Nest" flow)
- `apps/quipsly/src/lib/studio/project-registry.ts` (Remove `DEFAULT_PROJECT_SLUG` completely)
- `apps/quipsly/src/app/(app)/episode-production/actions.ts` & API routes (Remove fallback, ensure errors bubble up if no project context is provided).

### 5. Risks and Rollback Plan
- **Risk:** Existing hardcoded bookmarks or test scripts that rely on `/create` without parameters will break (404 or redirect).
- **Risk:** If the onboarding auto-creation logic fails, a new user might be stuck in a loop.
- **Rollback:** We can `git revert` the removal of `DEFAULT_PROJECT_SLUG` to immediately restore singleton global behavior if the true tenancy proves too buggy during initial alpha testing.

### 6. What Should Be Owner-Only/Internal for Beta
- The ability to edit the global `HGO_PROJECT_SLUG` or view other users' organizations. (Covered by `requireProjectAccess` checks, but we must ensure regular Beta users only see their own `organizationId` scopes).

### 7. What a Beta User Should Be Able to Successfully Do After This Pass
A Patreon supporter will be able to log in, see a personalized "My First Nest" waiting for them, open it, and type in a Living Manuscript that is 100% cryptographically isolated to their user account. If they try to hack the URL and remove the `?project=` parameter, they are safely booted back to the Nest dashboard.

### 8. Dependencies
Requires Codex/Product Owner approval to officially deprecate the `DEFAULT_PROJECT_SLUG` constant, which will break any hardcoded QA flows relying on the global singleton.

### Recommended Prompt 2 for my lane:
Execute the "True Tenancy Onboarding & Default Slug Extinction" pass.
1. Delete `DEFAULT_PROJECT_SLUG` from `project-registry.ts` and remove it from all `/create`, `episode-production`, and `/call` route fallbacks.
2. Update `/create/page.tsx` to immediately `redirect("/projects")` if `searchParams.project` is missing.
3. Update `/projects/page.tsx`: If the user has 0 projects, automatically execute `createStudioProject` to provision "My First Nest" and redirect them into it, establishing a seamless onboarding flow. Ensure no side-effect data creation happens outside of explicit project boundaries.

---

## 2026-06-05 15:35 local - Beta Posture: Prompt 3 (IMPLEMENTATION)

**Target:** Execute the Prompt 2 plan safely across the `AG-Project-Management` lane without breaking existing infrastructure or running into multi-user data bleeding.

### What Was Changed
- **`src/lib/studio/project-registry.ts`:**
  - Changed `ensureStudioProjectDocument` to `lookupStudioProjectDocument`. The helper now strictly looks up the Project and Document and throws an exception if they don't exist. This permanently removes the "global side-effect creation" that was plaguing the codebase.
  - Updated `createStudioProject` to return a `{ project, workspace, document }` wrapper, allowing explicit creations to function smoothly.
- **`src/app/(app)/create/page.tsx`:**
  - Removed the `DEFAULT_PROJECT_SLUG` fallback. If a user arrives without a `?project=` query param, they are instantly redirected back to `/projects`.
- **`src/app/(app)/create/actions.ts` & `src/app/(app)/episode-production/actions.ts`:**
  - Migrated from `ensureStudioProjectDocument` to `lookupStudioProjectDocument` to prevent accidental project/document creation via background action calls.
- **`src/app/(app)/projects/page.tsx`:**
  - Cleaned the UI layout, removed the "Open default Nest" shortcut, and built a dedicated "Welcome to your Studio" empty state (`<Folder>` icon) to safely guide brand new Patreon beta users toward choosing their first Nest shape instead of forcing an automatic creation loop.
- **`src/app/api/call-signaling/route.ts`:**
  - Wrapped the `POST` handler in a `try...catch` block. Because `ensureProduction` calls `lookupStudioProjectDocument`, an invalid project slug will now safely return a 500 JSON payload instead of crashing the Next.js process or blindly executing against a hallucinated global state.

### Risks & What Remains
- **Risk:** Existing hardcoded test URLs or API calls using `/create` (without a query param) will hit a redirect loop or fail.
- **Risk:** The API routes (`/api/episode-production/*`) now fail (500) if a media ingest or timeline sync is pushed to a project that hasn't been explicitly created via `createStudioProject`. This is technically *safe* behavior, but might surface errors in some client SDKs that previously relied on auto-creation.
- **What Remains:** We are fundamentally ready for a multi-user beta within the Quipsly workspace boundaries. To transition from "Beta" to a "Grown-Up SaaS," we need to finish the integration of `StudioOrganization` explicitly across `project-registry.ts` and ensure billing/stripe checks run before a new Nest can be instantiated.

---

## 2026-06-05 15:45 local - Beta Posture: Prompt 4 (IMPLEMENTATION SPRINT 4)

**Target:** Stabilizing the Nest entry flow after removing unsafe default fallback behavior.

### What Was Changed
- **`src/app/(app)/create/page.tsx`:** Updated the redirect when `?project=` is missing to append `?fallback=true` so the hub can display a context-aware message.
- **`src/app/(app)/projects/page.tsx`:**
  - Added support for reading `searchParams.fallback`.
  - Displayed a very obvious, friendly UI warning banner if `fallback=true` so users understand why they were bounced out of their document.
  - Added an explicit "Open Owner Manuscript" shortcut at the top of the hub that points to `high-ground-odyssey` if the user is in development or has `QUIPSLY_OWNER_OVERRIDE` set, preventing the primary owner from getting locked out.
- **`src/app/(app)/nests/page.tsx`:** Verified the route alias correctly proxies `ProjectsHub`.
- **`docs/coordination/BETA-MANIFEST.md`:** Marked `AG-Project-Management` as `Ready`.

### Final Nest Entry Flow
1. Users arrive at `/projects` (or `/nests`).
2. If they have 0 Nests, the "Welcome to your Studio" state naturally directs them to the creation form.
3. If they arrive at `/create` without a project, they are redirected to `/projects?fallback=true` and see a warning banner asking them to choose a workspace.
4. The owner can easily click "Open Owner Manuscript" to jump straight into their primary document.

### Known Broken Legacy URLs
- `/create` (no params) -> correctly broken and redirected.
- Hardcoded fetch requests to `/api/episode-production/*` without `projectSlug` payload -> correctly broken and safely returns 500 without side effects.

---

## 2026-06-05 Research Proposal - AG-Project-Management

### Research sources/examples reviewed
- **Notion**: Utilizes top-level pages as pseudo-projects/workspaces. The boundary between "personal" and "shared" is fluid, which is flexible but often leads to organizational chaos.
- **Figma**: Uses a strict Organization > Team > Project > File hierarchy. This is excellent for bounding context and access control cleanly, preventing "where does this belong" fatigue.
- **Linear/Jira**: "Projects" have deadlines, issues, and specific lifecycles. They are fundamentally task-oriented rather than content-oriented.
- **Patreon/Community SaaS**: Typically drops users into a gated community feed, followed by a separate area for personal creation. Best-in-class onboarding avoids long tooltips and instead drops users into an interactive, pre-populated template (e.g., a "Welcome to Quipsly" starter document).

### Current Nest system summary
In Quipsly, the `StudioWorkspace` is the tenancy boundary, and the `StudioProject` (user-facing: "Nest") is the conceptual boundary for a body of work.
- A Nest binds together text (Documents), assets (MediaBins, ShootDays), logic (StoryBibleActions), and output (EpisodeProductions, Storyboards).
- The recent implementation sprints safely gated Nest creation and explicitly blocked side-effect-driven global fallback projects, establishing a clean bedrock for beta users.

### Beta readiness risks
1. **Tenancy Leaks in Assistant Context:** We must ensure the AI assistant queries are strictly bounded by `projectId` or `workspaceId` so one beta user cannot accidentally query another user's research material.
2. **"Blank Slate" Syndrome:** We removed the automatic creation of a default manuscript, which is great for safety, but now new users hit an empty state. If they don't know what shape to choose, they may churn before writing a word.
3. **Study vs. Writing Confusion:** Currently, these are conceptual distincts. If they look identical in the UI without a clear hierarchy (e.g., a sidebar grouping "Sources" vs "Drafts"), users will jumble them.

### Answers to Focus Questions
1. **Is “Nest” the right beta-facing project unit and how should we explain it?**
   Yes. "Project" feels like Jira (deadline/task-oriented), and "Workspace" feels like Slack (corporate silo). "Nest" aligns perfectly with Quipsly's brand as a creative companion. Explanation: *“Nests hold the work. Documents hold the text. Keep your drafts, research, and assistant context warm in one place.”*
2. **How should Writing documents and Study documents coexist inside one Nest?**
   They belong to the same `StudioProject`, but the UI must visually separate them—perhaps a sidebar divided into "Library/Sources" (Study Docs) and "Drafts/Manuscripts" (Writing Docs). The assistant is the bridge, reading from the Library to help write the Draft.
3. **What should first-run onboarding look like for Patreon beta users?**
   Upon first login, if the user has 0 Nests, the system should intercept them and auto-provision a "My First Nest" (using the Mixed or Writing template) pre-populated with a fully interactive "How to use Quipsly" document.
4. **What routes should be public, beta-gated, owner-only, or hidden?**
   - *Public:* Published packets (`/api/public/*`), external review links (`/review/[id]`).
   - *Beta-gated:* `/projects`, `/create`, `/editor`, media endpoints.
   - *Owner-only:* Analytics, global schema management, `high-ground-odyssey` bypasses.
   - *Hidden:* `quipsly-dev-lab`, experimental feature flag routes.
5. **What must be fixed before real external users touch this?**
   - The interactive Starter Document needs to actually exist and be seeded into new Nests.
   - The Assistant/RAG queries must have hardcoded `where: { projectId }` limits verified in code.

### Proposed next implementation pass
1. **The Starter Seed Pass:** Implement `seedStarterNest()` logic that triggers automatically for brand new users, injecting an interactive tutorial document.
2. **Sidebar Separation Pass:** Update the `/create` workspace sidebar to visually group `StudioDocuments` into "Library" (study) and "Drafts" (writing) based on document metadata/tags.
3. **Assistant Bounds Audit:** Grep the AI context retrieval paths to guarantee `projectId` isolation.

### Files likely touched
- `src/app/(app)/create/starterDocuments.ts`
- `src/app/(app)/projects/page.tsx`
- `src/lib/studio/project-registry.ts`
- `src/app/(app)/create/Workspace.tsx`

### Schema/routing proposals
- **Schema:** Consider adding a `documentType` enum (`WRITING` | `STUDY`) to `StudioDocument` (currently we just use tags or project kinds, but explicit column typing would make UI grouping trivial).

### Questions for Codex/Product Owner
1. Do you want the "Starter Document" to be dynamic (generated by the AI greeting them) or a static hardcoded markdown payload?
2. Should a Patreon beta user be restricted to a certain number of Nests during the initial beta phase?

---

## 2026-06-05 Marginalia Beta Sprint - AG-Project-Management

### What I changed
Implemented the **Starter Seed Pass** directly into the project registry to cure "Blank Slate" syndrome for new beta users. When `createStudioProject` is called, it now immediately provisions the first `StudioDocument` with the corresponding interactive tutorial blocks (and their tags/spans) from `starterDocuments.ts`, matching the requested `StudioNestKind`. This ensures that when a beta user creates a "Writing Nest" or "Study Nest", they are instantly dropped into a living document explaining how to use it, rather than staring at a terrifyingly empty white screen.

### Files touched
- `apps/quipsly/src/lib/studio/project-registry.ts`

### Risks or follow-up needed
- **Risk:** `createStudioProject` is now doing a lot more heavy lifting (nested db writes for blocks, tags, and tagged spans) within the creation lifecycle. If the `StudioPrismaClient` types aren't fully synchronized, or if the db transaction times out, project creation could partially fail (though the try/catch around seeding ensures the project itself will still return).
- **Follow-up:** Check if `seedTonightPack` in `actions.ts` needs to be refactored or simplified now that `createStudioProject` reliably seeds starter blocks out-of-the-box.

### Recommendation for Codex
**Keep and Validate:** This directly satisfies the beta onboarding requirement of preventing confusing dead ends. Please validate the `StudioPrismaClient` type definitions and ensure the `try/catch` seed block performs reliably under production constraints.

---

## 2026-06-05 local - AG-Project-Management / Codex Reconciliation Pass

Prompt summary: Codex-owned aggressive project/Nest reconciliation pass to make the new-customer entry path explicit and remove remaining unsafe default-project seams from high-risk write routes.

Files changed:
- `apps/quipsly/src/lib/studio/project-registry.ts`
- `apps/quipsly/src/app/(app)/create/projectConfig.ts`
- `apps/quipsly/src/app/(app)/projects/page.tsx`
- `apps/quipsly/src/app/(app)/create/page.tsx`
- `apps/quipsly/src/app/(app)/create/Workspace.tsx`
- `apps/quipsly/src/app/(app)/episode-production/actions.ts`
- `apps/quipsly/src/app/api/episode-production/route.ts`
- `apps/quipsly/src/app/api/episode-production/import-media/route.ts`
- `apps/quipsly/src/app/api/episode-production/ai-ingest/route.ts`
- `apps/quipsly/src/app/api/episode-production/media-analysis-jobs/route.ts`
- `apps/quipsly/src/app/api/episode-production/transcript-assist/route.ts`
- `apps/quipsly/src/app/api/call-signaling/route.ts`
- `apps/quipsly/src/app/(app)/call/page.tsx`
- `apps/quipsly/src/app/(app)/editor/SyncDeck.tsx`
- `docs/coordination/BETA-MANIFEST.md`

What changed:
- `DEFAULT_PROJECT_SLUG` is no longer the High Ground Odyssey manuscript. HGO is now exposed as `OWNER_PROJECT_SLUG`, while the legacy default points at the dev lab only for old internal/dev code paths.
- Blank project slugs no longer normalize into a real customer manuscript. New helpers distinguish blank normalization, resolved fallback behavior, and required explicit project slugs.
- `/projects` is now a clearer Nest onboarding hub with a three-step mental model and template cards for writing, study, production, research, fiction, course, gallery, and mixed Nests.
- The owner shortcut now points to the canonical `high-ground-odyssey-manuscript` slug.
- `/create` no-project import cleanup removed stale default imports.
- Workspace links no longer synthesize a default project if the prop is missing.
- Episode production, import-media, AI ingest, media analysis jobs, transcript assist, and call signaling now require explicit project/Nest context before writing.
- Call and SyncDeck client surfaces now avoid defaulting to a hidden project when the route is missing project context.
- `BETA-MANIFEST.md` now flags the Project/Nest seam and high-risk write routes for Codex review before deploy.

Risks:
- Recorder still has a local/dev fallback path if opened directly without project context. API writes are protected, but the UI should be cleaned in a future pass.
- Some legacy links that rely on `/create` or episode production without `projectSlug` will now fail or redirect by design.
- No build/typecheck was run in this pass.

Recommended next handoff:
- Codex should inspect the touched high-risk files, then run the controlled validation sequence before handing DEPLOY GO to AG-Release-Captain.

## Codex Beta Readiness Integration Pass - 2026-06-05

Codex strengthened the Nest/project system for beta entry:

- New Nests now seed kind-specific editable welcome documents in the manuscript editor instead of generic blank manuscript blocks.
- Writing, Study, Production, Research, Fiction, Course, Gallery, and Mixed Nests each teach their own workflow from inside the editor.
- The project hub now tells beta users that the first document is an editable how-to surface.
- The recorder direct-entry path no longer silently falls back to the dev project when `project` is missing; it shows a choose-a-Nest recovery screen.
- Added `docs/quipsly/nest-project-system.md` as the product rule for future project/document/media work.

Carry-forward rule: routes and APIs may offer explicit owner shortcuts, but they must not silently write beta-user data to `quipsly-dev-lab` or the High Ground Odyssey manuscript.
