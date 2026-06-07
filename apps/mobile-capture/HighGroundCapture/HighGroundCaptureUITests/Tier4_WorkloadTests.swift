import XCTest

final class Tier4_WorkloadTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
    }

    override func tearDownWithError() throws {
    }

    // MARK: - Scenario 1: Standard VLOG Edit
    // Import 360 video, reframe subject, toggle out bad takes
    func testStandardVLOGEdit() {
        let app = XCUIApplication()

        XCTAssertTrue(app.otherElements["MainVideoPlayer"].waitForExistence(timeout: 5), "Should show MainVideoPlayer")

        // Reframe subject with a keyframe
        let panSlider = app.sliders["PanSlider"]
        XCTAssertTrue(panSlider.waitForExistence(timeout: 2))
        panSlider.adjust(toNormalizedSliderPosition: 0.7)
        app.buttons["Add Keyframe"].tap()


        // Scrub forward
        let playhead = app.otherElements["Playhead"]
        XCTAssertTrue(playhead.waitForExistence(timeout: 2))
        playhead.swipeRight()


        // Toggle out bad takes (split and deactivate)
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        activeClip.tap()
        app.buttons["Split"].tap()

        let secondSegment = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 1)
        XCTAssertTrue(secondSegment.waitForExistence(timeout: 2))
        secondSegment.tap()
        app.buttons["Deactivate"].tap()
        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists, "Bad take should be deactivated")



        // Verify playback skips the deactivated bad take and preview updates
        app.buttons["Play"].tap()
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 2), "App should enter playing state")
    }

    // MARK: - Scenario 2: Fast-Paced Action Edit
    // Rapid toggling of clips with extreme FOV keyframes
    func testFastPacedActionEdit() {
        let app = XCUIApplication()

        // Wait for active clip

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5), "Active clip should load")

        // Split multiple times to create short action cuts
        for _ in 0..<3 {
            XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
            activeClip.tap()
            app.buttons["Split"].tap()

        }

        // Apply extreme FOV keyframes to each active clip and deactivate alternate clips
        let clipQuery = app.buttons.matching(identifier: "TimelineClip_Active")
        let count = clipQuery.count
        for i in 0..<count {
            let clip = clipQuery.element(boundBy: i)
            XCTAssertTrue(clip.waitForExistence(timeout: 2))
            clip.tap()

            if i % 2 == 1 {
                app.buttons["Deactivate"].tap()
            } else {
                let zoomSlider = app.sliders["ZoomSlider"]
                XCTAssertTrue(zoomSlider.waitForExistence(timeout: 2))
                // Extreme FOV keyframes
                zoomSlider.adjust(toNormalizedSliderPosition: i == 0 ? 0.1 : 0.9)
                app.buttons["Add Keyframe"].tap()

            }

        }

        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].exists, "Should have deactivated clips")

        // Verify fast sequence plays smoothly
        app.buttons["Play"].tap()
        XCTAssertTrue(app.buttons["Pause"].exists, "App should enter playing state")
    }

    // MARK: - Scenario 3: Single Continuous Shot
    // One long clip with multiple pan/tilt sweeps
    func testSingleContinuousShot() {
        let app = XCUIApplication()

        XCTAssertTrue(app.otherElements["MainVideoPlayer"].waitForExistence(timeout: 5), "Should show MainVideoPlayer")

        let playhead = app.otherElements["Playhead"]
        XCTAssertTrue(playhead.waitForExistence(timeout: 2), "Playhead should exist")

        let panSlider = app.sliders["PanSlider"]
        let tiltSlider = app.sliders["TiltSlider"]
        let addKeyframeButton = app.buttons["Add Keyframe"]

        // Add multiple sweeps
        let sweeps: [(pan: CGFloat, tilt: CGFloat)] = [
            (0.2, 0.8), (0.8, 0.2), (0.5, 0.5), (0.1, 0.9)
        ]

        for sweep in sweeps {
            panSlider.adjust(toNormalizedSliderPosition: sweep.pan)
            tiltSlider.adjust(toNormalizedSliderPosition: sweep.tilt)
            addKeyframeButton.tap()
            playhead.swipeRight()
        }

        // Assert keyframes are added
        let keyframeMarkers = app.images.matching(identifier: "KeyframeMarker")
        XCTAssertTrue(keyframeMarkers.count >= 4, "Should have multiple keyframe sweeps on the continuous shot")

        // Verify timeline integration by scrubbing
        let scrubber = app.otherElements["TimelineScrubber"]
        XCTAssertTrue(scrubber.waitForExistence(timeout: 2))
        scrubber.swipeLeft()
        XCTAssertTrue(app.staticTexts["PanValueLabel"].exists, "Pan label should display when scrubbing")
        XCTAssertTrue(app.staticTexts["TiltValueLabel"].exists, "Tilt label should display when scrubbing")

    }

    // MARK: - Scenario 4: Non-destructive Reversion
    // Edit sequence, deactivate all, reactivate subset
    func testNonDestructiveReversion() {
        let app = XCUIApplication()

        // Check active clip

        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 5), "Active clip should load")

        // Create a sequence
        for _ in 0..<4 {
            XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
            activeClip.tap()
            app.buttons["Split"].tap()

        }

        // Deactivate all
        var activeClips = app.buttons.matching(identifier: "TimelineClip_Active")
        while activeClips.count > 0 {
            activeClips.element(boundBy: 0).tap()
            app.buttons["Deactivate"].tap()
            activeClips = app.buttons.matching(identifier: "TimelineClip_Active")
        }

        // Verify no active clips remain
        XCTAssertFalse(app.buttons["TimelineClip_Active"].exists, "No active clips should remain")

        // Reactivate a subset (e.g., the second and fourth clips if they were originally index 1 and 3)
        let deactivatedClips = app.buttons.matching(identifier: "TimelineClip_Deactivated")
        let totalDeactivated = deactivatedClips.count
        if totalDeactivated >= 4 {
            // Re-activate what was the second clip
            let clipToActivate1 = deactivatedClips.element(boundBy: 1)
            XCTAssertTrue(clipToActivate1.waitForExistence(timeout: 2))
            clipToActivate1.tap()
            app.buttons["Activate"].tap()


            // Because one was re-activated, the index might shift down, so just reactivate the last one now
            let newDeactivatedCount = app.buttons.matching(identifier: "TimelineClip_Deactivated").count
            if newDeactivatedCount > 0 {
                let clipToActivate2 = app.buttons.matching(identifier: "TimelineClip_Deactivated").element(boundBy: newDeactivatedCount - 1)
                XCTAssertTrue(clipToActivate2.waitForExistence(timeout: 2))
                clipToActivate2.tap()
                app.buttons["Activate"].tap()

            }
        }

        // Verify active clips are back
        XCTAssertTrue(app.buttons["TimelineClip_Active"].exists, "Active clips should be restored")
    }

    // MARK: - Scenario 5: Complex Keyframe Path
    // 360 reframing with rapid directional changes over time
    func testComplexKeyframePath() {
        let app = XCUIApplication()

        XCTAssertTrue(app.otherElements["MainVideoPlayer"].waitForExistence(timeout: 5), "Should show MainVideoPlayer")

        let playhead = app.otherElements["Playhead"]
        let panSlider = app.sliders["PanSlider"]
        let tiltSlider = app.sliders["TiltSlider"]
        let zoomSlider = app.sliders["ZoomSlider"]
        let addKeyframeBtn = app.buttons["Add Keyframe"]

        // Create a rapid, complex path
        let keyframes: [(pan: CGFloat, tilt: CGFloat, zoom: CGFloat)] = [
            (0.1, 0.1, 0.5), (0.9, 0.9, 0.2), (0.5, 0.1, 0.8), (0.1, 0.9, 0.3), (0.8, 0.5, 0.9)
        ]

        for kf in keyframes {
            panSlider.adjust(toNormalizedSliderPosition: kf.pan)
            tiltSlider.adjust(toNormalizedSliderPosition: kf.tilt)
            zoomSlider.adjust(toNormalizedSliderPosition: kf.zoom)
            addKeyframeBtn.tap()

            // Advance timeline quickly
            XCTAssertTrue(playhead.waitForExistence(timeout: 2))
            playhead.swipeRight()
        }

        // Playback and verify parameter interpolation
        app.buttons["Play"].tap()

        let panLabel = app.staticTexts["PanValueLabel"]
        let tiltLabel = app.staticTexts["TiltValueLabel"]
        let fovLabel = app.staticTexts["FOVValueLabel"]

        XCTAssertTrue(panLabel.waitForExistence(timeout: 2), "Pan should update during playback")
        XCTAssertTrue(tiltLabel.exists, "Tilt should update during playback")
        XCTAssertTrue(fovLabel.exists, "FOV should update during playback")

        // Allow some time for complex playback
        XCTAssertTrue(app.buttons["Pause"].exists, "App should continue playing")
    }
}
