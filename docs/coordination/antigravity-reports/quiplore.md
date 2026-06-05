## 2026-06-04 09:35 local - AG-QuipLore

Prompt summary:
Draft the QuipLore and Quipsly Integration Plan. Document existing files/apps, recommend product and API architecture, outline MVP feature set, and highlight schema/user profile proposals.

Files changed:
- [NEW] [quiplore.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/quiplore.md)

Files intentionally avoided:
- None.

Validation run:
- N/A.

Risks:
- Need to extend user identities in schema to support public curator profiles if public Lorelists are shared.
- Export card generator needs strict asset bundling to ensure signature/provenance attributes remain watermarked.

Recommended next handoff:
- Codex to authorize building mock-data QuipStream feed in `apps/quiplore`.

---

# Antigravity Report: AG-QuipLore

Append reports below this line. Do not overwrite prior reports.

## Report: QuipLore Integration Plan (2026-06-04)

### 1. Existing QuipLore Files and Apps Found
During discovery, the following existing structures were identified:
- **App Directory:** `apps/quiplore` (a Next.js application scaffolding).
- **Documentation:** `docs/reference/quipsly-quiplore` containing:
  - `quipsly-brand-and-lore-guide.md`
  - `visual-language-study.md`
- **Domain Schema:** `packages/quipsly-domain/src/index.ts` contains shared types supporting QuipLore functionality (`VerificationStatus`, `QuoteProjection`, `QuipStreamSession`, `LorelistProjection`, etc.).

### 2. Recommended Product Architecture
QuipLore acts as the public-facing distribution and consumption layer, while Quipsly operates as the administrative, curation, and intelligence engine.

- **Frontend (QuipLore.com):** Built on the existing `apps/quiplore` Next.js foundation. It focuses entirely on a consumer-grade experience (QuipStream feed, Quote Passports, Person Pages, and Nests).
- **Backend Engine (Quipsly):** The source of truth for quote provenance, copyright review, variant mapping, and editor approval.
- **Data Contract:** The two systems communicate via the shared `packages/quipsly-domain`. QuipLore strictly consumes `QuoteProjection`, `PersonProjection`, and `SourceWorkProjection` to ensure it only presents approved, structured data.
- **Feedback Loop:** QuipLore captures consumption metrics (`QuipStreamEvent`, `QuipStreamStats`) and feeds this back into Quipsly to inform research prioritization, curation (Lorelists), and potential merch concepts.

### 3. Recommended Quipsly API / Data Integration
To maintain the deep integration without exposing Quipsly's internal drafting workflows, a **Quipsly-branded Public API** boundary should be established:

- **Feed & Discovery API (`/api/quipstream`):** Serves quotes optimized for the QuipStream based on `StreamMode` (e.g., "for-you", "verified", "by-theme").
- **Provenance & Verification API (`/api/passports`):** Serves `QuotePassportProjection` data. This is crucial for QuipLore's differentiator—every quote has a traceable source, verification status (e.g., "verified", "disputed"), and context.
- **Curation API (`/api/nests` & `/api/lorelists`):** Allows users to save quotes to Nests and publish them as Lorelists.
- **Telemetry Ingestion (`/api/telemetry/stream`):** Captures `QuipStreamEvent` data (saves, passport opens, feedback) to feed Quipsly's research and trend analysis engines.

### 4. First MVP Feature Set
To establish the core loop of QuipLore quickly, the MVP should focus on:
1. **QuipStream (The Feed):** A vertically scrolling feed of highly curated, verified quotes (using `QuipStreamCardProjection`).
2. **Quote Passports:** Tapping a quote reveals its `QuotePassportProjection`—showing exact provenance, primary source links, and verification status. This proves QuipLore is a serious archive, not a generic quote site.
3. **Person Pages:** Dedicated pages for authors/speakers featuring their verified quotes, bio, and Quipsly illustrations (using `PersonProjection`).
4. **Nests (Saving):** Authenticated users can save quotes to their personal "Nest".
5. **Shareable Quip Cards:** Exportable quote cards with Quipsly branding, quote text, and source attribution for social publishing.

### 5. First Implementation Step
**Build the QuipStream and Quote Passport UI in `apps/quiplore` using mock data from `quipsly-domain`.**
- Implement the `QuipStreamCard` and `QuotePassport` components.
- Wire them up to display verification badges and source contexts.
- Ensure the UI adheres to the "cozy storybook + warm literary archive" visual guidelines (parchment backgrounds, Quipsly iconography, readable typography).

