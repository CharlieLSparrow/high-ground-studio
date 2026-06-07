# Editor Architecture Proposal

## Native vs. Hybrid Evaluation

The application currently utilizes a `HybridWebView` for audio recording workflows, delegating UI to a web frontend and passing state via `WKScriptMessageHandler`. However, the new Editor UI has drastically different requirements:

### Hybrid (WKWebView) Approach
* **Pros**: Reuses potential existing web-based editor logic (Quipsly frontend), write-once-run-anywhere UI.
* **Cons**:
  * **Performance Latency**: The 360 Reframing Engine requires a pipeline between the UI timeline and Metal/AVFoundation. Passing high-frequency scrubbing events (60fps) and keyframe transforms (yaw, pitch, fov) across the JavaScript-to-Native bridge introduces unacceptable latency and jitter.
  * **Synchronization**: Keeping a web-based timeline perfectly synced with a native video player during scrubbing and playback is notoriously difficult and error-prone.

### Native (SwiftUI) Approach
* **Pros**:
  * **Tight Integration**: Direct, synchronous access to AVFoundation and Metal contexts.
  * **Performance**: Butter-smooth 60fps scrubbing and UI updates, critical for a video editing experience.
  * **State Management**: Complex timeline state (active vs. deactivated clips) can be efficiently managed via SwiftUI's `@State` or `@Observable` constructs, binding directly to the video player's time control status.
* **Cons**: Requires building the Editor UI from scratch natively on iOS.

### Recommendation
**Native (SwiftUI) is the explicitly required approach.** The tight integration required with the 360 reframing engine (Metal/AVFoundation) and the high-performance demands of scrubbing a video timeline make the Hybrid approach non-viable.

## Base Data Models

The Quipsly non-destructive "toggle editor" paradigm dictates that we mark clips and transcript blocks as deactivated rather than removing the underlying source data. This allows users to recover edited-out sections seamlessly.

The models include `TimelineState`, `TimelineClip`, `TransformKeyframe`, `Transcript`, and `TranscriptBlock`. All data models are `Codable` and `Identifiable` (except `Transcript` which wraps an array of blocks). The non-destructive state is maintained using a `deactivated` boolean flag on elements. The models match the Cloud NLE Synchronization structure.
