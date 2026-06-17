# Antigravity Report: Charlie's Private Comic Seed Integration (AG-Storyboard)

## 1. Importer Implementation & Scope

We have successfully refined and executed a secure, idempotent import script to load Charlie L. Sparrow's private storyboard seed data into the database.

* **Importer Script**: [import-comic-storyboard.ts](file:///Users/wall-e/Dev/high-ground-studio/scripts/import-comic-storyboard.ts)
* **Target JSON Seed**: [storyboard-seed.json](file:///Users/wall-e/Dev/high-ground-studio/content/private/fiction/charlie-l-sparrow/my-heart-is-a-junkyard-starship/issue-001-tenderness-of-unlawful-design/storyboard-seed.json)
* **Schema Definition**: [schema.prisma](file:///Users/wall-e/Dev/high-ground-studio/prisma/schema.prisma)

### Tenancy and Scoping Details
To protect Charlie's private intellectual property (`notPublic: true`, owner: `CharlieLSparrow@gmail.com`), the importer script creates private-scoped records in accordance with Quipsly's data protection posture:
1. **Private Workspace**: Identifies the owner by `ownerEmail` (`CharlieLSparrow@gmail.com`). Since `StudioWorkspace` does not contain a raw `ownerEmail` field in the database, we format a unique workspace slug: `charlielsparrow-gmail-com-workspace` and map the email to the `ownerLabel` field. The workspace is flagged as private (`isPrivate: true`).
2. **Private Project**: Creates a `StudioProject` under the sparrow workspace using the seed's `projectSlug` (`heartward-spiral-private-fiction`), designated as a `COMIC` format and flagged private.
3. **Private Storyboard**: Links a new `StudioStoryboard` named `"My Heart Is a Junkyard Starship: Tenderness of Unlawful Design"` under the project, configured with a `9:16` aspect ratio matching the phone-first webtoon format.
4. **No AI/Image Generation Cost Overhead**: The script inserts the text data and panel pacing details directly. It does **not** trigger any automatic AI image generation (preserving credits) and keeps the `imageUrl` as null (or preserves whatever custom image has already been uploaded/generated).

---

## 2. Idempotency & Duplicate Prevention

To ensure the importer can be run repeatedly without duplicating panels or overriding user-made edits, we implemented the following check-and-update logic:

* **Uniqueness Hook**: Each frame is identified by the combination of its parent `storyboardId` and its `frameNumber` (e.g., `"001"`, `"002"`, up to `"128"`).
* **Pre-existing Frame Updates**:
  - If a frame with the same `storyboardId` and `frameNumber` already exists, the script performs an **in-place update** of the text contents, shot sizes, camera directions, and notes.
  - **Image Preservation**: It preserves existing images by selecting `existingFrame.imageUrl || seedFrame.imageUrl || null`. If a creator has already generated an AI layout or uploaded a custom sketch, the importer will **never** overwrite it with a blank value.
* **New Frame Insertion**: If a frame does not exist, a new database record is created.

### Execution Results
* **First Run**: Successfully created the workspace, project, storyboard, and imported 128 frames.
* **Second Run**: Re-evaluated the workspace and project, verified all 128 frames, created `0` new frames, and updated the `128` existing frames correctly, demonstrating perfect idempotency.

---

## 3. UI Scalability: Displaying 128-Panel Vertical Comic Projects

Rendering 128 panels with high-resolution image previews, narration text, and editing tools in a single webpage can lead to severe DOM bloat, scroll fatigue, and memory crashes. We recommend implementing the following UX patterns in the `Storyboard` builder interface:

1. **Virtual Windowing (DOM Recycling)**
   - **Mechanism**: Use React Virtualization (e.g., `react-window` or `react-virtualized`) to only render the frames currently inside (or near) the viewport.
   - **Benefit**: Keeps the active DOM node count below ~10-15 frames regardless of the project's size, preventing browser lag and maintaining a buttery-smooth 60fps scrolling experience.
2. **Segmented Act/Scene Views (Narrative Grouping)**
   - **Mechanism**: Group frames inside the interface by their narrative act or scene boundaries (derived from the seed's `actId` metadata, e.g. `act-01`, `act-02`).
   - **Benefit**: Instead of displaying one gargantuan list, allow users to collapse/expand acts or view one act at a time via a top-level tab bar.
3. **Outline Sidebar & Mini-Map Navigation**
   - **Mechanism**: Display a collapsible sidebar containing compact thumbnail strips or numerical indices (e.g., `Frame 001`, `Frame 002`) similar to Figma's layers panel or Google Slides' sidebar.
   - **Benefit**: Allows the user to jump instantly to Panel 120 without scroll fatigue.
4. **Lazy Loading of Visual Assets**
   - **Mechanism**: Enable native browser lazy loading (`loading="lazy"`) and intersection observers to only fetch panel images when they approach the viewport.

---

## 4. Recommended Schema Improvements

To support rich comic and scrollytelling formats in future iterations, we recommend adding the following database fields and relationships:

1. **`actId` / `sceneId` Columns on `StudioStoryboardFrame`**
   - **Currently**: Act identifiers (like `act-01`) must be crammed into `vfxNotes` or unstructured metadata objects.
   - **Improvement**: Adding an explicit `actId` or relation to a `Scene` model would allow the DB to index and retrieve frames grouped by their narrative milestones naturally.
2. **`frameType` Enum**
   - **Fields**: `VIDEO_SHOT` | `COMIC_PANEL` | `COURSE_SLIDE`
   - **Improvement**: Helps the client layout engines render appropriate tooltips (e.g., camera movements for movies vs. speech bubble data for comics).
3. **Structured `SpeechBubble` Table or JSON Field**
   - **Currently**: Dialogue is a single flat text field.
   - **Improvement**: Comics require multiple text balloons per panel, each with coordinates (X, Y), balloon shape (speech, whisper, scream), and speaker labels. A structured array field or relation would allow rendering dynamic text overlays in the Scroll preview tool.