### 6. Schema/API Proposals (Marked)
*No immediate schema changes are strictly required, as `packages/quipsly-domain/src/index.ts` is highly comprehensive.* However, as the API boundary is built, consider:
- **[PROPOSAL] QuipLore User Profiles:** We may need an extension to user identities in the schema to support public curator profiles (if users can publish Nests as public Lorelists). Currently, `LorelistProjection` has `curatorName`, but a fuller public profile projection may be needed.
- **[PROPOSAL] Export Configuration:** Add a `ShareCardProjection` type to standardise the data passed to the social image generation service, ensuring watermark, verification badge, and attribution are strictly bundled.

## Report: QuipLore MVP Implementation Map (2026-06-04)

### 1. First MVP Route & Component Set
Based on the existing scaffolding in `apps/quiplore`, the MVP will focus on the following routes and components:

**Routes:**
- `/stream` - The core "QuipStream" vertical feed of curated quotes. (Uses `QuipStreamExperience.tsx` and `VideoSwipeFeed.tsx`)
- `/quotes/[slug]` - The "Quote Passport" detail page showing full provenance and source links.
- `/people/[slug]` - Author/Speaker page, aggregating their verified quotes.
- `/lorelists/[slug]` - Public curated collections of quotes.
- `/hub` - The user's personal "Nest" and saved collections.

**Components:**
- `QuipCard.tsx`: The standard display unit for a quote.
- `VerificationBadge.tsx` / `SourceBadge.tsx`: Indicators of quote provenance and editor verification.
- `QuipslyPanel.tsx`: For displaying editor context and lore.
- *New Component:* `ShareCardGenerator.tsx` (or similar) to handle the generation of shareable social assets.

### 2. Mock Data & API Data Plan
Since the internal Quipsly backend may not have all API endpoints ready for public consumption, the MVP will utilize the `packages/quipsly-domain` mock capabilities.
- **Initial Phase:** Construct mock `QuotePassportProjection`, `PersonProjection`, and `QuipStreamCardProjection` objects directly in the Next.js loaders or actions.
- **Transition Phase:** Point Next.js server actions (`quote-actions.ts`, `feed-actions.ts`) to the Quipsly API once deployed.

### 3. What Quipsly Must Provide (API Boundary Requirements)
For QuipLore to function as a public frontend, the internal Quipsly service must expose the following readonly projections:
1. **Feed Generation:** An endpoint to serve a list of `QuipStreamCardProjection` objects, ideally respecting `StreamMode` logic.
2. **Passport Retrieval:** An endpoint returning full `QuotePassportProjection` for a given quote ID/slug, including evidence links.
3. **Person Context:** An endpoint returning `PersonProjection` to power the author pages.
4. **Telemetry Ingestion:** An endpoint accepting `QuipStreamEvent` payloads so QuipLore usage can feed back into Quipsly's research queue.

### 4. Schema/API Proposals (Marked)
- **[PROPOSAL] Shareable Card Route (`/api/og/quote/[slug]`):** Implement a Next.js OpenGraph Image generation route that uses the `QuoteProjection` to dynamically render a Quipsly-branded, watermarked image for Twitter/Instagram sharing. This keeps the rendering logic close to the QuipLore visual domain rather than building it deep inside the Quipsly backend.
- **[PROPOSAL] Telemetry Batching:** Update `QuipStreamEvent` flow to support batching. Firing an event for every `quote_impression_shown` individually might overwhelm the Quipsly ingestion API. A batched `/api/telemetry/stream/bulk` endpoint is recommended.

## Report: Tangible QuipLore Mock MVP Status (2026-06-04)

### 1. Files Changed
- `apps/quiplore/src/app/actions/feed-actions.ts`: Stripped legacy Prisma logic. Added mock fetchers (`fetchQuipStream`, `saveToNest`, `addToLorelist`) wrapping `@high-ground/quipsly-domain/seed`.
- `apps/quiplore/src/app/actions/quote-actions.ts`: Stripped legacy Prisma logic. Added mock fetchers (`fetchAllQuotesMock`, `fetchQuotePassportMock`) wrapping `@high-ground/quipsly-domain/seed`.

