# Scope: Tier 1 Tests (Feature Coverage)

## Architecture
- Xcode Test Targets: `HighGroundCaptureTests` and/or `HighGroundCaptureUITests`
- Test framework: `XCTest`

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | F1 Tests | 5 Tier 1 tests for Timeline UI Toggle | none | PLANNED |
| 2 | F2 Tests | 5 Tier 1 tests for 360 Reframing | none | PLANNED |
| 3 | F3 Tests | 5 Tier 1 tests for Keyframe Animation | none | PLANNED |
| 4 | F4 Tests | 5 Tier 1 tests for Timeline State Sync | none | PLANNED |

## Interface Contracts
- Tests must use standard iOS project entry points. No internal implementation mocking.
- Run command: `xcodebuild test -scheme HighGroundCapture -destination 'platform=iOS Simulator,name=iPhone 15 Pro'`
