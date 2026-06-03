# Studio Storyboarding Architecture Plan

This document serves as the central coordination point for all agents working on the Quipsly Storyboarding tool.

## Product Vision
Build a storyboarding tool within the Quipsly Studio app that matches the core storyboarding features of Studio Binder. The tool integrates directly into the Quipsly content creation workflow, allowing users to map visual frames to script blocks, manage shot lists, and customize panel layouts.

## Architectural Boundaries

### Location
The storyboard tool lives within the main Quipsly app (`apps/quipsly`), accessible via the `StudioNav` as the **Storyboard Desk** (`/storyboard`).

### Data Model Strategy (Phase 2 & Beyond)
To ensure robust relation mapping and high portability to the `romance/web-platform`, the storyboarding tool relies on a dedicated database schema:

- **`StudioStoryboard`**: Represents the storyboard container. Belongs to a `StudioProject` and optionally links to a `StudioDocument` (script).
- **`StudioStoryboardFrame`**: Represents a single visual panel. Contains fields for `aspectRatio`, `cameraInfo`, `sceneNumber`, and `shotNumber`.
  - **Script Integration**: The frame optionally references a `StudioDocumentBlock` via `blockId`. This creates a direct bridge where the storyboard panel stays synchronized with the script text stored in TipTap.
  - **Image Generation**: The frame includes an `imagePrompt` field to support future AI generation pipelines, ensuring prompt history is stored durably in Postgres.

By keeping visual metadata (camera moves, aspect ratios) in Postgres and script text in TipTap, we maintain the "Quipsly way" of separating concerns while enabling cross-platform reuse.

### Image Sourcing
The prototype will support placeholder image URLs and empty canvas blocks. Future integrations may include an embedded canvas drawing tool (e.g., Fabric.js/Excalidraw) and Google Cloud Storage image uploads.

## Components

- **`storyboard-desk-client.tsx`**: The main workflow UI, handling layout toggles (e.g., 3-panel vs. 6-panel) and synchronization between the script view and the storyboard view.
- **`StoryboardFrame.tsx`**: A reusable component representing a single storyboard panel, including its image/canvas, shot number, description, and camera movement cues.
- **`StudioNav` Integration**: Added to `studio-nav.tsx` alongside the Tagging Desk, Writing Desk, and Video Editor.

## Agent Guidelines
1. **Do not modify the `prisma/schema.prisma` file** for storyboarding without updating this document and getting explicit user consent.
2. **Reuse existing UI components** (`StudioChip`, `cardClassName`, etc.) from `studio-ui.tsx` to maintain a consistent aesthetic.
3. If integrating with the TipTap editor, ensure changes do not break the existing collaboration features (Yjs/Hocuspocus).