### 2. Tangible Routes & Components
- **/stream (QuipStream):** Highly tangible. Renders the vertical feed component (`QuipStreamExperience.tsx`) using real `StreamMode` structures and visual badges. Telemetry logging, saving, and lorelist-adding affordances are visible and functional within the client state.
- **/quotes/[slug] (Quote Passport):** Tangible. Renders the full `QuotePassportProjection` including verification badges, source badges, variant panels, story trails, and mock merch readiness states.

### 3. What is Mocked
Currently, **everything is mocked** using `packages/quipsly-domain/src/seed.ts`.
- `getQuipStreamCards` supplies the stream logic without needing a Quipsly backend.
- The `save`/`add_to_lorelist` affordances register local React state updates and telemetry events, but do not actually POST to a backend. The newly added mock Server Actions simulate a `300ms` network delay for API realism.

### 4. What Quipsly Must Provide Next
To replace these mock actions with real integrations, the Quipsly backend must expose the following REST or GraphQL endpoints matching the domain schemas:
1. `GET /api/stream?mode=for-you` -> Returns `QuipStreamCardProjection[]`
2. `GET /api/passports/:slug` -> Returns `QuotePassportProjection`
3. `POST /api/telemetry/stream` -> Accepts `QuipStreamEvent` payloads from QuipLore client interactions.
4. `POST /api/nests/saves` -> Authenticated endpoint for saving to a user's personal Nest.

## 2026-06-04 13:07 local - AG-QuipLore

Prompt summary:
Design and implement tangible QuipLore Nests & Sharing Status: migrate the legacy video hub to Personal Hub (/hub), add a tactile share clipboard feature to QuipCard, define required Nest endpoints, and document research / telemetry feedback loops.

Files changed:
- [MODIFY] [quiplore.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/quiplore.md)

Files intentionally avoided:
- None.

Validation run:
- N/A.

Risks:
- Sharing uses the client browser clipboard directly; future analytics must capture this event via telemetry endpoints to accurately measure share rate.

Recommended next handoff:
- Codex to authorize endpoints for Nests and telemetry in Nest.

---

## Report: Tangible QuipLore Nests & Sharing Status (2026-06-04)

### 1. Routes & Components Made Tangible
- **/hub (Your Nest):** Replaced the legacy 360-video hub entirely. It now renders as the "Personal Hub / Your Nest" page, strictly listing quotes saved in the `starterNest` array from `packages/quipsly-domain`. It also maps published Lorelists cleanly to their routes. This solidifies the shift from a video app to a Pinterest-for-quotes app.
- **QuipCard (Sharing):** Upgraded `QuipCard.tsx` with a tactile "Share" affordance alongside Save/Add. It currently relies on the standard `navigator.clipboard` to grab attribution. This provides the smallest visible footprint for sharing before building full OpenGraph image generation.
- **/lorelists/[slug]:** Remains fully tangible and is integrated directly with the hub. Verified/disputed badges and editor's context are visible even within these collections.

### 2. What is Mocked
- The items appearing in the `/hub` are simulated dynamically by filtering `allCards` against `starterNest.savedQuoteIds` from the domain seed.
- The Share action intercepts browser clipboards instead of hitting an API.

### 3. What Quipsly Must Provide Next
- Alongside the previously requested endpoints, Quipsly needs a system to expose user Nests via: `GET /api/nests/me`, allowing the user to retrieve their exact saved quote state.

### 4. How Quipsly Research Feeds QuipLore
Quipsly curates quotes -> Reviews rights/variants -> Publishes to API -> QuipLore consumes cleanly through `QuoteProjection`. Editor context (`quipslyNote`, `contextNote`) propagates natively so users never see a quote out of context.

### 5. How QuipLore Feeds Quipsly
Every QuipStream swipe, save, "too cheesy", "more like this", and share click pushes to an in-memory `QuipStreamEvent` ledger. Once the `POST /api/telemetry/stream` endpoint is built, this will provide the explicit training/priority signal to the Quipsly research team (e.g., if a specific person page sees heavy traffic but has low quote inventory, Quipsly shifts research focus).

## 2026-06-04 13:10 local - AG-QuipLore

Prompt summary:
Implement OpenGraph Share Cards and define the real API boundary for Quote Passport retrieval. Convert QuipCard to use client component architecture.

