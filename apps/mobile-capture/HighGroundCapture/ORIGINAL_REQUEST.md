# Original User Request

## 2026-06-06T16:56:04Z

Integrate the Quipsly non-destructive video editor and native 360-degree video reframing workflows into the iOS `HighGroundCapture` app.

Working directory: `/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture`
Integrity mode: development

## Requirements

### R1. Non-Destructive "Toggle" Editor Paradigm
Design and implement the foundation for an editor interface that strictly follows the Quipsly paradigm: editing is about deciding what to "turn on and off" rather than destroying clips. The timeline must visually display both the active media and the deactivated (edited out) media side-by-side, making AI-suggested edits and manual revisions seamless. Do not use a pre-built UI package if it forces a traditional destructive NLE paradigm.

### R2. Native 360 Video Reframing Engine
Build a native iOS video processing pipeline (using AVFoundation and/or Metal) that can take an equirectangular 360-degree video source and render a flat, standard rectilinear view. The engine must support programmatic keyframes for Pan (Yaw), Tilt (Pitch), and Zoom (FOV).

### R3. Architectural Decision & Integration Foundation
Research and decide whether to build the editor UI purely in native Swift/SwiftUI or to use a Hybrid approach (embedding the web NLE via WKWebView with native rendering hooks). Once decided, implement the core scaffolding and data models necessary to bridge the timeline state to the iOS rendering engine.

## Acceptance Criteria

### Editor Paradigm
- [ ] The app includes a functional UI prototype or data model demonstrating "active" vs "deactivated" clip states without removing underlying source data.
- [ ] No third-party UI libraries are used that enforce destructive clip deletion.

### 360 Reframing Engine
- [ ] The iOS codebase contains an AVFoundation `AVVideoCompositing` class or Metal shader specifically designed to project equirectangular video to rectilinear.
- [ ] The pipeline accepts dynamic keyframe inputs (time, yaw, pitch, fov) to drive the virtual camera.

### Architecture & Integration
- [ ] The codebase contains a clear architectural document (e.g., `EditorArchitecture.md` in the iOS folder) outlining the chosen UI path (Native vs Hybrid) and its justification.
- [ ] If Hybrid, a `WKScriptMessageHandler` bridge is established for timeline state sync. If Native, Swift models representing the timeline state (Clips, Transcript, Transforms) are implemented.

## Follow-up — 2026-06-06T17:00:51Z

URGENT CONTEXT FROM CLOUD EDITOR AGENT:

The cloud editor agent (Conversation a96ab92a-787c-4207-b6bf-fd88c8938a0f) just finished implementing the non-destructive timeline engine and the 360-degree keyframing architecture on the web NLE side using Remotion.

We need to make sure the iOS `HighGroundCapture` implementation aligns with the data structures we're using in the cloud NLE so they can seamlessly share timelines.

Specifically, pay attention to:
1. The **"deactivated" flag paradigm**: The cloud NLE now uses `deactivated: boolean` on `TimelineClip` and `TranscriptBlock` to handle non-destructive skipping of clips (Play All vs. Play Edit). Do not delete objects from arrays; toggle their `deactivated` flag.
2. The **Keyframe array model**: The `TimelineClip` now has a `transforms: TransformKeyframe[]` property. The shape is:
```typescript
export type TransformKeyframe = {
  id: string;
  timeOffset: number; // Seconds from the start of the clip
  scale?: number;     // Zoom (2D) or FOV (360)
  x?: number;         // Pan X (2D) or Yaw (360)
  y?: number;         // Pan Y (2D) or Pitch (360)
  rotation?: number;  // Roll
  easing?: "linear" | "ease-in-out";
};
```

Keep building, but use this as a reference to ensure the mobile rendering engine can read the exact same data model when we sync edits between mobile and cloud!
