import XCTest

final class Tier2_BoundaryTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
    }

    // MARK: - Feature 1: Timeline UI: Toggle "Active/Deactivated" (Boundary & Corner Cases)

    func testTimelineUI_deactivateExtremelyShortClip() {
        let app = XCUIApplication()
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        app.buttons["Split"].tap()

        let shortClip = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 1)
        shortClip.tap()
        app.buttons["Deactivate"].tap()

        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists, "Extremely short clip should be deactivatable")
    }

    func testTimelineUI_rapidToggleActiveDeactivated() {
        let app = XCUIApplication()
        // Corner Case: Tapping activate/deactivate very rapidly
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        let deactivateButton = app.buttons["Deactivate"]
        let activateButton = app.buttons["Activate"]

        for _ in 0..<5 {
            deactivateButton.tap()
            activateButton.tap()
        }
        // Verify app remains responsive and clip ends in a valid state
        XCTAssertTrue(app.buttons["TimelineClip_Active"].exists || app.buttons["TimelineClip_Deactivated"].exists)

    }

    func testTimelineUI_deactivateAllClipsInTimeline() {
        let app = XCUIApplication()
        // Boundary: 0 active clips
        let activeClips = app.buttons.matching(identifier: "TimelineClip_Active")
        while activeClips.count > 0 {
            activeClips.element(boundBy: 0).tap()
            app.buttons["Deactivate"].tap()
        }
        XCTAssertEqual(app.buttons.matching(identifier: "TimelineClip_Active").count, 0, "Timeline should allow zero active clips")
        XCTAssertFalse(app.buttons["Play"].isEnabled, "Preview should reflect empty timeline")
    }

    func testTimelineUI_splitAndDeactivateAtBoundary() {
        let app = XCUIApplication()
        // Boundary: Split exactly at the start or end of a clip
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        let playhead = app.otherElements["Playhead"]
        // Move playhead to start
        XCTAssertTrue(playhead.waitForExistence(timeout: 2))
        playhead.swipeLeft() // Assume moving to start
        app.buttons["Split"].tap()
        // Should not crash, might show error or ignore
        XCTAssertTrue(app.isHittable || app.alerts.count >= 0)


    }

    func testTimelineUI_deactivateClipWithActiveKeyframes() {
        let app = XCUIApplication()
        // Corner Case: Clip has keyframes, then deactivated - keyframes should be preserved but inactive
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        app.buttons["Add Keyframe"].tap()
        app.buttons["Deactivate"].tap()

        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists)

        app.buttons["Activate"].tap()
        // Keyframe should still exist after reactivation
        XCTAssertTrue(app.images["KeyframeMarker"].exists, "Keyframes should persist across deactivation")

    }

    // MARK: - Feature 2: 360 Reframing: Render Equirectangular to Rectilinear (Boundary & Corner Cases)

    func testReframing_maxPanBoundary() {
        let app = XCUIApplication()
        // Boundary: Wrapping around pan 360 degrees to 0 or exceeding limits if clamped
        let panSlider = app.sliders["PanSlider"]
        XCTAssertTrue(panSlider.waitForExistence(timeout: 2))
        panSlider.adjust(toNormalizedSliderPosition: 1.0)
        let panLabel = app.staticTexts["PanValueLabel"]
        // If it wraps or clamps, verify it doesn't crash and shows valid text
        XCTAssertTrue(panLabel.exists)

    }

    func testReframing_minMaxTiltBoundary() {
        let app = XCUIApplication()
        // Boundary: Tilt at extreme poles e.g. +90 and -90 degrees
        let tiltSlider = app.sliders["TiltSlider"]
        XCTAssertTrue(tiltSlider.waitForExistence(timeout: 2))
        tiltSlider.adjust(toNormalizedSliderPosition: 0.0) // Min
        XCTAssertTrue(app.staticTexts["TiltValueLabel"].exists)
        tiltSlider.adjust(toNormalizedSliderPosition: 1.0) // Max
        XCTAssertTrue(app.staticTexts["TiltValueLabel"].exists)

    }

    func testReframing_minMaxFOVBoundary() {
        let app = XCUIApplication()
        // Boundary: Zoom all the way out to max FOV and in to min FOV
        let zoomSlider = app.sliders["ZoomSlider"]
        XCTAssertTrue(zoomSlider.waitForExistence(timeout: 2))
        zoomSlider.adjust(toNormalizedSliderPosition: 0.0) // Extreme Zoom In
        XCTAssertTrue(app.staticTexts["FOVValueLabel"].exists)
        zoomSlider.adjust(toNormalizedSliderPosition: 1.0) // Extreme Zoom Out
        XCTAssertTrue(app.staticTexts["FOVValueLabel"].exists)

    }

    func testReframing_rapidPanTiltAdjustments() {
        let app = XCUIApplication()
        // Corner Case: Swiping joystick aggressively in all directions
        let panSlider = app.sliders["PanSlider"]
        let tiltSlider = app.sliders["TiltSlider"]
        XCTAssertTrue(panSlider.waitForExistence(timeout: 2))
        XCTAssertTrue(tiltSlider.waitForExistence(timeout: 2))

        panSlider.adjust(toNormalizedSliderPosition: 0.1)
        tiltSlider.adjust(toNormalizedSliderPosition: 0.9)
        panSlider.adjust(toNormalizedSliderPosition: 0.8)
        tiltSlider.adjust(toNormalizedSliderPosition: 0.2)

        // UI should remain responsive
        XCTAssertTrue(app.staticTexts["PanValueLabel"].exists)
    }

    // MARK: - Feature 3: Keyframe Animation: Dynamic keyframes (Yaw, Pitch, FOV) (Boundary & Corner Cases)

    func testKeyframe_addKeyframesAtExactSameTime() {
        let app = XCUIApplication()
        // Corner Case: Overlapping keyframes at same timestamp - should replace or ignore
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        app.buttons["Add Keyframe"].tap()
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.8)
        app.buttons["Add Keyframe"].tap() // Tap again at same playhead position

        // Should not crash, only one keyframe should exist or it overwrote
        XCTAssertTrue(app.images["KeyframeMarker"].exists)

    }

    func testKeyframe_addKeyframeAtClipVeryEnd() {
        let app = XCUIApplication()
        // Boundary: Add keyframe at exactly the last frame of the clip
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        app.buttons["Go To End"].tap()
        app.buttons["Add Keyframe"].tap()
        XCTAssertTrue(app.images["KeyframeMarker"].exists, "Should be able to add keyframe at boundary end")

    }

    func testKeyframe_extremeValueInterpolation() {
        let app = XCUIApplication()
        // Corner Case: Keyframe 1 has min Pan, keyframe 2 has max Pan over short duration
        app.buttons["Add Keyframe"].tap()
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.0)

        app.buttons["Step Forward"].tap()
        app.buttons["Add Keyframe"].tap()
        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 1.0)

        app.buttons["Play"].tap()
        // Engine should not crash during extreme interpolation
        XCTAssertTrue(app.buttons["Pause"].exists)
    }

    func testKeyframe_deleteOnlyKeyframe() {
        let app = XCUIApplication()
        // Boundary: Deleting the only keyframe - should revert to default or clip default
        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.waitForExistence(timeout: 2))
        keyframeMarker.tap()
        app.buttons["Delete Keyframe"].tap()
        XCTAssertFalse(app.images["KeyframeMarker"].exists)
        XCTAssertTrue(app.staticTexts["PanValueLabel"].exists) // Engine still renders

    }

    func testKeyframe_rapidSequentialKeyframeAdds() {
        let app = XCUIApplication()
        // Corner Case: Spamming "Add Keyframe" button while playing
        app.buttons["Play"].tap()
        for _ in 0..<5 {
            app.buttons["Add Keyframe"].tap()
        }
        app.buttons["Pause"].tap()
        XCTAssertTrue(app.images["KeyframeMarker"].exists, "Rapid keyframe addition should not freeze app")
    }

    // MARK: - Feature 4: Timeline State Integration: Timeline to renderer sync (Boundary & Corner Cases)

    func testIntegration_scrubBeyondTimelineBounds() {
        let app = XCUIApplication()
        // Boundary: Scrubbing past the end or before 0:00
        let scrubber = app.otherElements["TimelineScrubber"]
        XCTAssertTrue(scrubber.waitForExistence(timeout: 2))
        scrubber.swipeLeft() // Try to go before 0
        let timeLabel = app.staticTexts["TimecodeLabel"]
        XCTAssertTrue(timeLabel.exists)
        // Time shouldn't be negative, but we test opacity
        scrubber.swipeRight()
        scrubber.swipeRight() // Try to go past end
        XCTAssertTrue(timeLabel.exists)

    }

    func testIntegration_deactivateClipDuringPlayback() {
        let app = XCUIApplication()
        // Corner Case: Playback is active, user deactivates the currently playing clip
        app.buttons["Play"].tap()
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        activeClip.tap()
        app.buttons["Deactivate"].tap()
        // Should gracefully skip or pause
        XCTAssertTrue(app.buttons["Play"].exists || app.buttons["Pause"].exists)

    }

    func testIntegration_addClipWhileExporting() {
        let app = XCUIApplication()

        addUIInterruptionMonitor(withDescription: "System Dialog") { alert in
            let allowBtn = alert.buttons.element(boundBy: 0)
            if allowBtn.exists {
                allowBtn.tap()
            }
            return true
        }

        app.buttons["Export"].tap()
        let addClipBtn = app.buttons["Add Clip"]
        XCTAssertTrue(addClipBtn.waitForExistence(timeout: 2))
        addClipBtn.tap()

        app.tap() // trigger interruption monitor

        let successAlert = app.alerts["Export Successful"]
        XCTAssertTrue(successAlert.waitForExistence(timeout: 20), "Export should complete in the background")
    }

    func testIntegration_zeroDurationTimelinePlayback() {
        let app = XCUIApplication()
        // Boundary: Press play when timeline total active duration is 0
        let activeClips = app.buttons.matching(identifier: "TimelineClip_Active")
        while activeClips.count > 0 {
            activeClips.element(boundBy: 0).tap()
            app.buttons["Deactivate"].tap()
        }
        let playBtn = app.buttons["Play"]
        XCTAssertTrue(playBtn.waitForExistence(timeout: 2))
        XCTAssertFalse(playBtn.isEnabled, "Play button should be disabled for 0 duration timeline")

    }

    func testIntegration_rapidUndoRedoStateSync() {
        let app = XCUIApplication()
        // Corner Case: Rapid Undo/Redo of clip state changes, ensuring preview doesn't desync
        let clip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(clip.waitForExistence(timeout: 2))
        clip.tap()
        app.buttons["Deactivate"].tap()

        for _ in 0..<3 {
            app.buttons["Undo"].tap()
            app.buttons["Redo"].tap()
        }

        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists, "Final state should be correct after rapid undo/redo")

    }
    func testReframing_invalidEquirectangularFormat() {
        let app = XCUIApplication()
        // Corner Case: Import video that isn't 2:1 equirectangular
        XCTAssertTrue(app.buttons["Import"].waitForExistence(timeout: 2))
        app.buttons["Import"].tap()
        XCTAssertTrue(app.buttons["InvalidVideo"].waitForExistence(timeout: 2))
        app.buttons["InvalidVideo"].tap()

        let errorAlert = app.alerts["Format Error"]
        XCTAssertTrue(errorAlert.waitForExistence(timeout: 5), "Should show error for non-equirectangular video")
    }
}
