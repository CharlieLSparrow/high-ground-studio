# Project: HighGroundCapture Quipsly Integration

## Architecture
The iOS application `HighGroundCapture` is being extended with a non-destructive video editor (Quipsly paradigm) and a native 360-degree video reframing engine.

**Key Components**:
- **360 Reframing Engine**: AVFoundation / Metal pipeline projecting equirectangular video to rectilinear, driven by keyframes (Yaw, Pitch, FOV).
- **Editor UI**: Either a Native Swift/SwiftUI implementation OR a Hybrid WKWebView approach. To be decided in Milestone 1.
- **Data Models**: Timeline state (Clips, Transcripts, Transforms) representing active vs deactivated clips without removing underlying source data.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Architecture & Foundation | Decide Native vs Hybrid for Editor UI. Document in `EditorArchitecture.md`. Implement base data models / bridge (`WKScriptMessageHandler` or Swift models). | none | DONE |
| 2 | M2: Native 360 Reframing Engine | Implement AVFoundation `AVVideoCompositing` class or Metal shader for equirectangular to rectilinear projection with dynamic keyframes. | none | DONE |
| 3 | M3: Non-Destructive UI Paradigm | Implement UI prototype or logic for the Quipsly toggle editor paradigm in Native SwiftUI (as chosen in M1). Wire `ContentView.swift` to use the new Native SwiftUI Editor. | M1 | DONE |
| 4 | M4: Core Pipeline Bugfixes | Fix `ReframingCompositor.swift` (hardcoded linear interpolation, rendering queue blocking) and `UploadManager.swift` (leak of .tmp chunks, deadlocks on retry). | M2 | DONE |
| 5 | FM_Tier1: E2E Feature Coverage | Pass all 20 Tier 1 E2E tests. Add UITests target to `.pbxproj`. | M1, M2, M3, M4 | PLANNED |
| 6 | FM_Tier2: E2E Boundary | Pass all 20 Tier 2 E2E tests. | FM_Tier1 | PLANNED |
| 7 | FM_Tier3: E2E Cross-Feature | Pass all 6 Tier 3 E2E tests. | FM_Tier2 | PLANNED |
| 8 | FM_Tier4: E2E Real-World | Pass all 5 Tier 4 E2E tests. | FM_Tier3 | PLANNED |
| 9 | FM_Phase2: Adversarial Hardening | Tier 5: White-box adversarial testing and gap fixing via Challenger loop. | FM_Tier4 | PLANNED |

## Interface Contracts
### Cross-Platform Data Model (Cloud NLE Sync)
The iOS data models must align with the Cloud NLE structures to allow seamless syncing:
1. **Deactivated Flag**: Use `deactivated: Bool` on timeline clips and transcript blocks. Do NOT delete objects from arrays; toggle their `deactivated` flag.
2. **Transform Keyframes**: The transforms array should map to:
```swift
struct TransformKeyframe {
    var id: String
    var timeOffset: Double // Seconds from the start of the clip
    var scale: Double?     // Zoom (2D) or FOV (360)
    var x: Double?         // Pan X (2D) or Yaw (360)
    var y: Double?         // Pan Y (2D) or Pitch (360)
    var rotation: Double?  // Roll
    var easing: String?    // "linear" or "ease-in-out"
}
```

### Editor UI ↔ Reframing Engine
- The UI timeline passes transform keyframes (mapped from `TransformKeyframe`) to the 360 Reframing Engine.

### Editor UI ↔ Data Models
- The UI consumes the Timeline models (Clips, Transforms) using the `deactivated` flag to render active/deactivated visual states without removing source.

## Code Layout
- Base directory: `/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture`
- `HighGroundCapture/` - Main Swift application source.
- `HighGroundCapture.xcodeproj/` - Xcode project.