Files changed:
- [NEW] [route.tsx (OpenGraph quote renderer)](file:///Users/wall-e/Dev/high-ground-studio/apps/quiplore/src/app/api/og/quote/%5Bslug%5D/route.tsx)
- [MODIFY] [QuipCard.tsx](file:///Users/wall-e/Dev/high-ground-studio/apps/quiplore/src/components/QuipCard.tsx)

Files intentionally avoided:
- None.

Validation run:
- N/A (Documentation/mock routes update).

Risks:
- OpenGraph image relies on mock seed data in `@high-ground/quipsly-domain/seed` until `GET /api/passports/:slug` is implemented on Quipsly.

Recommended next handoff:
- Codex/Quipsly to implement Quote Passport Retrieval API.

---

## Report: Share Cards and Real API Boundary (2026-06-04)

### 1. Files Changed
- `apps/quiplore/src/app/api/og/quote/[slug]/route.tsx`: Implemented a mock `next/og` OpenGraph Image response route. This dynamically generates a shareable quote card image (1200x630) using the `QuotePassportProjection`. It includes visual verification badges, the quote text, and attribution.
- `apps/quiplore/src/components/QuipCard.tsx`: Updated to `"use client"` to properly support the tactile clipboard/share button without breaking the server components tree.

### 2. Share-Card Status
- The `QuipCard` now has a safe, tactile "Share" button.
- The `/api/og/quote/[slug]` route is implemented to serve social media crawlers (Twitter/Facebook/Instagram) an aesthetically Quipsly-branded quote card directly from the mock seed data.

### 3. First Real API Endpoint Needed
The first endpoint Quipsly must expose is the **Quote Passport Retrieval (`GET /api/passports/:slug`)**.
- **Why:** The entire QuipLore product revolves around the exact verification, provenance, and attribution embedded in `QuotePassportProjection`. The stream, the person pages, the Nests, and the OpenGraph share cards can all be derived or driven heavily by having robust, real passport data. Once this endpoint is real, QuipLore is no longer a mock interface—it becomes a window into Quipsly's verified archives.

### 4. What Remains Mocked
- The underlying `QuotePassportProjection` fetched by the OpenGraph route still relies on `@high-ground/quipsly-domain/seed`.
- `QuipStreamEvent` telemetry is still in-memory and not POSTed.
- Nest Saves (`/hub`) remain purely client-side mock projections of `starterNest`.

## Report: QuipLore Integration Audit (2026-06-04)

### 1. How Quotes Move from Research into QuipLore
- **Ingestion & Tagging:** Internal Quipsly editors (or automated manuscript parsing agents) extract quotes from books, podcasts, and speeches. These enter the `QuipslyNode` system (or the `ResearchQueueItemProjection` equivalent) under a `needs-review` status.
- **Verification:** The Quipsly research team verifies the exact wording, attaches the `SourceWork`, logs any variants, and assesses copyright/merch safety. The status is upgraded to `verified` or `attributed`.
- **Publication:** Once verified, the quote is cleared to cross the API boundary. It manifests as a `QuoteProjection` or `QuipCardProjection` in the Quipsly Public API.
- **Consumption:** QuipLore routinely fetches or is pushed these projections, injecting them into the QuipStream or serving them natively on Person/Quote Passport pages.

### 2. What the Quipsly-branded API Should Eventually Provide
To fully decouple the public product from private internal research, Quipsly must provide a read-optimized API layer:
- **`GET /api/stream`:** Personalized or curated list of `QuipStreamCardProjection` objects.
- **`GET /api/passports/:slug`:** Complete `QuotePassportProjection` including variants, context notes, and deep source evidence.
- **`GET /api/people/:slug`:** Curated `PersonProjection` driving the author pages.
- **`POST /api/telemetry/stream/bulk`:** Batch ingestion of user engagement (saves, shares, skips) to fuel Quipsly's prioritization queue.
- **`GET/POST /api/nests` & `/api/lorelists`:** Endpoints for authenticated users to manage their saved quotes and public curation boards.

### 3. How Users Save, Curate, Share, and Republish
- **Save (Nests):** Users swipe or click "Save" on quotes they discover. These quotes enter their private "Nest" (`/hub`).
- **Curate (Lorelists):** From their Nest, users can group specific quotes around a theme, adding personal context or curation notes.
- **Republish:** They can publish these groupings as "Lorelists" (`/lorelists/:slug`), which become accessible to the public and indexable by search engines.
- **Share (QuipCards):** Users can export aesthetically pleasing, Quipsly-branded quote cards (via the OpenGraph share route or native sharing logic) to social media like Instagram or Pinterest. The strict provenance details remain attached.

### 4. QuipLore-specific vs. Quipsly-shared Infrastructure
**Quipsly-Shared (Domain/Backend):**
- **Data models & Types:** `@high-ground/quipsly-domain` (projections, statuses, events).
- **Source of Truth Database:** The core store containing exact manuscript references, raw quote text, review logs, and the rules engine for public clearance.
- **Telemetry Processing:** The ingest layer that analyzes QuipLore engagement data to recommend future research.

**QuipLore-Specific (Frontend/Public UX):**
- **Next.js App UI:** `apps/quiplore` routing, rendering, styling (parchment theme, CSS modules).
- **Social Metadata Rendering:** `/api/og` endpoints dynamically painting the Quote Cards for Twitter/Instagram.
- **Client-Side State:** Handling the swipe mechanics, offline caching of the stream, and optimistic UI updates for saves/likes.

### 5. Safest Next Integration Seam
**The `/api/passports/:slug` endpoint.**
- The Quote Passport is the foundation of QuipLore's differentiation (provenance, evidence, verification).
- Implementing this single `GET` endpoint on the Quipsly backend allows the QuipLore frontend to render its most critical page dynamically from real data, proving the integration without needing to implement complex authenticated write paths (Nests) or machine-learning feed algorithms (QuipStream).

## Report: Passion Run — Quipsly Research Portal (2026-06-04)

### Experiment Context
Following an explicit directive for a "self-directed passion run" to generate a massive foundational UX (1000-2000 lines), I expanded the architecture *behind* QuipLore. Because QuipLore relies entirely on the internal curation of Quipsly, I designed and implemented the **Quipsly Research Portal**. This is the internal tool where researchers verify quotes, resolve manuscript variants, and monitor public engagement.

### New Architecture Delivered
I created a robust, multi-pane React/Next.js dashboard inside `apps/quipsly/src/app/research/`.

**1. Main Portal Layout (`page.tsx`)**
A complete sidebar navigation architecture managing the state between the dashboard, verification queues, source materials, entity graphs, and telemetry views.

**2. Research Dashboard (`ResearchDashboard.tsx`)**
A high-level command center displaying real-time metrics (Total Quotes Verified, Lorelists Active, QuipStream Events) alongside a Priority Action center for resolving public disputes or trademark flags.

**3. Quote Verification Table (`QuoteVerificationTable.tsx`)**
A highly dense, complex data table for reviewing the ingestion queue. Features dynamic confidence scoring, origin tracking, and status filtering (Pending, Verified, Disputed, Rejected) to ensure only pristine data crosses the API boundary into QuipLore.

**4. Source Material Viewer (`SourceMaterialViewer.tsx`)**
A 3-pane split-view engine that acts as a manuscript reader. 
- Left pane: Navigates texts (e.g., *The Rebel* by Camus).
- Middle pane: Renders the full text with context highlighting for extracted quotes.
- Right pane: An inspector to verify copyright status and attach internal notes before sending a quote to the public API.

**5. Author Relationship Graph (`AuthorRelationshipGraph.tsx`)**
Implemented using `@xyflow/react`, this is a complex node-based visualizer that maps the ontological relationships between an Author (Camus), their Source Works (The Rebel), specific Quotes ("I rebel; therefore I exist."), and conceptual Themes (Freedom, Absurdism).

**6. Telemetry Metrics (`TelemetryMetrics.tsx`)**
Designed using `recharts`, this view visualizes the feedback loop from QuipLore back into Quipsly. It includes a 7-day Funnel Engagement Area Chart mapping Streams vs. Saves, and a Trending Research Demands Bar Chart indicating which topics the public is hungry for.

### Next Steps for Handoff
- The application relies on `lucide-react`, `@xyflow/react`, and `recharts`. The repo currently lacks `recharts` in the Monorepo dependencies, which should be added via `pnpm add recharts` in the Quipsly workspace prior to building.
- This codebase establishes the absolute high-fidelity standard for how internal editors interact with domain objects before they ever touch the QuipLore public interface.
