import Foundation
import XCTest

final class CaptureGoogleHandoffRuntimeUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGoogleSignInOpensProtectedGoogleWebAuthenticationWithoutCredentials() {
        let environment = ProcessInfo.processInfo.environment
        let app = XCUIApplication()
        app.launchArguments.append("--capture-login-ui-preview")
        app.launchEnvironment["QUIPSLY_API_BASE_URL"] =
            environment["QUIPSLY_CAPTURE_UI_TEST_BASE_URL"]
            ?? "https://nest.quipsly.com"
        app.launch()

        let googleButton = app.buttons["QuipslyCaptureGoogleSignInButton"]
        XCTAssertTrue(
            googleButton.waitForExistence(timeout: 15),
            "The real compiled login surface should expose native Google sign-in."
        )
        XCTAssertTrue(googleButton.isEnabled)
        googleButton.tap()

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let providerAlert = springboard.alerts.firstMatch
        XCTAssertTrue(
            providerAlert.waitForExistence(timeout: 10),
            "A fresh simulator should show Apple's protected google.com web-auth prompt."
        )
        XCTAssertTrue(
            providerAlert.staticTexts.matching(
                NSPredicate(format: "label CONTAINS[c] %@", "google.com")
            ).firstMatch.exists,
            "The protected web-auth prompt should identify google.com before leaving Quipsly."
        )
        let continueButton = providerAlert.buttons["Continue"]
        XCTAssertTrue(
            continueButton.waitForExistence(timeout: 3),
            "Apple's protected web-auth prompt should offer Continue."
        )
        continueButton.tap()

        XCTAssertFalse(
            providerAlert.waitForExistence(timeout: 3),
            "Continue should leave the confirmation alert for Apple's isolated provider web-auth session."
        )
        XCTAssertTrue(
            googleButton.waitForExistence(timeout: 3),
            "Quipsly should remain alive behind the protected authentication session."
        )
        XCTAssertFalse(
            googleButton.isEnabled,
            "Quipsly should hold duplicate auth attempts while Google's protected session is active."
        )
    }
}

final class CaptureRoomRuntimeSmokeTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    private struct RuntimeSmokeCredentials {
        let credentialsPath: String?
        let baseURL: String
        let email: String
        let password: String
        let sessionID: String?
        let sessionTitle: String?
        let taskID: String?
        let taskEditSourceTitle: String?
        let taskEditUpdatedTitle: String?
        let goalEditSourceTitle: String?
        let goalEditUpdatedTitle: String?
        let noteID: String?
        let noteBodyBlockID: String?
        let noteEditSourceTitle: String?
        let noteEditUpdatedTitle: String?
        let noteEditSourceBody: String?
        let noteEditUpdatedBody: String?
        let annotationID: String?
        let annotationBody: String?
        let sourceInboxCaptureID: String?
        let sourceInboxTitle: String?
        let sourceInboxAnnotationBody: String?
        let sourceInboxTagLabel: String?
        let recurrenceSeriesID: String?
        let recurrenceScheduledLocalDate: String?
        let recurrenceAuthoringTitle: String?
        let recurrenceEditSourceTitle: String?
        let recurrenceEditFutureTitle: String?
        let recurrenceEditTimezone: String?
        let taggedTaskTitle: String?
        let tagLabel: String?
        let projectName: String?
        let projectTaskTitle: String?
        let projectTagLabel: String?
        let projectRetagLabel: String?
        let goalID: String?
        let planBlockID: String?
    }

    private func runtimeSmokeCredentials() throws -> RuntimeSmokeCredentials {
        let environment = ProcessInfo.processInfo.environment
        let envEmail = environment["QUIPSLY_CAPTURE_UI_TEST_EMAIL"] ?? ""
        let envPassword = environment["QUIPSLY_CAPTURE_UI_TEST_PASSWORD"] ?? ""
        if !envEmail.isEmpty && !envPassword.isEmpty {
            return RuntimeSmokeCredentials(
                credentialsPath: nil,
                baseURL: environment["QUIPSLY_CAPTURE_UI_TEST_BASE_URL"] ?? "http://127.0.0.1:3012",
                email: envEmail,
                password: envPassword,
                sessionID: environment["QUIPSLY_CAPTURE_UI_TEST_SESSION_ID"],
                sessionTitle: environment["QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE"],
                taskID: environment["QUIPSLY_CAPTURE_UI_TEST_TASK_ID"],
                taskEditSourceTitle: environment["QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_SOURCE_TITLE"],
                taskEditUpdatedTitle: environment["QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_UPDATED_TITLE"],
                goalEditSourceTitle: environment["QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_SOURCE_TITLE"],
                goalEditUpdatedTitle: environment["QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_UPDATED_TITLE"],
                noteID: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_ID"],
                noteBodyBlockID: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_BODY_BLOCK_ID"],
                noteEditSourceTitle: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_TITLE"],
                noteEditUpdatedTitle: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_TITLE"],
                noteEditSourceBody: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_BODY"],
                noteEditUpdatedBody: environment["QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_BODY"],
                annotationID: environment["QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_ID"],
                annotationBody: environment["QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_BODY"],
                sourceInboxCaptureID: environment["QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_CAPTURE_ID"],
                sourceInboxTitle: environment["QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_TITLE"],
                sourceInboxAnnotationBody: environment["QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_ANNOTATION_BODY"],
                sourceInboxTagLabel: environment["QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_TAG_LABEL"],
                recurrenceSeriesID: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_SERIES_ID"],
                recurrenceScheduledLocalDate: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_LOCAL_DATE"],
                recurrenceAuthoringTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_AUTHORING_TITLE"],
                recurrenceEditSourceTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_SOURCE_TITLE"],
                recurrenceEditFutureTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_FUTURE_TITLE"],
                recurrenceEditTimezone: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_TIMEZONE"],
                taggedTaskTitle: environment["QUIPSLY_CAPTURE_UI_TEST_TAGGED_TASK_TITLE"],
                tagLabel: environment["QUIPSLY_CAPTURE_UI_TEST_TAG_LABEL"],
                projectName: environment["QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME"],
                projectTaskTitle: environment["QUIPSLY_CAPTURE_UI_TEST_PROJECT_TASK_TITLE"],
                projectTagLabel: environment["QUIPSLY_CAPTURE_UI_TEST_PROJECT_TAG_LABEL"],
                projectRetagLabel: environment["QUIPSLY_CAPTURE_UI_TEST_PROJECT_RETAG_LABEL"],
                goalID: environment["QUIPSLY_CAPTURE_UI_TEST_GOAL_ID"],
                planBlockID: environment["QUIPSLY_CAPTURE_UI_TEST_PLAN_BLOCK_ID"]
            )
        }

        let credentialsPath = environment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"]
            ?? "/tmp/quipsly-capture-runtime-ui-smoke-credentials.json"
        guard FileManager.default.fileExists(atPath: credentialsPath) else {
            throw XCTSkip("Set QUIPSLY_CAPTURE_UI_TEST_EMAIL and QUIPSLY_CAPTURE_UI_TEST_PASSWORD, or run through run-capture-runtime-ui-smoke.sh so the short-lived credential packet exists.")
        }

        let data = try Data(contentsOf: URL(fileURLWithPath: credentialsPath))
        guard
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let email = payload["email"] as? String,
            let password = payload["password"] as? String,
            !email.isEmpty,
            !password.isEmpty
        else {
            throw XCTSkip("Capture runtime UI smoke credential packet is missing email/password.")
        }

        return RuntimeSmokeCredentials(
            credentialsPath: credentialsPath,
            baseURL: (payload["baseURL"] as? String) ?? "http://127.0.0.1:3012",
            email: email,
            password: password,
            sessionID: payload["sessionID"] as? String,
            sessionTitle: payload["sessionTitle"] as? String,
            taskID: payload["taskID"] as? String,
            taskEditSourceTitle: payload["taskEditSourceTitle"] as? String,
            taskEditUpdatedTitle: payload["taskEditUpdatedTitle"] as? String,
            goalEditSourceTitle: payload["goalEditSourceTitle"] as? String,
            goalEditUpdatedTitle: payload["goalEditUpdatedTitle"] as? String,
            noteID: payload["noteID"] as? String,
            noteBodyBlockID: payload["noteBodyBlockID"] as? String,
            noteEditSourceTitle: payload["noteEditSourceTitle"] as? String,
            noteEditUpdatedTitle: payload["noteEditUpdatedTitle"] as? String,
            noteEditSourceBody: payload["noteEditSourceBody"] as? String,
            noteEditUpdatedBody: payload["noteEditUpdatedBody"] as? String,
            annotationID: payload["annotationID"] as? String,
            annotationBody: payload["annotationBody"] as? String,
            sourceInboxCaptureID: payload["sourceInboxCaptureID"] as? String,
            sourceInboxTitle: payload["sourceInboxTitle"] as? String,
            sourceInboxAnnotationBody: payload["sourceInboxAnnotationBody"] as? String,
            sourceInboxTagLabel: payload["sourceInboxTagLabel"] as? String,
            recurrenceSeriesID: payload["recurrenceSeriesID"] as? String,
            recurrenceScheduledLocalDate: payload["recurrenceScheduledLocalDate"] as? String,
            recurrenceAuthoringTitle: payload["recurrenceAuthoringTitle"] as? String,
            recurrenceEditSourceTitle: payload["recurrenceEditSourceTitle"] as? String,
            recurrenceEditFutureTitle: payload["recurrenceEditFutureTitle"] as? String,
            recurrenceEditTimezone: payload["recurrenceEditTimezone"] as? String,
            taggedTaskTitle: payload["taggedTaskTitle"] as? String,
            tagLabel: payload["tagLabel"] as? String,
            projectName: payload["projectName"] as? String,
            projectTaskTitle: payload["projectTaskTitle"] as? String,
            projectTagLabel: payload["projectTagLabel"] as? String,
            projectRetagLabel: payload["projectRetagLabel"] as? String,
            goalID: payload["goalID"] as? String,
            planBlockID: payload["planBlockID"] as? String
        )
    }

    private func launchSignedInCaptureApp(
        baseURLOverride: String? = nil,
        expectProtectedOfflineShell: Bool = false
    ) throws -> XCUIApplication {
        let credentials = try runtimeSmokeCredentials()
        let app = XCUIApplication()
        app.launchEnvironment["QUIPSLY_API_BASE_URL"] = baseURLOverride ?? credentials.baseURL
        if let credentialsPath = credentials.credentialsPath {
            app.launchEnvironment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"] = credentialsPath
        }
        app.launchArguments.append("--quipsly-capture-runtime-smoke")
        app.launch()

        if expectProtectedOfflineShell {
            XCTAssertTrue(
                app.descendants(matching: .any)["CaptureOfflineAccessBanner"].waitForExistence(timeout: 30),
                "A recently verified account should open the protected offline shell when Nest is unreachable."
            )
            return app
        }

        signInIfNeeded(app, credentials: credentials)
        XCTAssertTrue(
            app.scrollViews["CaptureTodayView"].waitForExistence(timeout: 60),
            "The native auth transaction should finish and load the signed-in Today surface before workflow navigation begins."
        )
        return app
    }

    private func signInIfNeeded(_ app: XCUIApplication, credentials: RuntimeSmokeCredentials) {
        let emailField = app.textFields["QuipslyCaptureEmailField"]
        if emailField.waitForExistence(timeout: 8) {
            // A restored Firebase session can replace the briefly rendered
            // login form while XCTest is resolving it. Only type into a form
            // that remains present after that startup transition settles.
            RunLoop.current.run(until: Date().addingTimeInterval(1))
            guard emailField.exists else { return }
            if (emailField.value as? String) != credentials.email {
                emailField.tap()
                emailField.typeKey("a", modifierFlags: .command)
                emailField.typeKey(.delete, modifierFlags: [])
                emailField.typeText(credentials.email)
            }

            let passwordField = app.secureTextFields["QuipslyCapturePasswordField"]
            XCTAssertTrue(passwordField.waitForExistence(timeout: 4), "Password field should be visible on the real native login surface.")
            let currentPassword = passwordField.value as? String
            if currentPassword == nil || currentPassword?.isEmpty == true || currentPassword == "Password" {
                passwordField.tap()
                passwordField.typeText(credentials.password)
            }

            let signInButton = app.buttons["QuipslyCaptureSignInButton"]
            XCTAssertTrue(signInButton.waitForExistence(timeout: 4), "Sign-in button should be visible on the real native login surface.")
            signInButton.tap()
        }
    }

    private func waitForRuntimeElement(_ element: XCUIElement, in app: XCUIApplication, timeout: TimeInterval = 18, swipeAttempts: Int = 8) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var attempts = 0
        while Date() < deadline {
            if element.exists { return true }
            if attempts < swipeAttempts {
                let recorderSurface = app.scrollViews.firstMatch
                if recorderSurface.exists && recorderSurface.isHittable {
                    recorderSurface.swipeUp()
                } else {
                    app.swipeUp()
                }
                attempts += 1
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        return element.exists
    }

    private func waitForRuntimeLabel(_ expectedLabel: String, element: XCUIElement, timeout: TimeInterval = 20) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists && element.label == expectedLabel { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        }
        return element.exists && element.label == expectedLabel
    }

    private func tapRootTab(_ title: String, in app: XCUIApplication) {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 20), "Signed-in Capture should expose its root tab bar.")
        let button = tabBar.buttons[title].firstMatch
        XCTAssertTrue(button.waitForExistence(timeout: 8), "Capture should expose the \(title) root tab.")
        button.tap()
        let selected = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "selected == true"),
            object: button
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [selected], timeout: 5),
            .completed,
            "Capture should visibly select the \(title) root tab."
        )
    }

    private func quickEntryRetryButton(in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(
            NSPredicate(
                format: "identifier == %@ OR label == %@",
                "CaptureQuickEntryRetry",
                "Retry protected captures"
            )
        ).firstMatch
    }

    private func openTaskTagEditor(taskID: String, in app: XCUIApplication) {
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }
        let edit = app.buttons["CaptureTodayTaskTagsEdit_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(edit, in: app, timeout: 30, swipeAttempts: 12),
            "Today should expose tag editing for the exact writable canonical task."
        )
        XCTAssertTrue(edit.isEnabled)
        edit.tap()
        XCTAssertTrue(app.navigationBars["Edit tags"].waitForExistence(timeout: 8))
    }

    private func workTagChoice(label: String, in app: XCUIApplication) -> XCUIElement {
        let choice = app.buttons.matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
                "CaptureTodayWorkTag_",
                label
            )
        ).firstMatch
        var usedSearch: XCUIElement?
        if !choice.waitForExistence(timeout: 2) {
            let search = app.searchFields["Find a tag"].firstMatch
            XCTAssertTrue(
                search.waitForExistence(timeout: 5),
                "The canonical tag editor should expose its search control."
            )
            search.tap()
            search.typeText(label)
            usedSearch = search
        }
        XCTAssertTrue(
            choice.waitForExistence(timeout: 8),
            "The exact reusable Nest tag should be selectable on iPhone."
        )
        usedSearch?.typeKey(.return, modifierFlags: [])
        return choice
    }

    private func saveWorkTags(taskID: String, in app: XCUIApplication, expectImmediateReadback: Bool) {
        let save = app.buttons["CaptureTodayWorkTagsSave"].firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertTrue(save.isHittable)
        save.tap()
        let pending = app.descendants(matching: .any)["CaptureTodayTaskTagsPending_\(taskID)"].firstMatch
        if expectImmediateReadback {
            let deadline = Date().addingTimeInterval(30)
            while pending.exists && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
            }
            XCTAssertFalse(pending.exists, "Exact Nest readback should clear the protected phone tag decision.")
        } else {
            XCTAssertTrue(
                waitForRuntimeElement(pending, in: app, timeout: 8, swipeAttempts: 12),
                "An offline tag decision should remain visibly protected for Nest."
            )
        }
    }

    private func selectRequestedSession(in app: XCUIApplication, credentials: RuntimeSmokeCredentials) {
        let sessionChooser = app.buttons["CaptureSessionChooser"].firstMatch
        XCTAssertTrue(
            sessionChooser.waitForExistence(timeout: 12),
            "The selected capture session should remain visible and addressable."
        )

        if let sessionID = credentials.sessionID, !sessionID.isEmpty {
            sessionChooser.tap()
            let exactSession = app.descendants(matching: .any)["CaptureSessionPicker_\(sessionID)"].firstMatch
            XCTAssertTrue(
                exactSession.waitForExistence(timeout: 8),
                "The exact canonical Session ID should be selectable in the native runtime."
            )
            exactSession.tap()
        } else if let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty,
                  !sessionChooser.label.contains(sessionTitle) {
            sessionChooser.tap()
            let titledSession = app.buttons.matching(
                NSPredicate(format: "label CONTAINS %@", sessionTitle)
            ).firstMatch
            XCTAssertTrue(
                titledSession.waitForExistence(timeout: 8),
                "The requested real Session title should be selectable in the native runtime."
            )
            titledSession.tap()
        }

        if let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty {
            XCTAssertTrue(
                app.staticTexts[sessionTitle].firstMatch.waitForExistence(timeout: 8),
                "The Record surface should show the exact selected real Session title."
            )
        }
    }

    private func turnOn(_ toggle: XCUIElement, in app: XCUIApplication) {
        guard (toggle.value as? String) != "1" else { return }
        let visibleBottom = app.windows.firstMatch.frame.maxY - 24
        var scrollAttempts = 0
        while toggle.frame.maxY > visibleBottom, scrollAttempts < 4 {
            let consentForm = app.collectionViews.firstMatch
            if consentForm.exists {
                consentForm.swipeUp()
            } else {
                app.swipeUp()
            }
            scrollAttempts += 1
        }
        // SwiftUI exposes the Toggle's explanatory label and trailing switch as
        // one accessibility frame. Tap the actual switch affordance instead of
        // the center of a long label row, which is intentionally non-mutating.
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let enabled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == '1'"),
            object: toggle
        )
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 3), .completed)
    }

    private func recordingIdentifiers(in app: XCUIApplication, prefix: String) -> Set<String> {
        Set(
            app.descendants(matching: .any)
                .matching(NSPredicate(format: "identifier BEGINSWITH %@", prefix))
                .allElementsBoundByIndex
                .map(\.identifier)
        )
    }

    private func waitForNewRecordingRow(
        in app: XCUIApplication,
        excluding existing: Set<String>,
        timeout: TimeInterval = 12
    ) -> XCUIElement? {
        let deadline = Date().addingTimeInterval(timeout)
        repeat {
            let rows = app.descendants(matching: .any)
                .matching(NSPredicate(format: "identifier BEGINSWITH %@", "LocalRecordingRow_"))
                .allElementsBoundByIndex
            if let row = rows.first(where: { !existing.contains($0.identifier) }) {
                return row
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        } while Date() < deadline
        return nil
    }

    private func attachRecordingIdentity(_ identifier: String, name: String) {
        let attachment = XCTAttachment(string: identifier)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func saveQuickEntry(
        kind: String,
        title: String? = nil,
        body: String,
        expectedMessage: String,
        sessionID: String,
        newTagLabel: String? = nil,
        in app: XCUIApplication
    ) {
        let entryButton = app.buttons["CaptureQuickEntry_\(kind)_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(entryButton, in: app, timeout: 20, swipeAttempts: 8),
            "The real Record surface should expose the \(kind.lowercased()) quick-capture action for the exact Session."
        )
        entryButton.tap()

        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_\(kind)"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))
        if let title {
            let titleField = app.textFields["CaptureQuickEntryTitle"].firstMatch
            XCTAssertTrue(titleField.waitForExistence(timeout: 4))
            titleField.tap()
            titleField.typeText(title)
        }
        let bodyField = app.textFields["CaptureQuickEntryBody"].firstMatch
        XCTAssertTrue(bodyField.waitForExistence(timeout: 4))
        bodyField.tap()
        bodyField.typeText(body)

        if let newTagLabel {
            let tagField = app.textFields["CaptureQuickEntryNewTagField"].firstMatch
            for _ in 0..<10 where !tagField.isHittable {
                app.swipeUp()
            }
            XCTAssertTrue(tagField.isHittable, "The signed-in quick capture sheet should expose reusable Nest tag authoring.")
            tagField.tap()
            tagField.typeText(newTagLabel)
            let addTag = app.buttons["CaptureQuickEntryNewTagAdd"].firstMatch
            XCTAssertTrue(addTag.isEnabled)
            addTag.tap()
            XCTAssertTrue(app.buttons["Remove new tag \(newTagLabel)"].waitForExistence(timeout: 4))
            XCTAssertTrue(app.staticTexts["New on sync"].exists)
        }

        let save = app.buttons["CaptureQuickEntrySave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        XCTAssertTrue(
            app.staticTexts[expectedMessage].firstMatch.waitForExistence(timeout: 20),
            "Nest should acknowledge the canonical \(kind.lowercased()) before this operated journey continues."
        )
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists, "A successful sync must not leave a retryable phone record behind.")
    }

    func testIPhoneCreatesReusableNestTagWithCanonicalTask() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let taskTitle = credentials.taggedTaskTitle, !taskTitle.isEmpty,
              let tagLabel = credentials.tagLabel, !tagLabel.isEmpty else {
            throw XCTSkip("Tag authoring requires an exact Session ID, unique Task title, and unique tag label.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        saveQuickEntry(
            kind: "TASK",
            title: taskTitle,
            body: "Created from the signed native Capture app to prove one reusable tag identity reaches the canonical Nest.",
            expectedMessage: "The task is saved and assigned to you. Set its timing from Today, Work, or Calendar when useful.",
            sessionID: sessionID,
            newTagLabel: tagLabel,
            in: app
        )
    }

    func testIPhoneCapturesTaggedTaskDirectlyIntoWritableNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let projectName = credentials.projectName,
              !projectName.isEmpty,
              let taskTitle = credentials.projectTaskTitle,
              !taskTitle.isEmpty,
              let tagLabel = credentials.projectTagLabel,
              !tagLabel.isEmpty,
              let retagLabel = credentials.projectRetagLabel,
              !retagLabel.isEmpty else {
            throw XCTSkip("Direct project capture requires one writable Nest name, unique Task title, and two existing canonical tag labels.")
        }

        let app = try launchSignedInCaptureApp()
        tapRootTab("Work", in: app)
        XCTAssertTrue(app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 20))
        let projectPicker = app.descendants(matching: .any)["CaptureWorkProjectPicker"].firstMatch
        XCTAssertTrue(projectPicker.waitForExistence(timeout: 10))
        projectPicker.tap()
        let projectChoice = app.buttons[projectName].firstMatch
        XCTAssertTrue(projectChoice.waitForExistence(timeout: 6))
        projectChoice.tap()
        XCTAssertTrue(
            app.staticTexts[projectName].firstMatch.waitForExistence(timeout: 15),
            "Work should read the selected canonical Nest before capture."
        )
        let taskButton = app.buttons["CaptureWorkQuickEntry_TASK"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(taskButton, in: app, timeout: 20, swipeAttempts: 8),
            "Work should expose Quick Task for the selected writable Nest."
        )
        taskButton.tap()

        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Destination, \(projectName)")
        ).firstMatch.waitForExistence(timeout: 4), "Work quick capture should arrive pre-bound to the selected project.")
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Project capture, No Session invented")
        ).firstMatch.exists)

        let title = app.textFields["CaptureQuickEntryTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.tap()
        title.typeText(taskTitle)
        let keyboardDone = app.buttons["CaptureQuickEntryKeyboardDone"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 4))
        keyboardDone.tap()
        let body = app.textFields["CaptureQuickEntryBody"].firstMatch
        XCTAssertTrue(body.isHittable)
        body.tap()
        body.typeText("Captured on iPhone directly into its real project with the reusable canonical taxonomy.")
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 4))
        keyboardDone.tap()

        let search = app.textFields["CaptureQuickEntryTagSearch"].firstMatch
        for _ in 0..<3 where !search.isHittable {
            sheet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
                .press(
                    forDuration: 0.05,
                    thenDragTo: sheet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.48))
                )
            RunLoop.current.run(until: Date().addingTimeInterval(0.8))
        }
        XCTAssertTrue(search.isHittable)
        search.tap()
        search.typeText(tagLabel)
        let tagKeyboardDone = app.buttons["CaptureQuickEntryKeyboardDone"].firstMatch
        XCTAssertTrue(tagKeyboardDone.waitForExistence(timeout: 4))
        tagKeyboardDone.tap()
        let tag = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", tagLabel)
        ).firstMatch
        XCTAssertTrue(tag.waitForExistence(timeout: 4))
        XCTAssertTrue(tag.isHittable)
        tag.tap()
        expectation(for: NSPredicate(format: "value == %@", "Selected"), evaluatedWith: tag)
        waitForExpectations(timeout: 4)

        let save = app.buttons["CaptureQuickEntrySave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        let expectedMessage = "The task is saved in \(projectName) and assigned to you. Set its timing from Today, Work, or Calendar when useful."
        let acknowledgement = app.staticTexts.matching(
            NSPredicate(format: "label == %@", expectedMessage)
        ).firstMatch
        XCTAssertTrue(
            acknowledgement.waitForExistence(timeout: 30)
        )
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[taskTitle].firstMatch, in: app, timeout: 30, swipeAttempts: 10),
            "The same signed iPhone Work surface should read the new canonical task back from Nest."
        )

        let editTags = app.buttons["Edit tags for \(taskTitle)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(editTags, in: app, timeout: 20, swipeAttempts: 10),
            "The canonical task should expose its reusable Nest tags directly in Work."
        )
        for _ in 0..<6 where !editTags.isHittable { app.swipeUp() }
        XCTAssertTrue(editTags.isHittable)
        editTags.tap()
        XCTAssertTrue(app.navigationBars["Edit tags"].waitForExistence(timeout: 8))

        let secondTag = workTagChoice(label: retagLabel, in: app)
        XCTAssertNotEqual(secondTag.value as? String, "Selected", "The operated proof needs a genuinely new second tag assignment.")
        let tagList = app.collectionViews.firstMatch
        for _ in 0..<8 where !secondTag.isHittable {
            tagList.swipeUp()
        }
        XCTAssertTrue(secondTag.isHittable)
        secondTag.tap()
        expectation(for: NSPredicate(format: "value == %@", "Selected"), evaluatedWith: secondTag)
        waitForExpectations(timeout: 4)

        let saveTags = app.buttons["CaptureTodayWorkTagsSave"].firstMatch
        XCTAssertTrue(saveTags.waitForExistence(timeout: 5))
        XCTAssertTrue(saveTags.isHittable)
        saveTags.tap()
        XCTAssertTrue(app.navigationBars["Edit tags"].waitForNonExistence(timeout: 8))
        let retagReadback = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "#\(retagLabel)")
        ).firstMatch
        XCTAssertTrue(
            retagReadback.waitForExistence(timeout: 30),
            "Work should read the added canonical tag back on the same task surface."
        )
        attachRecordingIdentity(taskTitle, name: "Direct project iPhone task title")
    }

    func testPersonalHomeNestNoteSyncsToDocumentKernel() throws {
        let credentials = try runtimeSmokeCredentials()
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)

        let noteButton = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureQuickEntry_NOTE_")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(noteButton, in: app, timeout: 20, swipeAttempts: 8),
            "Record should expose Quick Note even when the next Session is selected."
        )
        noteButton.tap()
        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryNoteDestination"].firstMatch
        XCTAssertTrue(destination.waitForExistence(timeout: 4))
        destination.tap()
        XCTAssertTrue(app.buttons["Home Nest"].waitForExistence(timeout: 4))
        app.buttons["Home Nest"].tap()

        let environment = ProcessInfo.processInfo.environment
        let titleText = environment["QUIPSLY_CAPTURE_UI_TEST_PERSONAL_NOTE_TITLE"]
            ?? "Native Home Nest note \(credentials.email)"
        let bodyText = "This signed iPhone note must converge through the protected outbox into one private document-kernel identity."
        let tagText = environment["QUIPSLY_CAPTURE_UI_TEST_PERSONAL_NOTE_TAG"]
            ?? "Native note proof"
        let title = app.textFields["CaptureQuickEntryTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.tap()
        title.typeText(titleText)
        let body = app.textFields["CaptureQuickEntryBody"].firstMatch
        body.tap()
        body.typeText(bodyText)
        let tag = app.textFields["CaptureQuickEntryNewTagField"].firstMatch
        for _ in 0..<10 where !tag.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(tag.isHittable)
        tag.tap()
        tag.typeText(tagText)
        app.buttons["CaptureQuickEntryNewTagAdd"].tap()
        app.buttons["CaptureQuickEntrySave"].tap()

        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        XCTAssertTrue(
            app.staticTexts["The private note is saved in your Home Nest document kernel. Continue it from Library or Search."].waitForExistence(timeout: 20)
        )
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
        attachRecordingIdentity(titleText, name: "Personal Home Nest note title")
    }

    func testPersonalHomeNestNoteSurvivesOfflineRelaunchAndConverges() throws {
        let credentials = try runtimeSmokeCredentials()
        let proofID = UUID().uuidString.lowercased().prefix(8)
        let titleText = "Offline Home Nest note \(credentials.email) \(proofID)"
        let bodyText = "This private note was saved without Nest, survived process death, and must converge under one canonical identity."
        let tagText = "Offline note proof"

        // Warm the verified account and protected Session snapshot before
        // deliberately removing Nest from the phone's reachable network.
        var app = try launchSignedInCaptureApp()
        app.terminate()

        app = try launchSignedInCaptureApp(
            baseURLOverride: "http://127.0.0.1:9",
            expectProtectedOfflineShell: true
        )
        let noteButton = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureQuickEntry_NOTE_")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(noteButton, in: app, timeout: 20, swipeAttempts: 8),
            "Protected offline access must keep personal Quick Note available."
        )
        noteButton.tap()
        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryNoteDestination"].firstMatch
        if destination.waitForExistence(timeout: 4) {
            destination.tap()
            if app.buttons["Home Nest"].waitForExistence(timeout: 4) {
                app.buttons["Home Nest"].tap()
            }
        }

        let title = app.textFields["CaptureQuickEntryTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.tap()
        title.typeText(titleText)
        let body = app.textFields["CaptureQuickEntryBody"].firstMatch
        body.tap()
        body.typeText(bodyText)
        let tag = app.textFields["CaptureQuickEntryNewTagField"].firstMatch
        for _ in 0..<10 where !tag.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(tag.isHittable)
        tag.tap()
        tag.typeText(tagText)
        app.buttons["CaptureQuickEntryNewTagAdd"].tap()
        app.buttons["CaptureQuickEntrySave"].tap()

        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        let retry = quickEntryRetryButton(in: app)
        XCTAssertTrue(
            waitForRuntimeElement(retry, in: app, timeout: 20, swipeAttempts: 8),
            "Unreachable Nest must leave the exact personal note visibly queued on the iPhone."
        )
        XCTAssertTrue(app.staticTexts["1 quick capture waiting"].exists)
        XCTAssertTrue(app.staticTexts["Note · \(titleText)"].exists)
        app.terminate()

        // A second offline process must read the same account-partitioned
        // journal entry rather than asking the person to recreate the note.
        app = try launchSignedInCaptureApp(
            baseURLOverride: "http://127.0.0.1:9",
            expectProtectedOfflineShell: true
        )
        let relaunchedTitle = app.staticTexts["Note · \(titleText)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(relaunchedTitle, in: app, timeout: 20, swipeAttempts: 8),
            "The protected outbox must render the exact same note after process death."
        )
        XCTAssertTrue(app.staticTexts["1 quick capture waiting"].exists)
        XCTAssertTrue(app.staticTexts["Saved on iPhone · waiting for Nest"].exists)
        XCTAssertTrue(quickEntryRetryButton(in: app).exists)
        app.terminate()

        // Reconnect through the normal signed lane. Startup reconciliation
        // must acknowledge the same UUID before removing the phone copy.
        app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        XCTAssertTrue(
            app.staticTexts["The private note is saved in your Home Nest document kernel. Continue it from Library or Search."].waitForExistence(timeout: 30)
        )
        XCTAssertFalse(quickEntryRetryButton(in: app).exists)
        attachRecordingIdentity(titleText, name: "Offline personal Home Nest note title")
    }

    func testCoachingQuickEntriesSyncToCanonicalNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty else {
            throw XCTSkip("The coaching quick-entry journey requires an exact canonical Session ID.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        saveQuickEntry(
            kind: "NOTE",
            body: "Coaching insight: sustainable progress needs one protected editing block before the next session.",
            expectedMessage: "The private Session note is saved. Review or expand it from the Session workspace.",
            sessionID: sessionID,
            in: app
        )
        saveQuickEntry(
            kind: "TASK",
            title: "Protect one 50-minute editing block before the next coaching session",
            body: "Put the block on Quipsly Calendar, then bring what changed to the next session.",
            expectedMessage: "The task is saved and assigned to you. Set its timing from Today, Work, or Calendar when useful.",
            sessionID: sessionID,
            in: app
        )
        saveQuickEntry(
            kind: "GOAL",
            title: "Build a sustainable weekly editing rhythm",
            body: "Progress means completing one protected editing block and bringing honest evidence to the next coaching session.",
            expectedMessage: "The goal is saved as active. Add progress evidence or supporting tasks when useful.",
            sessionID: sessionID,
            in: app
        )
    }

    func testClientSafeDecisionCreatesEditsAndRelaunchesFromProtectedIPhoneOutbox() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty else {
            throw XCTSkip("The client-safe Session note journey requires an exact canonical Session ID.")
        }
        let proofID = UUID().uuidString.lowercased().prefix(8)
        let bodyText = "Client-safe iPhone decision \(proofID): name the next experiment without sending a message."
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let entryButton = app.buttons["CaptureQuickEntry_NOTE_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(entryButton, in: app, timeout: 20, swipeAttempts: 8),
            "The selected real Session should expose Quick Note."
        )
        entryButton.tap()
        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))

        let purpose = app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(purpose, in: app, timeout: 20, swipeAttempts: 8))
        purpose.tap()
        XCTAssertTrue(app.buttons["Decision"].waitForExistence(timeout: 4))
        app.buttons["Decision"].tap()

        let audience = app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(audience, in: app, timeout: 10, swipeAttempts: 4))
        audience.tap()
        XCTAssertTrue(app.buttons["Client-safe"].waitForExistence(timeout: 4))
        app.buttons["Client-safe"].tap()
        let policyBoundary = app.descendants(matching: .any)["CaptureQuickEntryNotePolicyBoundary"].firstMatch
        XCTAssertTrue(policyBoundary.exists)
        XCTAssertTrue(policyBoundary.label.contains("not sent"))

        let body = app.textFields["CaptureQuickEntryBody"].firstMatch
        for _ in 0..<8 where !body.isHittable {
            app.swipeDown()
        }
        XCTAssertTrue(body.isHittable)
        body.tap()
        body.typeText(bodyText)
        let keyboardDone = app.buttons["CaptureQuickEntryKeyboardDone"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 3))
        keyboardDone.tap()

        let save = app.buttons["CaptureQuickEntrySave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        XCTAssertTrue(
            app.staticTexts["The client-safe Session note is saved and ready for reviewed follow-up. It has not been sent."]
                .waitForExistence(timeout: 30),
            "Nest must acknowledge the canonical audience while refusing to imply delivery."
        )
        XCTAssertFalse(quickEntryRetryButton(in: app).exists)

        let notesCard = app.descendants(matching: .any)["CaptureSessionNotesToggle"].firstMatch
        for _ in 0..<12 where !notesCard.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(notesCard.isHittable, "The Record surface should expose canonical Session Notes after sync.")
        notesCard.tap()
        let canonicalDecision = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureSessionNoteCanonical_")
        ).firstMatch
        XCTAssertTrue(
            canonicalDecision.waitForExistence(timeout: 10),
            "The expanded Session Notes card should expose a canonical note identity."
        )
        let canonicalBody = app.staticTexts[bodyText].firstMatch
        XCTAssertTrue(
            canonicalBody.waitForExistence(timeout: 10),
            "The canonical note identity should contain the exact client-safe Decision body after its outbox is acknowledged."
        )
        let canonicalPrefix = "CaptureSessionNoteCanonical_"
        XCTAssertTrue(canonicalDecision.identifier.hasPrefix(canonicalPrefix))
        let noteID = String(canonicalDecision.identifier.dropFirst(canonicalPrefix.count))
        XCTAssertFalse(noteID.isEmpty)

        let editButton = app.buttons["CaptureSessionNoteEdit_\(noteID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(editButton, in: app, timeout: 15, swipeAttempts: 8),
            "The author should be able to edit the exact canonical note created by the iPhone."
        )
        editButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureSessionNoteEditSheet"].waitForExistence(timeout: 8))

        let editedTitle = "Reviewed iPhone decision \(proofID)"
        let editedBody = "Private iPhone revision \(proofID): run the experiment, retain the evidence, and do not send a message."
        let title = app.textFields["CaptureSessionNoteEditTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeKey("a", modifierFlags: .command)
        title.typeText(editedTitle)
        let editBody = app.textFields["CaptureSessionNoteEditBody"].firstMatch
        XCTAssertTrue(editBody.exists)
        editBody.tap()
        editBody.typeKey("a", modifierFlags: .command)
        editBody.typeText(editedBody)
        let editKeyboardDone = app.buttons["CaptureSessionNoteEditKeyboardDone"].firstMatch
        XCTAssertTrue(editKeyboardDone.waitForExistence(timeout: 3))
        editKeyboardDone.tap()

        let editPurpose = app.descendants(matching: .any)["CaptureSessionNoteEditKind"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(editPurpose, in: app, timeout: 12, swipeAttempts: 5))
        editPurpose.tap()
        XCTAssertTrue(app.buttons["Session note"].waitForExistence(timeout: 4))
        app.buttons["Session note"].tap()
        let editAudience = app.descendants(matching: .any)["CaptureSessionNoteEditVisibility"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(editAudience, in: app, timeout: 10, swipeAttempts: 5))
        editAudience.tap()
        XCTAssertTrue(app.buttons["Only me"].waitForExistence(timeout: 4))
        app.buttons["Only me"].tap()

        let firstTag = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureSessionNoteEditTag_")
        ).firstMatch
        let editForm = app.collectionViews.firstMatch
        for _ in 0..<12 where !firstTag.isHittable {
            editForm.swipeUp()
        }
        XCTAssertTrue(
            firstTag.isHittable,
            "A writable Session Nest should expose its canonical tag vocabulary in the iPhone editor."
        )
        let selectedTagLabel = firstTag.label
        let selectedTagText = selectedTagLabel.hasPrefix("#") ? selectedTagLabel : "#\(selectedTagLabel)"
        firstTag.tap()
        XCTAssertEqual(firstTag.value as? String, "Selected")

        let editPolicy = app.descendants(matching: .any)["CaptureSessionNoteEditPolicyBoundary"].firstMatch
        XCTAssertTrue(editPolicy.exists)
        XCTAssertTrue(editPolicy.label.contains("never sends a message"))
        let saveEdit = app.buttons["CaptureSessionNoteEditSave"].firstMatch
        for _ in 0..<8 where !saveEdit.isHittable {
            editForm.swipeUp()
        }
        XCTAssertTrue(saveEdit.isHittable)
        XCTAssertTrue(saveEdit.isEnabled)
        saveEdit.tap()
        XCTAssertTrue(
            app.staticTexts[
                "The canonical Session note, audience, and tags are updated with a new revision. Nothing was sent or published."
            ].waitForExistence(timeout: 30),
            "The protected edit must remain queued until Nest acknowledges the exact revision, audience, and tag set."
        )
        XCTAssertTrue(app.staticTexts[editedBody].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Session note"].exists)
        XCTAssertTrue(app.staticTexts["Only me"].exists)
        XCTAssertTrue(app.staticTexts[selectedTagText].exists)
        XCTAssertFalse(app.descendants(matching: .any)["CaptureSessionNoteEditState_\(noteID)"].exists)

        app.terminate()
        let relaunched = try launchSignedInCaptureApp()
        tapRootTab("Record", in: relaunched)
        selectRequestedSession(in: relaunched, credentials: credentials)
        let relaunchedNotes = relaunched.descendants(matching: .any)["CaptureSessionNotesToggle"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(relaunchedNotes, in: relaunched, timeout: 20, swipeAttempts: 10))
        relaunchedNotes.tap()
        XCTAssertTrue(
            relaunched.staticTexts[editedBody].waitForExistence(timeout: 15),
            "A fresh signed app launch must read the edited canonical note back from Nest, not a phone-only draft."
        )
        XCTAssertTrue(relaunched.staticTexts[selectedTagText].exists)
        XCTAssertFalse(relaunched.descendants(matching: .any)["CaptureSessionNoteEditState_\(noteID)"].exists)

        let deliveryBoundary = relaunched.descendants(matching: .any)["CaptureSessionNotesDeliveryBoundary"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(deliveryBoundary, in: relaunched, timeout: 10, swipeAttempts: 6))
        XCTAssertTrue(deliveryBoundary.label.contains("not a delivery receipt"))
        attachRecordingIdentity("\(proofID):\(noteID)", name: "Session-note create/edit/relaunch proof identity")
    }

    func testCoachingFollowThroughReadsSameCanonicalTodayRecords() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let goalID = credentials.goalID, !goalID.isEmpty,
              let planBlockID = credentials.planBlockID, !planBlockID.isEmpty else {
            throw XCTSkip("The cross-device Today journey requires exact canonical task, goal, and plan-block IDs.")
        }
        let app = try launchSignedInCaptureApp()

        let focus = app.descendants(matching: .any)["CaptureTodayFocusBlock_\(planBlockID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(focus, in: app, timeout: 30, swipeAttempts: 6),
            "Today should render the exact Calendar focus-block identity created in Nest."
        )
        XCTAssertTrue(app.staticTexts["Protect one 50-minute editing block before the next coaching session"].firstMatch.exists)
        let focusWindow = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Jul 20", "10:00")
        ).firstMatch
        XCTAssertTrue(focusWindow.exists, "Today should show the same Monday 10:00 AM Calendar window.")
        let blockDone = app.buttons["CaptureTodayFocusDoneButton"].firstMatch
        XCTAssertTrue(blockDone.exists)
        XCTAssertTrue(blockDone.isEnabled, "The signed-in owner may complete the focus block, but this proof must leave it planned until the work actually happens.")

        let task = app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(task, in: app, timeout: 15, swipeAttempts: 8),
            "Today should render the exact iPhone-created canonical task identity."
        )
        XCTAssertTrue(app.staticTexts["Protect one 50-minute editing block before the next coaching session"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Homer coaching workflow rehearsal"].firstMatch.exists)

        let goal = app.descendants(matching: .any)["CaptureTodayGoal_\(goalID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(goal, in: app, timeout: 15, swipeAttempts: 10),
            "Today should render the exact iPhone-created canonical goal identity."
        )
        XCTAssertTrue(app.staticTexts["Build a sustainable weekly editing rhythm"].firstMatch.exists)

        let boundary = app.descendants(matching: .any)["CaptureTodayFollowThroughBoundary"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(boundary, in: app, timeout: 10, swipeAttempts: 10))
        XCTAssertTrue(boundary.label.contains("Focus completion never completes its task or goal."))

    }

    func testOneTimeTaskReminderCancelsAndReactivatesThroughNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty else {
            throw XCTSkip("The reminder journey requires one exact non-recurring open task ID.")
        }
        let app = try launchSignedInCaptureApp()

        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }

        let cancel = app.buttons["CaptureTodayTaskReminderCancel_\(taskID)"].firstMatch
        if waitForRuntimeElement(cancel, in: app, timeout: 8, swipeAttempts: 12) {
            cancel.tap()
            let confirmCancel = app.buttons["Cancel reminder"].firstMatch
            XCTAssertTrue(confirmCancel.waitForExistence(timeout: 5))
            confirmCancel.tap()
        }

        let edit = app.buttons["CaptureTodayTaskReminderEdit_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(edit, in: app, timeout: 30, swipeAttempts: 12),
            "Canonical cancellation should reload the same task with an Add reminder control."
        )
        edit.tap()

        let save = app.buttons["CaptureTodayTaskReminderSave"].firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 8))
        save.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 5) {
            let allow = springboard.alerts.firstMatch.buttons["Allow"].firstMatch
            if allow.exists { allow.tap() }
        }

        let reminder = app.descendants(matching: .any)["CaptureTodayTaskReminder_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(reminder, in: app, timeout: 30, swipeAttempts: 12),
            "The reactivated canonical reminder should read back into Today after the protected phone decision syncs."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayTaskReminderPending_\(taskID)"].firstMatch.exists,
            "A successful Nest readback should clear the phone decision outbox."
        )
    }

    func testOneTimeTaskEditRoundTripsAndRestoresThroughNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let sourceTitle = credentials.taskEditSourceTitle, !sourceTitle.isEmpty,
              let updatedTitle = credentials.taskEditUpdatedTitle, !updatedTitle.isEmpty,
              sourceTitle != updatedTitle else {
            throw XCTSkip("The task-edit journey requires one exact non-recurring open task ID plus distinct source and temporary titles.")
        }
        let app = try launchSignedInCaptureApp()
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 25, swipeAttempts: 12),
            "Today should expose the exact canonical source title before editing."
        )
        let originalDue = app.descendants(matching: .any)["CaptureTodayTaskDue_\(taskID)"].firstMatch
        let originalDueLabel = originalDue.exists ? originalDue.label : nil

        func replaceTitle(with value: String) {
            let field = app.textFields["CaptureTaskEditTitle"].firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 6))
            field.tap()
            field.typeKey("a", modifierFlags: .command)
            field.typeKey(.delete, modifierFlags: [])
            field.typeText(value)
            XCTAssertTrue(app.descendants(matching: .any)["CaptureTaskEditBoundary"].exists)
            let save = app.buttons["CaptureTaskEditSave"].firstMatch
            XCTAssertTrue(save.isEnabled)
            save.tap()
        }

        let edit = app.buttons["CaptureTodayTaskEdit_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(edit, in: app, timeout: 15, swipeAttempts: 10))
        edit.tap()
        replaceTitle(with: updatedTitle)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[updatedTitle].firstMatch, in: app, timeout: 30, swipeAttempts: 12),
            "The edited title should return from Nest before the journey proceeds."
        )
        if let originalDueLabel {
            XCTAssertEqual(
                app.descendants(matching: .any)["CaptureTodayTaskDue_\(taskID)"].firstMatch.label,
                originalDueLabel,
                "Editing wording must preserve the exact due decision."
            )
        }

        let restore = app.buttons["CaptureTodayTaskEdit_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(restore, in: app, timeout: 12, swipeAttempts: 8))
        restore.tap()
        replaceTitle(with: sourceTitle)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 30, swipeAttempts: 12),
            "The operated smoke must restore the original canonical title before finishing."
        )
        XCTAssertFalse(app.staticTexts[updatedTitle].firstMatch.exists)
    }

    func testCanonicalGoalEditRoundTripsAndRestoresThroughNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let goalID = credentials.goalID, !goalID.isEmpty,
              let sourceTitle = credentials.goalEditSourceTitle, !sourceTitle.isEmpty,
              let updatedTitle = credentials.goalEditUpdatedTitle, !updatedTitle.isEmpty,
              sourceTitle != updatedTitle else {
            throw XCTSkip("The goal-edit journey requires one exact active goal ID plus distinct source and temporary titles.")
        }
        let app = try launchSignedInCaptureApp()
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 25, swipeAttempts: 12),
            "Today should expose the exact canonical goal title before editing."
        )
        let originalTarget = app.descendants(matching: .any)["CaptureTodayGoalTarget_\(goalID)"].firstMatch
        let originalTargetLabel = originalTarget.exists ? originalTarget.label : nil

        func replaceTitle(with value: String) {
            let field = app.textFields["CaptureGoalEditTitle"].firstMatch
            XCTAssertTrue(field.waitForExistence(timeout: 6))
            field.tap()
            field.typeKey("a", modifierFlags: .command)
            field.typeKey(.delete, modifierFlags: [])
            field.typeText(value)
            XCTAssertTrue(app.descendants(matching: .any)["CaptureGoalEditBoundary"].exists)
            let save = app.buttons["CaptureGoalEditSave"].firstMatch
            XCTAssertTrue(save.isEnabled)
            save.tap()
        }

        let edit = app.buttons["CaptureTodayGoalEdit_\(goalID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(edit, in: app, timeout: 15, swipeAttempts: 10))
        edit.tap()
        replaceTitle(with: updatedTitle)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[updatedTitle].firstMatch, in: app, timeout: 30, swipeAttempts: 12),
            "The edited goal title should return from Nest before the journey proceeds."
        )
        if let originalTargetLabel {
            XCTAssertEqual(
                app.descendants(matching: .any)["CaptureTodayGoalTarget_\(goalID)"].firstMatch.label,
                originalTargetLabel,
                "Editing the goal definition must preserve the exact target decision."
            )
        }

        let restore = app.buttons["CaptureTodayGoalEdit_\(goalID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(restore, in: app, timeout: 12, swipeAttempts: 8))
        restore.tap()
        replaceTitle(with: sourceTitle)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 30, swipeAttempts: 12),
            "The operated smoke must restore the original canonical goal title before finishing."
        )
        XCTAssertFalse(app.staticTexts[updatedTitle].firstMatch.exists)
    }

    func testCanonicalSourceAnnotationResolveAndReopenRoundTripsThroughNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let annotationID = credentials.annotationID, !annotationID.isEmpty,
              let annotationBody = credentials.annotationBody, !annotationBody.isEmpty else {
            throw XCTSkip("The annotation-review journey requires one exact author-owned annotation ID and body.")
        }

        let app = try launchSignedInCaptureApp()
        let card = app.descendants(matching: .any)["CaptureTodayAnnotation_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(card, in: app, timeout: 30, swipeAttempts: 16),
            "Today should render the exact canonical active annotation before review."
        )
        XCTAssertTrue(app.staticTexts[annotationBody].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayAnnotationTags_\(annotationID)"].exists,
            "The canonical annotation should retain its reusable Nest tags on iPhone."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayAnnotationSource_\(annotationID)"].exists,
            "The iPhone should retain a deliberate return to this exact annotation in Nest Research."
        )

        let resolve = app.buttons["CaptureTodayAnnotationDecision_\(annotationID)"].firstMatch
        XCTAssertTrue(resolve.exists)
        XCTAssertEqual(resolve.label, "Resolve")
        XCTAssertTrue(resolve.isEnabled)
        resolve.tap()

        let reopenedCard = app.descendants(matching: .any)["CaptureTodayAnnotation_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(reopenedCard, in: app, timeout: 30, swipeAttempts: 16),
            "The same annotation ID should remain visible in Recently resolved after the server acknowledges review."
        )
        let reopen = app.buttons["CaptureTodayAnnotationDecision_\(annotationID)"].firstMatch
        XCTAssertTrue(reopen.waitForExistence(timeout: 10))
        XCTAssertTrue(
            waitForRuntimeLabel("Reopen", element: reopen),
            "The same annotation control should acknowledge its resolved state before reopening."
        )
        XCTAssertTrue(reopen.isEnabled)
        reopen.tap()

        let restored = app.buttons["CaptureTodayAnnotationDecision_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(restored, in: app, timeout: 30, swipeAttempts: 16),
            "The same annotation ID should return to active Research cues after reopening."
        )
        XCTAssertTrue(
            waitForRuntimeLabel("Resolve", element: restored),
            "The same annotation control should acknowledge its active state after reopening."
        )
        XCTAssertTrue(app.staticTexts[annotationBody].exists)
    }

    func testPrivateSourceInboxFilesIntoCanonicalResearch() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let captureID = credentials.sourceInboxCaptureID, !captureID.isEmpty,
              let sourceTitle = credentials.sourceInboxTitle, !sourceTitle.isEmpty,
              let annotationBody = credentials.sourceInboxAnnotationBody,
              !annotationBody.isEmpty,
              let tagLabel = credentials.sourceInboxTagLabel,
              !tagLabel.isEmpty,
              let projectName = credentials.projectName, !projectName.isEmpty else {
            throw XCTSkip("The source-inbox-filing journey requires one exact private capture ID/title, annotation body, canonical tag, and writable Nest name.")
        }

        let app = try launchSignedInCaptureApp()
        let item = app.descendants(matching: .any)[
            "CaptureSourceInboxItem_\(captureID)"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(item, in: app, timeout: 30, swipeAttempts: 18),
            "Today should expose the exact actor-owned private source before any Research filing exists."
        )
        XCTAssertTrue(app.staticTexts[sourceTitle].exists)

        let choose = app.buttons["CaptureSourceInboxFile_\(captureID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(choose, in: app, timeout: 10, swipeAttempts: 6)
        )
        XCTAssertTrue(choose.isEnabled)
        choose.tap()

        let sheet = app.descendants(matching: .any)["CaptureSourceFilingSheet"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 8))
        let destination = app.descendants(matching: .any)[
            "CaptureSourceFilingDestination"
        ].firstMatch
        XCTAssertTrue(destination.waitForExistence(timeout: 5))
        if !destination.label.contains(projectName) {
            destination.tap()
            let destinationOption = app.buttons[projectName].firstMatch
            if destinationOption.waitForExistence(timeout: 4) {
                destinationOption.tap()
            } else {
                let destinationText = app.staticTexts[projectName].firstMatch
                XCTAssertTrue(destinationText.waitForExistence(timeout: 4))
                destinationText.tap()
            }
        }

        let note = app.descendants(matching: .any)[
            "CaptureSourceFilingAnnotationBody"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(note, in: app, timeout: 8, swipeAttempts: 8),
            "The iPhone should offer one protected exact-source annotation in the same deliberate filing flow."
        )
        note.tap()
        note.typeText(annotationBody)

        let visibility = app.descendants(matching: .any)[
            "CaptureSourceFilingAnnotationVisibility"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(visibility, in: app, timeout: 8, swipeAttempts: 8)
        )
        visibility.tap()
        let collaboratorOption = app.buttons["Nest collaborators"].firstMatch
        if collaboratorOption.waitForExistence(timeout: 4) {
            collaboratorOption.tap()
        } else {
            let collaboratorText = app.staticTexts["Nest collaborators"].firstMatch
            XCTAssertTrue(collaboratorText.waitForExistence(timeout: 4))
            collaboratorText.tap()
        }

        let canonicalTag = app.switches[tagLabel].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(canonicalTag, in: app, timeout: 8, swipeAttempts: 8),
            "The filing flow should reuse the chosen Nest's canonical tag vocabulary."
        )
        turnOn(canonicalTag, in: app)

        let confirm = app.buttons["CaptureSourceFilingConfirm"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertTrue(confirm.isEnabled)
        confirm.tap()
        XCTAssertTrue(
            sheet.waitForNonExistence(timeout: 30),
            "Nest acknowledgement should close the filing decision sheet."
        )
        XCTAssertTrue(
            item.waitForNonExistence(timeout: 30),
            "The acknowledged source should leave the unfiled Inbox projection without deleting its private capture."
        )

        let status = app.staticTexts["CaptureSourceInboxStatus"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(status, in: app, timeout: 20, swipeAttempts: 12)
        )
        XCTAssertTrue(status.label.contains("Filed and annotated in \(projectName)"))
        let filedLink = app.descendants(matching: .any)[
            "CaptureSourceInboxFiledLink"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(filedLink, in: app, timeout: 10, swipeAttempts: 6),
            "The same iPhone decision should retain a deliberate route to the canonical Research evidence in Nest."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)[
                "CaptureSourceInboxPending_\(captureID)"
            ].exists,
            "An exact Nest acknowledgement must close the protected outbox entry."
        )
    }

    func testCanonicalDocumentNoteEditRoundTripsAndRestoresThroughNest() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let noteID = credentials.noteID, !noteID.isEmpty,
              let bodyBlockID = credentials.noteBodyBlockID, !bodyBlockID.isEmpty,
              let projectName = credentials.projectName, !projectName.isEmpty,
              let sourceTitle = credentials.noteEditSourceTitle, !sourceTitle.isEmpty,
              let updatedTitle = credentials.noteEditUpdatedTitle, !updatedTitle.isEmpty,
              let sourceBody = credentials.noteEditSourceBody, !sourceBody.isEmpty,
              let updatedBody = credentials.noteEditUpdatedBody, !updatedBody.isEmpty,
              sourceTitle != updatedTitle,
              sourceBody != updatedBody else {
            throw XCTSkip("The note-edit journey requires exact note and stable body-block IDs, one writable Nest, and distinct source and temporary title/body values.")
        }

        let app = try launchSignedInCaptureApp()
        tapRootTab("Work", in: app)
        XCTAssertTrue(app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 20))

        let projectPicker = app.descendants(matching: .any)["CaptureWorkProjectPicker"].firstMatch
        XCTAssertTrue(projectPicker.waitForExistence(timeout: 10))
        projectPicker.tap()
        let projectChoice = app.buttons[projectName].firstMatch
        XCTAssertTrue(projectChoice.waitForExistence(timeout: 6))
        projectChoice.tap()
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 25, swipeAttempts: 12),
            "Work should expose the exact canonical source note before editing."
        )
        XCTAssertTrue(app.staticTexts[sourceBody].firstMatch.exists)

        func replaceNote(title: String, body: String) {
            let sheet = app.descendants(matching: .any)["CaptureWorkNoteEditSheet"].firstMatch
            XCTAssertTrue(sheet.waitForExistence(timeout: 8))
            XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkNoteEditBoundary"].exists)

            let titleField = app.textFields["CaptureWorkNoteEditTitle"].firstMatch
            XCTAssertTrue(titleField.waitForExistence(timeout: 6))
            titleField.tap()
            titleField.typeKey("a", modifierFlags: .command)
            titleField.typeKey(.delete, modifierFlags: [])
            titleField.typeText(title)

            let bodyField = app.textViews["CaptureWorkNoteEditBody_\(bodyBlockID)"].firstMatch
            XCTAssertTrue(bodyField.waitForExistence(timeout: 6))
            bodyField.tap()
            bodyField.typeKey("a", modifierFlags: .command)
            bodyField.typeKey(.delete, modifierFlags: [])
            bodyField.typeText(body)

            let keyboardDone = app.buttons["CaptureWorkNoteEditKeyboardDone"].firstMatch
            if keyboardDone.waitForExistence(timeout: 3) {
                keyboardDone.tap()
            }
            let save = app.buttons["CaptureWorkNoteEditSave"].firstMatch
            for _ in 0..<5 where !save.isHittable {
                sheet.swipeUp()
            }
            XCTAssertTrue(save.isEnabled)
            save.tap()
            XCTAssertTrue(
                sheet.waitForNonExistence(timeout: 8),
                "Protecting the complete note intent should close the editor before asynchronous reconciliation."
            )
        }

        let edit = app.buttons["CaptureWorkNoteEdit_\(noteID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(edit, in: app, timeout: 15, swipeAttempts: 10))
        edit.tap()
        replaceNote(title: updatedTitle, body: updatedBody)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[updatedTitle].firstMatch, in: app, timeout: 35, swipeAttempts: 12),
            "The temporary title should return from Nest before the journey proceeds."
        )
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[updatedBody].firstMatch, in: app, timeout: 15, swipeAttempts: 8),
            "The exact temporary stable-block body should return from Nest."
        )
        XCTAssertFalse(app.descendants(matching: .any)["CaptureWorkNoteEditState_\(noteID)"].exists)

        let restore = app.buttons["CaptureWorkNoteEdit_\(noteID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(restore, in: app, timeout: 15, swipeAttempts: 10))
        restore.tap()
        replaceNote(title: sourceTitle, body: sourceBody)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 35, swipeAttempts: 12),
            "The operated smoke must restore the original canonical note title before finishing."
        )
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[sourceBody].firstMatch, in: app, timeout: 15, swipeAttempts: 8),
            "The operated smoke must restore the original stable-block body before finishing."
        )
        XCTAssertFalse(app.staticTexts[updatedTitle].firstMatch.exists)
        XCTAssertFalse(app.staticTexts[updatedBody].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["CaptureWorkNoteEditState_\(noteID)"].exists)
    }

    func testCanonicalWorkTagsRoundTripThroughSignedInToday() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let tagLabel = credentials.tagLabel, !tagLabel.isEmpty else {
            throw XCTSkip("The work-tag journey requires one exact task ID and reusable tag label.")
        }
        let app = try launchSignedInCaptureApp()

        openTaskTagEditor(taskID: taskID, in: app)
        let firstChoice = workTagChoice(label: tagLabel, in: app)
        let wasSelected = (firstChoice.value as? String) == "Selected"
        firstChoice.tap()
        XCTAssertEqual(firstChoice.value as? String, wasSelected ? "Not selected" : "Selected")
        saveWorkTags(taskID: taskID, in: app, expectImmediateReadback: true)

        openTaskTagEditor(taskID: taskID, in: app)
        let changedChoice = workTagChoice(label: tagLabel, in: app)
        XCTAssertEqual(
            changedChoice.value as? String,
            wasSelected ? "Not selected" : "Selected",
            "Relaunching the editor should read the changed canonical tag set back from Nest."
        )
        changedChoice.tap()
        saveWorkTags(taskID: taskID, in: app, expectImmediateReadback: true)

        openTaskTagEditor(taskID: taskID, in: app)
        XCTAssertEqual(
            workTagChoice(label: tagLabel, in: app).value as? String,
            wasSelected ? "Selected" : "Not selected",
            "The second canonical round trip should restore the starting tag choice."
        )
        app.buttons["Cancel"].firstMatch.tap()
    }

    func testWorkTagOutboxSurvivesOfflineRelaunchAndConverges() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let tagLabel = credentials.tagLabel, !tagLabel.isEmpty else {
            throw XCTSkip("The offline work-tag journey requires one exact task ID and reusable tag label.")
        }

        var app = try launchSignedInCaptureApp()
        openTaskTagEditor(taskID: taskID, in: app)
        let originalChoice = workTagChoice(label: tagLabel, in: app)
        let wasSelected = (originalChoice.value as? String) == "Selected"
        app.buttons["Cancel"].firstMatch.tap()
        app.terminate()

        app = try launchSignedInCaptureApp(
            baseURLOverride: "http://127.0.0.1:9",
            expectProtectedOfflineShell: true
        )
        openTaskTagEditor(taskID: taskID, in: app)
        let offlineChoice = workTagChoice(label: tagLabel, in: app)
        XCTAssertEqual(offlineChoice.value as? String, wasSelected ? "Selected" : "Not selected")
        offlineChoice.tap()
        saveWorkTags(taskID: taskID, in: app, expectImmediateReadback: false)
        app.terminate()

        app = try launchSignedInCaptureApp(
            baseURLOverride: "http://127.0.0.1:9",
            expectProtectedOfflineShell: true
        )
        let pending = app.descendants(matching: .any)["CaptureTodayTaskTagsPending_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(pending, in: app, timeout: 15, swipeAttempts: 12),
            "The same protected tag decision must survive process death while Nest remains unavailable."
        )
        XCTAssertEqual(pending.value as? String, "Queued")
        app.terminate()

        app = try launchSignedInCaptureApp()
        let reconciledPending = app.descendants(matching: .any)["CaptureTodayTaskTagsPending_\(taskID)"].firstMatch
        let deadline = Date().addingTimeInterval(35)
        while reconciledPending.exists && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertFalse(reconciledPending.exists, "Reconnect should reconcile and close the exact protected decision.")

        openTaskTagEditor(taskID: taskID, in: app)
        let canonicalChoice = workTagChoice(label: tagLabel, in: app)
        XCTAssertEqual(
            canonicalChoice.value as? String,
            wasSelected ? "Not selected" : "Selected",
            "The post-reconnect editor must read the offline choice from canonical Nest."
        )
        canonicalChoice.tap()
        saveWorkTags(taskID: taskID, in: app, expectImmediateReadback: true)

        openTaskTagEditor(taskID: taskID, in: app)
        XCTAssertEqual(
            workTagChoice(label: tagLabel, in: app).value as? String,
            wasSelected ? "Selected" : "Not selected",
            "Cleanup should restore the task's starting tag selection."
        )
        app.buttons["Cancel"].firstMatch.tap()
    }

    func testCanonicalRecurrenceRoundTripsThroughSignedInToday() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let seriesID = credentials.recurrenceSeriesID, !seriesID.isEmpty,
              let scheduledLocalDate = credentials.recurrenceScheduledLocalDate, !scheduledLocalDate.isEmpty else {
            throw XCTSkip("The recurrence journey requires exact canonical task, series, and local-date identities.")
        }
        let app = try launchSignedInCaptureApp()

        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }

        let recurrence = app.descendants(matching: .any)["CaptureTodayRecurrence_\(seriesID)_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(recurrence, in: app, timeout: 30, swipeAttempts: 10),
            "Today should render the exact canonical occurrence created in Nest."
        )
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Every week at 09:00", "America/Denver")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "No reminder or provider event is implied.")
        ).firstMatch.exists)

        let menu = app.buttons["CaptureTodayRecurrenceMenu_\(seriesID)"].firstMatch
        XCTAssertTrue(menu.waitForExistence(timeout: 8))
        XCTAssertTrue(menu.isEnabled)
        menu.tap()
        let pause = app.buttons["Pause repeat"].firstMatch
        XCTAssertTrue(pause.waitForExistence(timeout: 5))
        pause.tap()
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Occurrence \(scheduledLocalDate)", "Paused")
        ).firstMatch.waitForExistence(timeout: 20))

        let refreshedMenu = app.buttons["CaptureTodayRecurrenceMenu_\(seriesID)"].firstMatch
        XCTAssertTrue(refreshedMenu.waitForExistence(timeout: 8))
        refreshedMenu.tap()
        let resume = app.buttons["Resume repeat"].firstMatch
        XCTAssertTrue(resume.waitForExistence(timeout: 5))
        resume.tap()
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Occurrence \(scheduledLocalDate)", "Active")
        ).firstMatch.waitForExistence(timeout: 20))

        let done = app.buttons["CaptureTodayTaskDone_\(taskID)"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 8))
        XCTAssertTrue(done.isEnabled)
        done.tap()
        XCTAssertTrue(
            recurrence.waitForNonExistence(timeout: 20),
            "Completing the occurrence should remove that exact open task after canonical Today reloads."
        )
    }

    func testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let title = credentials.recurrenceAuthoringTitle, !title.isEmpty else {
            throw XCTSkip("The recurrence authoring journey requires an exact unique task title.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)

        let taskButton = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureQuickEntry_TASK_")
        ).firstMatch
        XCTAssertTrue(waitForRuntimeElement(taskButton, in: app, timeout: 20, swipeAttempts: 8))
        taskButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 6))

        let titleField = app.textFields["CaptureQuickEntryTitle"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 4))
        titleField.tap()
        titleField.typeText(title)
        let repeatPicker = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceMode"].firstMatch
        XCTAssertTrue(repeatPicker.waitForExistence(timeout: 4))
        repeatPicker.tap()
        let fixed = app.buttons["Fixed schedule"].firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        fixed.tap()

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "The repeating task is saved in Quipsly")
        ).firstMatch.waitForExistence(timeout: 25))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)

        tapRootTab("Today", in: app)
        let authoredTask = app.staticTexts[title].firstMatch
        XCTAssertTrue(waitForRuntimeElement(authoredTask, in: app, timeout: 25, swipeAttempts: 10))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Every week", "fixed schedule")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "No reminder or provider event is implied")
        ).firstMatch.exists)
    }

    func testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let title = credentials.recurrenceAuthoringTitle, !title.isEmpty,
              let sessionID = credentials.sessionID, !sessionID.isEmpty else {
            throw XCTSkip("Offline recurrence authoring requires one exact Task title and Session ID.")
        }

        // Warm the actor-partitioned Session cache and Firebase session from
        // the real local Nest before deliberately making Nest unreachable.
        var app = try launchSignedInCaptureApp()
        app.terminate()

        app = try launchSignedInCaptureApp(
            baseURLOverride: "http://127.0.0.1:1",
            expectProtectedOfflineShell: true
        )
        let sessionChooser = app.buttons["CaptureOfflineSessionChooser"].firstMatch
        XCTAssertTrue(sessionChooser.waitForExistence(timeout: 20))
        if !sessionChooser.label.contains(credentials.sessionTitle ?? "") {
            sessionChooser.tap()
            let exactSession = app.buttons["CaptureOfflineSession_\(sessionID)"].firstMatch
            XCTAssertTrue(exactSession.waitForExistence(timeout: 6))
            exactSession.tap()
        }
        let taskButton = app.buttons["CaptureQuickEntry_TASK_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(taskButton, in: app, timeout: 20, swipeAttempts: 8),
            "The protected Session cache should keep explicit Task capture available while Nest is unreachable."
        )
        taskButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 6))

        let titleField = app.textFields["CaptureQuickEntryTitle"]
        XCTAssertTrue(titleField.waitForExistence(timeout: 4))
        titleField.tap()
        titleField.typeText(title)
        let repeatPicker = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceMode"].firstMatch
        XCTAssertTrue(repeatPicker.waitForExistence(timeout: 4))
        repeatPicker.tap()
        let fixed = app.buttons["Fixed schedule"].firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        fixed.tap()
        app.buttons["CaptureQuickEntrySave"].tap()

        let retry = app.buttons["Retry protected captures"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(retry, in: app, timeout: 20, swipeAttempts: 8),
            "The failed transport must leave the repeating Task visibly queued on the iPhone."
        )
        XCTAssertTrue(app.staticTexts["1 quick capture waiting"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", title)
        ).firstMatch.exists)
        app.terminate()

        // Relaunch against Nest. Startup reconciliation must reuse the queued
        // UUID, remove the phone outbox row only after acknowledgment, and
        // expose the canonical occurrence through Today.
        app = try launchSignedInCaptureApp()
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }
        let authoredTask = app.staticTexts[title].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(authoredTask, in: app, timeout: 35, swipeAttempts: 10),
            "Connectivity recovery should acknowledge exactly one protected recurrence and expose its canonical Today occurrence after relaunch."
        )
        XCTAssertFalse(app.buttons["Retry protected captures"].exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", "Every week", "fixed schedule")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "No reminder or provider event is implied")
        ).firstMatch.exists)
    }

    func testIPhoneVersionsThisAndFutureRecurrenceWithoutRewritingHistory() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let seriesID = credentials.recurrenceSeriesID, !seriesID.isEmpty,
              let sourceTitle = credentials.recurrenceEditSourceTitle, !sourceTitle.isEmpty,
              let futureTitle = credentials.recurrenceEditFutureTitle, !futureTitle.isEmpty,
              let targetTimezone = credentials.recurrenceEditTimezone, !targetTimezone.isEmpty else {
            throw XCTSkip("Recurrence editing requires exact source task/series IDs, source/future titles, and a target timezone.")
        }
        let app = try launchSignedInCaptureApp()
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }
        XCTAssertTrue(waitForRuntimeElement(app.staticTexts[sourceTitle].firstMatch, in: app, timeout: 25, swipeAttempts: 10))

        let menu = app.buttons["CaptureTodayRecurrenceMenu_\(seriesID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(menu, in: app, timeout: 15, swipeAttempts: 8))
        menu.tap()
        let edit = app.buttons["Edit repeat…"].firstMatch
        XCTAssertTrue(edit.waitForExistence(timeout: 5))
        edit.tap()

        let scope = app.buttons["This + future"].firstMatch
        XCTAssertTrue(scope.waitForExistence(timeout: 5))
        scope.tap()
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "There is no rewrite-history option")
        ).firstMatch.waitForExistence(timeout: 5))

        let title = app.textFields["CaptureRecurrenceEditTitle"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeKey("a", modifierFlags: .command)
        title.typeKey(.delete, modifierFlags: [])
        title.typeText(futureTitle)

        let timezone = app.textFields["CaptureRecurrenceEditTimezone"].firstMatch
        XCTAssertTrue(timezone.waitForExistence(timeout: 5))
        timezone.tap()
        timezone.typeKey("a", modifierFlags: .command)
        timezone.typeKey(.delete, modifierFlags: [])
        timezone.typeText(targetTimezone)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Wall-clock time will stay in \(targetTimezone)")
        ).firstMatch.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureRecurrenceEditBoundary"].exists)

        let save = app.buttons["CaptureRecurrenceEditSave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.scrollViews["CaptureTodayView"].waitForExistence(timeout: 30))
        if waitForRuntimeElement(showMore, in: app, timeout: 8, swipeAttempts: 4), showMore.label.contains("more") {
            showMore.tap()
        }
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[futureTitle].firstMatch, in: app, timeout: 35, swipeAttempts: 12),
            "The revised future series should return through Today under its new canonical task identity."
        )
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", targetTimezone)).firstMatch.exists)
        XCTAssertFalse(app.staticTexts[sourceTitle].firstMatch.exists, "The superseded open horizon should leave Today while remaining preserved in task history.")
        XCTAssertFalse(app.buttons["CaptureTodayRecurrenceMenu_\(seriesID)"].exists, "The predecessor series should be ended and replaced, not mutated in place.")
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].exists == false)
    }

    func testIPhoneExplicitlySkipsMissedOccurrenceAndContinuesSeries() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let seriesID = credentials.recurrenceSeriesID, !seriesID.isEmpty,
              let scheduledLocalDate = credentials.recurrenceScheduledLocalDate, !scheduledLocalDate.isEmpty else {
            throw XCTSkip("Missed-occurrence runtime proof requires exact task, series, and scheduled-local-date identities.")
        }
        let app = try launchSignedInCaptureApp()
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) { showMore.tap() }

        let task = app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(task, in: app, timeout: 25, swipeAttempts: 12))
        let recurrence = app.descendants(matching: .any)["CaptureTodayRecurrence_\(seriesID)_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(recurrence, in: app, timeout: 12, swipeAttempts: 8))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Occurrence \(scheduledLocalDate)")
        ).firstMatch.exists)

        let skip = app.buttons["CaptureTodaySkipMissed_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(skip, in: app, timeout: 12, swipeAttempts: 8))
        XCTAssertTrue(skip.isEnabled)
        skip.tap()
        let confirm = app.buttons["Preserve as skipped"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "retain the overdue task and occurrence as skipped")
        ).firstMatch.exists)
        confirm.tap()

        XCTAssertTrue(app.scrollViews["CaptureTodayView"].waitForExistence(timeout: 30))
        XCTAssertTrue(
            waitForRuntimeElement(app.buttons["CaptureTodayRecurrenceMenu_\(seriesID)"].firstMatch, in: app, timeout: 30, swipeAttempts: 12),
            "The same canonical series should continue from its next open occurrence."
        )
        XCTAssertFalse(app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].exists)
    }

    func testSignedInCaptureRoomSurfacesAreVisible() throws {
        let credentials = try runtimeSmokeCredentials()
        let app = try launchSignedInCaptureApp()

        let recordTab = app.tabBars.buttons["Record"].firstMatch
        XCTAssertTrue(recordTab.waitForExistence(timeout: 20), "Signed-in Capture app should expose the Record tab.")
        recordTab.tap()

        selectRequestedSession(in: app, credentials: credentials)

        XCTAssertTrue(
            app.otherElements["CaptureConsentStrip"].firstMatch.waitForExistence(timeout: 8),
            "The recorder consent state should be visible before a user can start a take."
        )
        XCTAssertTrue(
            app.otherElements["CaptureRecorderHero"].firstMatch.waitForExistence(timeout: 8),
            "The local recorder should be the dominant Record-tab action."
        )
        XCTAssertTrue(
            app.buttons["CaptureStartButton"].firstMatch.exists,
            "The local recorder start control should have a stable accessibility identity."
        )

        let liveRoom = app.descendants(matching: .any)["CaptureLiveRoomDisclosure"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(liveRoom, in: app), "Provider-room controls should be subordinate to the local recorder.")
        liveRoom.tap()
        XCTAssertTrue(waitForRuntimeElement(app.descendants(matching: .any)["CaptureProviderRoomBoundaryCopy"].firstMatch, in: app, timeout: 8, swipeAttempts: 2), "The live-room boundary copy and controls should be available on demand.")
        XCTAssertTrue(waitForRuntimeElement(app.buttons["ProviderJoinRoomButton"].firstMatch, in: app, timeout: 8, swipeAttempts: 2), "Joining a room must remain a distinct action from starting local recording.")
        XCTAssertTrue(waitForRuntimeElement(app.descendants(matching: .any)["CaptureSourceTruthFootnote"].firstMatch, in: app), "The selected-microphone source boundary should remain visible in the runtime path.")

        XCTAssertTrue(app.tabBars.buttons["Library"].firstMatch.exists)
        XCTAssertTrue(app.tabBars.buttons["Account"].firstMatch.exists)
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].firstMatch.exists, "A recording-in-progress banner must not appear before a take starts.")
    }

    func testConsentedProviderRoomJoinsAndLeavesWithoutStartingRecording() throws {
        let credentials = try runtimeSmokeCredentials()
        guard credentials.sessionID?.isEmpty == false,
              credentials.sessionTitle?.isEmpty == false else {
            throw XCTSkip("The provider-room journey requires an exact consented Session ID and title.")
        }

        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let liveRoom = app.descendants(matching: .any)["CaptureLiveRoomDisclosure"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(liveRoom, in: app, timeout: 18, swipeAttempts: 8),
            "The selected production Session should expose its separate provider-room controls."
        )
        liveRoom.tap()

        let join = app.buttons["ProviderJoinRoomButton"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(join, in: app, timeout: 12, swipeAttempts: 4),
            "A consented LiveKit-ready Session should expose an explicit Join room action."
        )
        XCTAssertTrue(join.isEnabled)

        let microphoneAlertHandler = addUIInterruptionMonitor(withDescription: "Provider microphone permission") { alert in
            for label in ["Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
        defer { removeUIInterruptionMonitor(microphoneAlertHandler) }

        join.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 5) {
            let allow = springboard.alerts.firstMatch.buttons["Allow"]
            XCTAssertTrue(allow.exists, "The first provider join should expose an explicit microphone Allow choice.")
            allow.tap()
            app.activate()
        }

        #if targetEnvironment(simulator)
        let simulatorActivationFailure = app.staticTexts[
            "CallKit did not activate room audio, so Quipsly did not join a silent provider room. Try again or keep the local source only."
        ].firstMatch
        if simulatorActivationFailure.waitForExistence(timeout: 12) {
            XCTAssertTrue(
                app.buttons["ProviderJoinRoomButton"].firstMatch.exists,
                "A simulator-only CallKit audio failure must return to an explicit retry state."
            )
            XCTAssertFalse(
                app.otherElements["GlobalCaptureBanner"].exists,
                "A failed simulator CallKit activation must not imply that recording started."
            )
            XCTAssertFalse(
                app.buttons["CaptureStopButton"].exists,
                "A failed simulator CallKit activation must not create recorder state."
            )
            throw XCTSkip(
                "This Simulator runtime cannot activate CallKit's provider audio session. "
                    + "The fail-closed boundary passed; real LiveKit media join/leave still requires a physical iPhone."
            )
        }
        #endif

        let leave = app.buttons["ProviderLeaveRoomButton"].firstMatch
        XCTAssertTrue(
            leave.waitForExistence(timeout: 30),
            "The native app should establish the LiveKit room before reporting a Leave action."
        )
        XCTAssertFalse(
            app.otherElements["GlobalCaptureBanner"].exists,
            "Joining provider audio must not start or imply a Quipsly recording."
        )
        XCTAssertFalse(
            app.buttons["CaptureStopButton"].exists,
            "Provider-room audio must remain separate from the local source recorder."
        )

        leave.tap()
        XCTAssertTrue(
            app.buttons["ProviderJoinRoomButton"].firstMatch.waitForExistence(timeout: 15),
            "Leaving the provider room should return to an explicit rejoin state."
        )
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].exists)
    }

    func testConsentedCapturePlaybackAndCrashRecovery() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID,
              !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false else {
            throw XCTSkip("The capture/recovery dogfood requires an exact Session ID and title.")
        }

        var app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let confirmConsent = app.buttons["CaptureConfirmConsentButton"].firstMatch
        if waitForRuntimeElement(confirmConsent, in: app, timeout: 5, swipeAttempts: 3) {
            confirmConsent.tap()
            let consentSheet = app.descendants(matching: .any)["CaptureConsentConfirmationSheet"].firstMatch
            XCTAssertTrue(consentSheet.waitForExistence(timeout: 8))

            let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
            let transcription = app.switches["CaptureConsentTranscriptionToggle"]
            let audibleParticipants = app.switches["CaptureConsentAudibleParticipantsToggle"]
            XCTAssertTrue(recordAudio.exists)
            XCTAssertTrue(transcription.exists)
            XCTAssertTrue(audibleParticipants.exists)
            turnOn(recordAudio, in: app)
            XCTAssertEqual(transcription.value as? String, "0", "Dogfood records audio without silently opting into transcription.")
            turnOn(audibleParticipants, in: app)

            let saveConsent = app.buttons["CaptureConsentSaveChoicesButton"]
            XCTAssertTrue(waitForRuntimeElement(saveConsent, in: app, timeout: 8, swipeAttempts: 5))
            XCTAssertTrue(saveConsent.isEnabled)
            saveConsent.tap()
            XCTAssertTrue(
                app.buttons["CaptureStartButton"].firstMatch.waitForExistence(timeout: 12),
                "The local recorder should return after the explicit consent transaction."
            )
        }

        let microphoneAlertHandler = addUIInterruptionMonitor(withDescription: "Microphone permission") { alert in
            for label in ["Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
        defer { removeUIInterruptionMonitor(microphoneAlertHandler) }

        tapRootTab("Library", in: app)
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 8))
        let recordingsBeforeSafeTake = recordingIdentifiers(in: app, prefix: "LocalRecordingRow_")
        tapRootTab("Record", in: app)

        let start = app.buttons["CaptureStartButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(start, in: app, timeout: 8, swipeAttempts: 6))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: start)
        waitForExpectations(timeout: 8)
        start.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 5) {
            let allow = springboard.alerts.firstMatch.buttons["Allow"]
            XCTAssertTrue(allow.exists, "The first-install microphone prompt should expose an explicit Allow choice.")
            allow.tap()
        }

        let stop = app.buttons["CaptureStopButton"].firstMatch
        XCTAssertTrue(stop.waitForExistence(timeout: 15), "The actual AVAudioRecorder-backed take should start.")
        RunLoop.current.run(until: Date().addingTimeInterval(2.0))
        let mark = app.buttons["CaptureMarkMomentButton"].firstMatch
        XCTAssertTrue(mark.exists)
        mark.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureLatestMomentMark"].firstMatch.waitForExistence(timeout: 4))
        stop.tap()
        XCTAssertTrue(app.buttons["CaptureStartButton"].firstMatch.waitForExistence(timeout: 15), "The first take should finish local finalization.")

        tapRootTab("Library", in: app)
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 8))
        guard let safeRow = waitForNewRecordingRow(in: app, excluding: recordingsBeforeSafeTake) else {
            XCTFail("The completed take should appear as a new immutable local source.")
            return
        }
        let safeIdentifier = safeRow.identifier
        attachRecordingIdentity(safeIdentifier, name: "Completed local source identity")
        XCTAssertTrue(safeRow.descendants(matching: .any)["LocalRecordingMomentMarks"].exists)
        let play = safeRow.buttons["Play"].firstMatch
        XCTAssertTrue(play.exists)
        XCTAssertTrue(play.isEnabled)
        play.tap()
        let stopPlayback = safeRow.buttons["Stop"].firstMatch
        XCTAssertTrue(stopPlayback.waitForExistence(timeout: 3), "The finalized immutable source should actually play.")
        stopPlayback.tap()

        let recordingID = safeIdentifier.replacingOccurrences(of: "LocalRecordingRow_", with: "")
        let uploadStatusIdentifier = "LocalRecordingStatus_\(recordingID)"
        let verificationDeadline = Date().addingTimeInterval(90)
        var uploadVerified = false
        while Date() < verificationDeadline {
            let currentRow = app.descendants(matching: .any)[safeIdentifier].firstMatch
            let currentStatus = app.descendants(matching: .any)[uploadStatusIdentifier].firstMatch
            let verifiedStatusInRow = currentRow.descendants(matching: .any).matching(
                NSPredicate(format: "label CONTAINS[c] 'verified'")
            ).firstMatch
            if currentStatus.exists && currentStatus.label.localizedCaseInsensitiveContains("verified")
                || currentRow.exists && verifiedStatusInRow.exists {
                uploadVerified = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertTrue(
            uploadVerified,
            "The real native take should reach a matching server-verified size and SHA-256 receipt before the recovery phase."
        )

        let recordingsBeforeCrashTake = recordingIdentifiers(in: app, prefix: "LocalRecordingRow_")
        tapRootTab("Record", in: app)
        let secondStart = app.buttons["CaptureStartButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(secondStart, in: app, timeout: 8, swipeAttempts: 6))
        expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: secondStart)
        waitForExpectations(timeout: 8)
        secondStart.tap()
        XCTAssertTrue(app.buttons["CaptureStopButton"].firstMatch.waitForExistence(timeout: 15))
        RunLoop.current.run(until: Date().addingTimeInterval(2.0))
        tapRootTab("Library", in: app)
        guard let crashRow = waitForNewRecordingRow(in: app, excluding: recordingsBeforeCrashTake) else {
            XCTFail("The in-progress take should be journaled before process death.")
            return
        }
        let crashIdentifier = crashRow.identifier
        attachRecordingIdentity(crashIdentifier, name: "Crash-open local source identity")
        app.terminate()

        let offlineApp = XCUIApplication()
        offlineApp.launchEnvironment["QUIPSLY_API_BASE_URL"] = "http://127.0.0.1:9"
        offlineApp.launchArguments.append("--quipsly-capture-runtime-smoke")
        offlineApp.launch()
        app = offlineApp

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureOfflineAccessBanner"].waitForExistence(timeout: 25),
            "A failed Nest verification should enter protected offline Library instead of exposing stale recording authority."
        )
        let safeOfflineIdentifier = safeIdentifier.replacingOccurrences(of: "LocalRecordingRow_", with: "CaptureOfflineRecording_")
        let crashOfflineIdentifier = crashIdentifier.replacingOccurrences(of: "LocalRecordingRow_", with: "CaptureOfflineRecording_")
        let safeOfflineRow = app.descendants(matching: .any)[safeOfflineIdentifier].firstMatch
        let crashOfflineRow = app.descendants(matching: .any)[crashOfflineIdentifier].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(safeOfflineRow, in: app, timeout: 16, swipeAttempts: 10),
            "The finalized take must survive an offline process relaunch with the same source ID."
        )
        XCTAssertTrue(
            waitForRuntimeElement(crashOfflineRow, in: app, timeout: 16, swipeAttempts: 10),
            "The crash-open take must survive launch reconciliation with the same source ID."
        )
        XCTAssertFalse(app.buttons["CaptureStartButton"].exists, "Offline cached consent must never allow a new recording.")

        let playOffline = safeOfflineRow.buttons["Play local source"].firstMatch
        XCTAssertTrue(playOffline.exists)
        XCTAssertTrue(playOffline.isEnabled)
        playOffline.tap()
        XCTAssertTrue(safeOfflineRow.buttons["Stop playback"].firstMatch.waitForExistence(timeout: 3))
        safeOfflineRow.buttons["Stop playback"].firstMatch.tap()

        app.terminate()
        app = try launchSignedInCaptureApp()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 20), "Nest recovery should restore the signed-in shell.")
        tapRootTab("Library", in: app)
        XCTAssertTrue(app.descendants(matching: .any)[safeIdentifier].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)[crashIdentifier].waitForExistence(timeout: 12))
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].exists, "An orphaned take must not relaunch as an active recording.")

        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)
        let attachToStudio = app.buttons["CaptureAttachToStudioButton_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(attachToStudio, in: app, timeout: 45, swipeAttempts: 10),
            "A server-verified recording should expose one explicit Studio handoff action."
        )
        let attachEnabled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: attachToStudio
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [attachEnabled], timeout: 45),
            .completed,
            "The verified source should become attachable without changing or deleting the local original."
        )
        attachToStudio.tap()

        let promotionStatusIdentifier = "CaptureStudioPromotionStatus_\(sessionID)"
        let promotionDeadline = Date().addingTimeInterval(45)
        var studioAttached = false
        while Date() < promotionDeadline {
            let promotionStatus = app.descendants(matching: .any)[promotionStatusIdentifier].firstMatch
            if promotionStatus.exists && promotionStatus.label.localizedCaseInsensitiveContains("Studio media ready") {
                studioAttached = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertTrue(
            studioAttached,
            "Attach to Studio should return durable same-project handoff truth before the operated journey succeeds."
        )
    }
}
