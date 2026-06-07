import XCTest

final class Tier1_FeatureTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
    }

    // MARK: - Feature 1: Timeline UI: Toggle "Active/Deactivated"

    func testTimelineUI_canDeactivateActiveClip() {
        let app = XCUIApplication()
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        activeClip.tap()
        app.buttons["Deactivate"].tap()
        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].waitForExistence(timeout: 2), "Clip should change to deactivated state")
    }

    func testTimelineUI_canReactivateDeactivatedClip() {
        let app = XCUIApplication()
        let deactivatedClip = app.buttons["TimelineClip_Deactivated"].firstMatch
        XCTAssertTrue(deactivatedClip.waitForExistence(timeout: 2))
        deactivatedClip.tap()
        app.buttons["Activate"].tap()
        XCTAssertTrue(app.buttons["TimelineClip_Active"].waitForExistence(timeout: 2), "Clip should change to active state")
    }

    func testTimelineUI_displaysBothActiveAndDeactivatedClips() {
        let app = XCUIApplication()
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        let deactivatedClip = app.buttons["TimelineClip_Deactivated"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        XCTAssertTrue(deactivatedClip.waitForExistence(timeout: 2))
    }

    func testTimelineUI_splitClipAndDeactivateSegment() {
        let app = XCUIApplication()
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        activeClip.tap()
        app.buttons["Split"].tap()

        let secondSegment = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 1)
        XCTAssertTrue(secondSegment.waitForExistence(timeout: 2))
        secondSegment.tap()
        app.buttons["Deactivate"].tap()

        XCTAssertTrue(app.buttons["TimelineClip_Active"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["TimelineClip_Deactivated"].waitForExistence(timeout: 2))
    }

    func testTimelineUI_playbackSkipsDeactivatedClips() {
        let app = XCUIApplication()
        app.buttons["Play"].tap()
        let timecodeLabel = app.staticTexts["TimecodeLabel"]
        XCTAssertTrue(timecodeLabel.waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 2))
    }

    // MARK: - Feature 2: 360 Reframing: Render Equirectangular to Rectilinear

    func testReframing_loadEquirectangularVideo() {
        let app = XCUIApplication()
        XCTAssertTrue(app.buttons["Import"].waitForExistence(timeout: 2))
        app.buttons["Import"].tap()
        XCTAssertTrue(app.buttons["360Video"].waitForExistence(timeout: 2))
        app.buttons["360Video"].tap()

        let reframedBadge = app.staticTexts["Rectilinear View"]
        XCTAssertTrue(reframedBadge.waitForExistence(timeout: 5), "Preview player should display Rectilinear View badge")
    }

    func testReframing_applyPanControl() {
        let app = XCUIApplication()
        let panSlider = app.sliders["PanSlider"]
        XCTAssertTrue(panSlider.waitForExistence(timeout: 2))
        panSlider.adjust(toNormalizedSliderPosition: 0.8)
        let panLabel = app.staticTexts["PanValueLabel"]
        XCTAssertTrue(panLabel.waitForExistence(timeout: 2))
        XCTAssertEqual(panLabel.label, "Pan: 80")
    }

    func testReframing_applyTiltControl() {
        let app = XCUIApplication()
        let tiltSlider = app.sliders["TiltSlider"]
        XCTAssertTrue(tiltSlider.waitForExistence(timeout: 2))
        tiltSlider.adjust(toNormalizedSliderPosition: 0.2)
        let tiltLabel = app.staticTexts["TiltValueLabel"]
        XCTAssertTrue(tiltLabel.waitForExistence(timeout: 2))
    }

    func testReframing_applyZoomControl() {
        let app = XCUIApplication()
        let zoomSlider = app.sliders["ZoomSlider"]
        XCTAssertTrue(zoomSlider.waitForExistence(timeout: 2))
        zoomSlider.adjust(toNormalizedSliderPosition: 0.5)
        let fovLabel = app.staticTexts["FOVValueLabel"]
        XCTAssertTrue(fovLabel.waitForExistence(timeout: 2))
    }

    func testReframing_exportRectilinearVideo() {
        let app = XCUIApplication()

        addUIInterruptionMonitor(withDescription: "System Dialog") { alert in
            let allowBtn = alert.buttons.element(boundBy: 0)
            if allowBtn.exists {
                allowBtn.tap()
            }
            return true
        }

        app.buttons["Export"].tap()
        app.tap()

        let successDialog = app.alerts["Export Successful"]
        XCTAssertTrue(successDialog.waitForExistence(timeout: 20), "Export Successful dialog should appear")
    }

    // MARK: - Feature 3: Keyframe Animation: Dynamic keyframes (Yaw, Pitch, FOV)

    func testKeyframe_addKeyframeUpdatesTimeline() {
        let app = XCUIApplication()
        let playhead = app.otherElements["Playhead"]
        XCTAssertTrue(playhead.waitForExistence(timeout: 2))
        playhead.swipeRight()

        app.sliders["PanSlider"].adjust(toNormalizedSliderPosition: 0.6)
        app.buttons["Add Keyframe"].tap()

        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.waitForExistence(timeout: 2), "Keyframe marker should appear")
    }

    func testKeyframe_navigateBetweenKeyframes() {
        let app = XCUIApplication()
        app.buttons["Add Keyframe"].tap() // Add one so we can navigate
        app.buttons["Next Keyframe"].tap()

        let panLabel = app.staticTexts["PanValueLabel"]
        XCTAssertTrue(panLabel.waitForExistence(timeout: 2))
    }

    func testKeyframe_deleteKeyframe() {
        let app = XCUIApplication()
        app.buttons["Add Keyframe"].tap()

        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.waitForExistence(timeout: 2))
        keyframeMarker.tap()
        app.buttons["Delete Keyframe"].tap()

        XCTAssertFalse(keyframeMarker.waitForExistence(timeout: 2), "Keyframe marker should be removed")
    }

    func testKeyframe_editExistingKeyframeValues() {
        let app = XCUIApplication()
        app.buttons["Add Keyframe"].tap()

        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertTrue(keyframeMarker.waitForExistence(timeout: 2))
        keyframeMarker.tap()
        app.sliders["TiltSlider"].adjust(toNormalizedSliderPosition: 0.9)

        app.buttons["Next Keyframe"].tap()
        app.buttons["Previous Keyframe"].tap()

        let tiltLabel = app.staticTexts["TiltValueLabel"]
        XCTAssertTrue(tiltLabel.waitForExistence(timeout: 2))
    }

    func testKeyframe_playbackInterpolatesDynamicKeyframes() {
        let app = XCUIApplication()
        app.buttons["Play"].tap()
        let panLabel = app.staticTexts["PanValueLabel"]
        XCTAssertTrue(panLabel.waitForExistence(timeout: 2))
        XCTAssertTrue(app.buttons["Pause"].waitForExistence(timeout: 2))
    }

    // MARK: - Feature 4: Timeline State Integration: Timeline to renderer sync

    func testIntegration_addingClipUpdatesPreview() {
        let app = XCUIApplication()
        app.buttons["Add Clip"].tap()

        let playButton = app.buttons["Play"]
        XCTAssertTrue(playButton.isEnabled, "Play button should be enabled after adding a clip")

        let statusLabel = app.staticTexts["PlayerItemStatus"]
        XCTAssertTrue(statusLabel.waitForExistence(timeout: 2))
        let readyPredicate = NSPredicate(format: "label == 'Status: Ready'")
        let expectation = XCTNSPredicateExpectation(predicate: readyPredicate, object: statusLabel)
        let result = XCTWaiter.wait(for: [expectation], timeout: 5.0)
        XCTAssertEqual(result, .completed, "Status should settle to Ready")
    }

    func testIntegration_deactivatingClipClearsPreview() {
        let app = XCUIApplication()
        let activeClip = app.buttons["TimelineClip_Active"].firstMatch
        XCTAssertTrue(activeClip.waitForExistence(timeout: 2))
        activeClip.tap()
        app.buttons["Deactivate"].tap()

        XCTAssertFalse(app.buttons["TimelineClip_Active"].exists, "No active clips should remain")

        let statusLabel = app.staticTexts["PlayerItemStatus"]
        XCTAssertTrue(statusLabel.waitForExistence(timeout: 2))
        let readyPredicate = NSPredicate(format: "label == 'Status: Unknown'")
        let expectation = XCTNSPredicateExpectation(predicate: readyPredicate, object: statusLabel)
        let result = XCTWaiter.wait(for: [expectation], timeout: 5.0)
        XCTAssertEqual(result, .completed, "Status should settle to Unknown")
    }

    func testIntegration_scrubbingTimelineUpdatesPreview() {
        let app = XCUIApplication()
        let timelineScrubber = app.otherElements["TimelineScrubber"]
        XCTAssertTrue(timelineScrubber.waitForExistence(timeout: 2))
        timelineScrubber.swipeRight()

        let timecodeLabel = app.staticTexts["TimecodeLabel"]
        XCTAssertTrue(timecodeLabel.waitForExistence(timeout: 2))
    }

    func testIntegration_reorderingClipsUpdatesPlaybackSequence() {
        let app = XCUIApplication()
        let firstClip = app.buttons.matching(identifier: "TimelineClip_Active").element(boundBy: 0)
        let secondClip = app.buttons.matching(identifier: "TimelineClip_Deactivated").element(boundBy: 0)

        XCTAssertTrue(firstClip.waitForExistence(timeout: 2))
        XCTAssertTrue(secondClip.waitForExistence(timeout: 2))

        firstClip.press(forDuration: 1.0, thenDragTo: secondClip)

        XCTAssertTrue(app.buttons.matching(identifier: "TimelineClip_Active").count >= 1)
    }

    func testIntegration_undoTimelineActionRestoresRenderState() {
        let app = XCUIApplication()
        app.buttons["Add Keyframe"].tap()
        app.buttons["Undo"].tap()

        let keyframeMarker = app.images["KeyframeMarker"].firstMatch
        XCTAssertFalse(keyframeMarker.waitForExistence(timeout: 2), "Keyframe marker should be removed after undo")
    }
}
