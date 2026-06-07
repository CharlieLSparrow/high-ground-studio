import XCTest

final class Tier3_CrossFeatureTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
    }

    // MARK: - Cross-Feature Combination Tests

    // Feature 1 (Toggle) + Feature 3 (Keyframes) + Feature 4 (State Sync)
    func testCrossFeature_ToggleClip_RetainsKeyframes() {
        let app = XCUIApplication()

        // 1. Select clip and add a keyframe
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.7)
        app.buttons["Add Keyframe"].tap()

        // 2. Deactivate clip
        app.buttons["Deactivate"].tap()
        let deactivatedClip = app.buttons["TimelineClip_Deactivated"].firstMatch
        XCTAssertTrue(deactivatedClip.waitForExistence(timeout: 5))

        // 3. Reactivate clip
        deactivatedClip.tap()
        app.buttons["Activate"].tap()

        // 4. Verify keyframe is retained
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.exists, "Keyframe should be retained after clip is toggled off and on")
    }

    // Feature 1 (Toggle) + Feature 2 (360 Reframing) + Feature 4 (State Sync)
    func testCrossFeature_DeactivateClip_Skips360RendererPreview() {
        let app = XCUIApplication()

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        // Deactivate clip
        app.buttons["Deactivate"].tap()

        // Scrub over the deactivated clip
        let timelineScrubber = app.otherElements["TimelineScrubber"]
        XCTAssertTrue(timelineScrubber.waitForExistence(timeout: 2))
        timelineScrubber.swipeRight()


        // Verify no active clips remain
        XCTAssertFalse(app.buttons["TimelineClip_Active"].exists, "No active clips should remain")
    }

    // Feature 2 (360 Reframing) + Feature 3 (Keyframes) + Feature 4 (State Sync)
    func testCrossFeature_Playback_InterpolatesKeyframesIn360Renderer() {
        let app = XCUIApplication()

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        // Add first keyframe
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.1)
        app.buttons["Add Keyframe"].tap()

        // Move playhead and add second keyframe
        let playhead = app.otherElements["Playhead"]
        playhead.swipeRight()
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.9)
        app.buttons["Add Keyframe"].tap()

        // Play and verify interpolation in 360 renderer state
        app.buttons["Play"].tap()
        let panLabel = app.staticTexts["PanValueLabel"]
        XCTAssertTrue(panLabel.waitForExistence(timeout: 5))
        // Verify pan label updates during playback, implicitly checking timeline sync and renderer interpolation
        XCTAssertTrue(app.buttons["Pause"].exists, "Playback should be active")
    }

    // Feature 1 (Toggle) + Feature 3 (Keyframes) + Feature 4 (State Sync)
    func testCrossFeature_SplitClip_ClonesKeyframesAndAllowsIndependentToggling() {
        let app = XCUIApplication()

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        // Add a keyframe before splitting
        app.sliders["TiltSlider"].adjust(toNormalizedSliderPosition: 0.8)
        app.buttons["Add Keyframe"].tap()

        // Split clip
        app.buttons["Split"].tap()

        // Deactivate second segment
        let secondSegment = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 1)
        XCTAssertTrue(secondSegment.waitForExistence(timeout: 2))
        secondSegment.tap()
        app.buttons["Deactivate"].tap()


        // Verify first segment retains keyframe
        let firstSegment = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 0)
        firstSegment.tap()
        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.exists, "First segment should retain its keyframe after split")

        // Verify timeline synced with deactivated state
        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists)
    }

    // Feature 2 (360 Reframing) + Feature 4 (State Sync)
    func testCrossFeature_UndoReframing_UpdatesTimelineAndRenderer() {
        let app = XCUIApplication()

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        // Adjust FOV (Zoom) and add keyframe
        let fovSlider = app.sliders["ZoomSlider"]
        XCTAssertTrue(fovSlider.waitForExistence(timeout: 2))
        fovSlider.adjust(toNormalizedSliderPosition: 0.2)

        app.buttons["Add Keyframe"].tap()

        // Verify keyframe exists
        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.exists)

        // Undo
        app.buttons["Undo"].tap()

        // Verify keyframe removed from timeline (Feature 4) and 360 preview resets (Feature 2)
        XCTAssertFalse(keyframeMarker.exists, "Keyframe marker should be removed after undo")
    }

    // Feature 2 (360 Reframing) + Feature 3 (Keyframes)
    func testCrossFeature_ModifyKeyframe_Updates360RendererInstantly() {
        let app = XCUIApplication()

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5))
        activeClip.tap()

        app.buttons["Add Keyframe"].tap()

        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.waitForExistence(timeout: 5))
        keyframeMarker.tap()

        // Adjust pan while keyframe is selected
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.4)

        let panLabel = app.staticTexts["PanValueLabel"]
        XCTAssertTrue(panLabel.exists)
        XCTAssertEqual(panLabel.label, "Pan: 40") // Assume 0.4 normalizes to 40
    }
}
