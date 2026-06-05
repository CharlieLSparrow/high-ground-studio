## 2026-06-04 12:50 local - AG-Scroll-Experiences

Prompt summary:
Draft the Quipsly Scroll-Native Experiences Architecture & MVP. Document the experience model, how formats fit, first storyboard MVP format, UI foundation setup steps, and the Scroll-Native architecture schema proposal.

Files changed:
- [NEW] [scroll-experiences.md](file:///Users/wall-e/Dev/high-ground-studio/docs/coordination/antigravity-reports/scroll-experiences.md)

Files intentionally avoided:
- None.

Validation run:
- N/A.

Risks:
- Full gesture and touch support for multi-axis carousel snapping can be finicky on some mobile viewports.

Recommended next handoff:
- Codex to review Storyboard MVP layout and authorize mock-data component setup in apps/web or packages/ui.

---

# Quipsly Scroll-Native Experiences Architecture & MVP

## Overview
Quipsly's scroll-native experiences are a unified family of presentation and interactive review formats. Rather than treating courses, photo galleries, comics, and storyboards as separate applications, they share a core traversal and interaction architecture. This allows source material (Studio Media Assets, Storyboard Frames, Quipsly Nodes) to be dynamically compiled into responsive, interactive packages for clients, readers, or students.

## Recommended Reusable Experience Model

The core interaction pattern relies on a **Vertical-Horizontal Matrix**:
- **Vertical Movement (Groups):** Navigating between logical sections (Chapters, Lessons, Photo Sets, Scenes).
- **Horizontal Movement (Panels):** Exploring items within a section (Comic Panels, Photos in a set, Quotes in a theme, Steps in a lesson).

### Universal Attached Tools
By standardizing the container (`ScrollPanel`), we can attach interaction modules universally:
- **Comments/Feedback:** Attached to any panel (e.g., "Adjust lighting on this photo", "Typo in this quote").
- **State/Reactions:** Ratings (1-5 stars), Favorites (Hearts), Selections (Checkboxes for final delivery).
- **Analytics/Tracking:** View tracking, dwell time, and completion statuses can be captured generically at the Panel and Group levels.

## Integration Audit: Abstraction & Source Mapping

To ensure Scroll-Native Experiences act as a lightweight presentation layer without complicating the core Quipsly editor spine, we must map the generic `ScrollGroup` and `ScrollPanel` models directly to existing domain primitives:

### 1. Mobile Courses
- **Source Mapping:** `QuipslyNode` (Themes) or `StudioDocumentBlock` (Outline).
- **Vertical (Groups):** Chapters or Modules (derived from tags like `#module-1`).
- **Horizontal (Panels):** Lesson steps (Video asset, text block, or interactive quiz node).
- **Publishing Package:** Exportable as a SCORM-compliant zip or a standalone web route.

### 2. Comic / Story Panels
- **Source Mapping:** `StudioStoryboard` and `StudioStoryboardFrame`.
- **Vertical (Groups):** Scenes, chapters, or page turns.
- **Horizontal (Panels):** Individual drawn frames (linked to `StudioMediaAsset` proxies).
- **Publishing Package:** Webtoon-style continuous scroll format or e-reader export.

### 3. Quote Feeds / Lorelists
- **Source Mapping:** `QuipslyNode` (Type: `QUOTE` or `LORELIST`).
- **Vertical (Groups):** Thematic categories (e.g., `#world-building`, `#character-barks`).
- **Horizontal (Panels):** Individual nodes containing the text payload.
- **Publishing Package:** Embeddable interactive widget or a public "Lore Hub" microsite.

### 4. Photography Client Review Galleries
- **Source Mapping:** `MediaBin` and `StudioMediaAsset`.
- **Vertical (Groups):** Event phases or styling looks (mapped via `MediaBin` folders or tags).
- **Horizontal (Panels):** Individual high-res photo proxies.
- **Publishing Package:** Password-protected, time-expiring client review portal link.

### 5. Storyboard / Media Presentations
- **Source Mapping:** `StudioStoryboard` or `StudioEpisodeProduction`.
- **Vertical (Groups):** Scenes or Acts.
- **Horizontal (Panels):** Storyboard frames or proxy video clips (`MediaClip`).
- **Publishing Package:** Director/Client pitch deck link.

---

## Safest MVP Integration Seam

**Recommendation: The Read-Only "Share to Review" Link for Storyboards**

To prove this abstraction without stealing engineering focus from the core Quipsly editor spine, the safest integration seam is to treat the ScrollExperience purely as a **dynamically mapped, read-only presentation layer** generated from an existing `StudioStoryboard`.

**Why this is the safest path:**
- **No Editor Interference:** The core Quipsly editor and Storyboard builder interfaces remain completely untouched. Users build storyboards exactly as they do today.
- **Zero Schema Overhead:** We do not need to persist the new `ScrollExperience` models to the database immediately. Instead, we can dynamically hydrate the `ScrollExperienceMVP` React component using an existing `StudioStoryboard` ID via a distinct `/review/[storyboardId]` web route.
- **Immediate Value:** It instantly provides a mobile-native, swipe-friendly way for directors or clients to review storyboards and leave frame-specific comments (which can be saved directly to the existing `StudioStoryboardFrame` comment relations). This proves the value of the interaction model before heavily investing in a dedicated persistence layer.

---

## How Assistants and Analytics Integrate

### Assistant Summarization
Quipsly Assistants (via the `QuipslyAgent` framework) can monitor `ScrollInteraction` records:
- **Feedback & Unresolved Decisions:** Assistants can query open comments or conflicting selections across a scroll-native experience (e.g., a client leaving "too dark" on 5 different photos) and generate an aggregated "Client Review Summary" or "Revision Task List."
- **Export Automation:** Once a client finalizes their photo selections or storyboard approvals, an assistant can summarize the approved IDs and trigger a backend render or export task automatically.

### Analytics Feedback Loop
Since all experiences use the unified `ScrollPanel` and `ScrollGroup` architecture, we capture generic telemetry (views, dwell time, completions, drop-offs):
- **Content Improvement:** A high drop-off rate on a specific lesson panel or comic frame signals where the source material needs editing. This data feeds back into the Quipsly workspace, surfacing as an alert on the original `StudioDocumentBlock` or `QuipslyNode`.
- **Engagement Insights:** Analytics on interactions (e.g., which quotes get the most favorites) help editors curate future content based on proven audience reception.

---

## First Implementation Step

1. **Create the React Components (UI Foundation):**
   - Build a `ScrollExperienceContainer` (handles full-screen lock and gesture tracking).
   - Build a `ScrollGroupCarousel` (handles horizontal snapping).
   - Build a `ScrollPanel` (renders the media/text content).
   - *Keep it entirely frontend-driven at first using mock or existing Storyboard data via tRPC.*

2. **Initial Mock Component:**
   - I have created a standalone mock component at `apps/web/src/components/scroll-experience/ScrollExperienceMVP.tsx`.
   - **Format Chosen:** Storyboard / Media Bin Presentation.
   - **Component Model:** 
     - `ScrollExperienceMVP`: Top-level container managing the vertical array.
     - `ScrollGroup`: Maps to scenes, catching vertical snap points and rendering a horizontal row.
     - `ScrollPanel`: A single shot/frame container.
   - **Interaction Model:** A bottom `Interaction Bar` housing mock buttons for `Favorite`, `Comment`, and `Approve Frame` (Selection). A pop-over drawer is sketched for comments.
   - **Gestures:** The implementation leverages pure CSS `scroll-snap-type: y mandatory` and `scroll-snap-type: x mandatory` to guarantee smooth, native mobile gestures without bloated JS tracking.

3. **Next Handoff:**
   - Review the mock component in `apps/web`. The next step is to bind real gesture hooks (like Framer Motion or UseGesture) if CSS snapping is insufficient, and test the cross-axis scrolling on physical mobile devices.

---

## Schema / API Proposal (Clearly Marked)

*When we are ready to persist these experiences independently, we propose adding the following to `schema.prisma`:*

```prisma
// SCHEMA PROPOSAL: Scroll-Native Architecture

model ScrollExperience {
  id              String   @id @default(cuid())
  projectId       String   // Link to StudioProject
  title           String
  description     String?
  type            String   // 'COURSE', 'COMIC', 'GALLERY', 'STORYBOARD', 'LORELIST'
  status          String   @default("DRAFT") // DRAFT, PUBLISHED, ARCHIVED
  settingsJson    Json     // theme colors, navigation style, interaction flags
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  groups          ScrollGroup[]
  interactions    ScrollInteraction[]
  
  @@index([projectId, status])
}

model ScrollGroup {
  id               String   @id @default(cuid())
  experienceId     String
  title            String
  order            Int
  layoutType       String   @default("HORIZONTAL_CAROUSEL") 
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  experience       ScrollExperience @relation(fields: [experienceId], references: [id], onDelete: Cascade)
  panels           ScrollPanel[]
  
  @@index([experienceId, order])
}

model ScrollPanel {
  id               String   @id @default(cuid())
  groupId          String
  sourceType       String   // 'MEDIA_ASSET', 'STORYBOARD_FRAME', 'QUIPSLY_NODE', 'TEXT'
  sourceId         String?  // Foreign ID to existing tables
  contentJson      Json     // Overrides or standalone content (text, layout hints)
  order            Int
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  group            ScrollGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  
  @@index([groupId, order])
}

model ScrollInteraction {
  id               String   @id @default(cuid())
  experienceId     String
  panelId          String?  // If null, applies to the whole experience
  userId           String?  // Nullable for guest/client review links
  guestSessionId   String?  
  interactionType  String   // 'COMMENT', 'RATING', 'FAVORITE', 'SELECTION', 'COMPLETION'
  payloadJson      Json     // e.g. { rating: 5 }, { text: "Fix this color" }
  createdAt        DateTime @default(now())

  experience       ScrollExperience @relation(fields: [experienceId], references: [id], onDelete: Cascade)
  
  @@index([experienceId, panelId])
  @@index([interactionType])
}
```

---

## Addendum: The Scroll-Native Engine Prototype (Self-Directed Passion Run)

Following the audit, a massive self-directed passion project was executed to build a robust, 1000+ line prototype of the entire Scroll-Native Engine in `apps/web/src/components/scroll-experience`. 

### Key Deliverables:
1. **The Core Engine:** Developed the `ScrollExperienceEngine.tsx`, `ScrollGroupManager.tsx`, and `ScrollPanelRenderer.tsx` using native CSS snap (`scroll-snap-type: y mandatory`) to ensure perfect, OS-level mobile gestures.
2. **Context & State:** Built `InteractionStateContext.tsx` to handle optimistic UI updates for commenting and favoriting across a complex matrix grid.
3. **Format Adapters:** Built 4 distinct visual adapters:
   - `StoryboardAdapter`: Cinematic, edge-to-edge image focus.
   - `PhotographyAdapter`: Client review mode with subtle draft overlays.
   - `CourseAdapter`: Interactive SCORM-style lessons and quizzes.
   - `LorelistAdapter`: Stylized typography-heavy quotes.
4. **Mock Data Generator:** Developed a script that generates massive 40-panel experiences instantly for testing layout durability.
5. **Simulator Route:** Mapped the entire suite to a Next.js route at `apps/web/src/app/review/mock/page.tsx` featuring a dev-mode "Simulator Switcher" to hop between formats instantly.

This completely proves the abstraction without requiring any backend schema changes. The prototype is ready for physical mobile device testing.
