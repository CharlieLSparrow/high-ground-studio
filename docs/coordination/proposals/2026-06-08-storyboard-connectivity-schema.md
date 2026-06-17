# Proposal: Storyboard Connectivity Schema & Handoff Primitives

Date: 2026-06-08
Status: PROPOSED

## 1. Problem
Currently, `StudioStoryboard` operates as a project-scoped planning canvas without formal database connections to writing documents (manuscripts) or episode planning. Similarly, `StudioStoryboardFrame` can link to a video asset (`mediaClipId`), but lacks relations to manuscript text blocks (`StudioDocumentBlock`). This isolates the storyboard builder from Quipsly's core outline, writing spine, and podcast/video compilation workflows.

## 2. Proposed Changes
Introduce the following additive fields and relationships to the Prisma schema:

### A. Storyboard Tenancy & Alignment
Add optional linkages on the parent storyboard to connect with writing and production timelines:
* **`StudioStoryboard.documentId`** (`String?`): Optional foreign key to `StudioDocument`, representing the script or outline this storyboard visualizes.
* **`StudioStoryboard.episodeProductionId`** (`String?`): Optional foreign key to `StudioEpisodeProduction`, representing the video/podcast planning card.

```prisma
// Proposed additions to StudioStoryboard
model StudioStoryboard {
  // ... existing fields ...
  documentId          String?
  episodeProductionId String?

  document          StudioDocument?          @relation(fields: [documentId], references: [id], onDelete: SetNull)
  episodeProduction StudioEpisodeProduction? @relation(fields: [episodeProductionId], references: [id], onDelete: SetNull)

  @@index([documentId])
  @@index([episodeProductionId])
}
```

### B. Frame-Level Script Connectivity
Add a direct reference on the visual frame cell to anchor it to a specific paragraph, scene, or beat in the writing editor:
* **`StudioStoryboardFrame.documentBlockId`** (`String?`): Optional foreign key to `StudioDocumentBlock`. If the corresponding script beat changes, the frame UI can display a "Beat Modified / Draft out-of-sync" warning.

```prisma
// Proposed additions to StudioStoryboardFrame
model StudioStoryboardFrame {
  // ... existing fields ...
  documentBlockId String?

  documentBlock StudioDocumentBlock? @relation(fields: [documentBlockId], references: [id], onDelete: SetNull)

  @@index([documentBlockId])
}
```

## 3. Temporary Connectivity Bridge (Implemented)
Until this database migration is officially approved and run:
* **Storyboard-level Links**: Serialized and parsed as structured metadata headers within the storyboard's `description` field:
  * Format: `[LinkedDocument: doc_id] [LinkedEpisode: ep_id] Description text...`
* **Frame-level Block Links**: Serialized and parsed as structured metadata headers within the frame's `vfxNotes` field:
  * Format: `[Block: block_id] VFX notes text...`
* This allows full UI integration, validation, and layout testing *today* without requiring database migrations or breaking local schema environments.
