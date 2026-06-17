import XCTest

final class WorkspaceUITests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.
        continueAfterFailure = false
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    func testWorkspaceLaunchAndImportPresence() throws {
        // UI tests must launch the application that they test.
        let app = XCUIApplication()
        app.launch()

        // Verify the app launched and shows the default state
        XCTAssertTrue(app.staticTexts["No Active Sequence"].exists, "App should start with no active sequence")
        
        // Verify the Import button exists
        let importButton = app.buttons["Import Video"]
        XCTAssertTrue(importButton.exists, "Import Video button must be present")
        
        // Verify the sliders and timeline are not interactable or present until import (Optional, based on how the UI is structured)
        // We know Play/Pause is disabled when no player exists.
        let playButton = app.buttons["Play"] // The accessibility label for play.fill is often "Play" or we can check if it's disabled.
        if playButton.exists {
            XCTAssertFalse(playButton.isEnabled, "Play button should be disabled before importing video")
        }
    }
}
