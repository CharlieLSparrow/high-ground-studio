import Foundation
import XCTest

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
        let recurrenceSeriesID: String?
        let recurrenceScheduledLocalDate: String?
        let recurrenceAuthoringTitle: String?
        let recurrenceEditSourceTitle: String?
        let recurrenceEditFutureTitle: String?
        let recurrenceEditTimezone: String?
        let taggedTaskTitle: String?
        let tagLabel: String?
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
                recurrenceSeriesID: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_SERIES_ID"],
                recurrenceScheduledLocalDate: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_LOCAL_DATE"],
                recurrenceAuthoringTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_AUTHORING_TITLE"],
                recurrenceEditSourceTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_SOURCE_TITLE"],
                recurrenceEditFutureTitle: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_FUTURE_TITLE"],
                recurrenceEditTimezone: environment["QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_TIMEZONE"],
                taggedTaskTitle: environment["QUIPSLY_CAPTURE_UI_TEST_TAGGED_TASK_TITLE"],
                tagLabel: environment["QUIPSLY_CAPTURE_UI_TEST_TAG_LABEL"],
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
            recurrenceSeriesID: payload["recurrenceSeriesID"] as? String,
            recurrenceScheduledLocalDate: payload["recurrenceScheduledLocalDate"] as? String,
            recurrenceAuthoringTitle: payload["recurrenceAuthoringTitle"] as? String,
            recurrenceEditSourceTitle: payload["recurrenceEditSourceTitle"] as? String,
            recurrenceEditFutureTitle: payload["recurrenceEditFutureTitle"] as? String,
            recurrenceEditTimezone: payload["recurrenceEditTimezone"] as? String,
            taggedTaskTitle: payload["taggedTaskTitle"] as? String,
            tagLabel: payload["tagLabel"] as? String,
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
                if recorderSurface.exists {
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

    func testCanonicalWorkTagsRoundTripThroughSignedInToday() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let tagLabel = credentials.tagLabel, !tagLabel.isEmpty else {
            throw XCTSkip("The work-tag journey requires one exact task ID and reusable tag label.")
        }
        let app = try launchSignedInCaptureApp()

        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }

        func openEditor() {
            let edit = app.buttons["CaptureTodayTaskTagsEdit_\(taskID)"].firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(edit, in: app, timeout: 30, swipeAttempts: 12),
                "Today should expose tag editing for the exact writable canonical task."
            )
            XCTAssertTrue(edit.isEnabled)
            edit.tap()
            XCTAssertTrue(app.navigationBars["Edit tags"].waitForExistence(timeout: 8))
        }

        func tagChoice() -> XCUIElement {
            let choice = app.buttons.matching(
                NSPredicate(format: "label CONTAINS %@", tagLabel)
            ).firstMatch
            XCTAssertTrue(
                choice.waitForExistence(timeout: 8),
                "The exact reusable Nest tag should be selectable on iPhone."
            )
            return choice
        }

        func saveAndWaitForReadback() {
            let save = app.buttons["CaptureTodayWorkTagsSave"].firstMatch
            XCTAssertTrue(save.waitForExistence(timeout: 5))
            XCTAssertTrue(save.isEnabled)
            save.tap()
            let pending = app.descendants(matching: .any)["CaptureTodayTaskTagsPending_\(taskID)"].firstMatch
            let deadline = Date().addingTimeInterval(30)
            while pending.exists && Date() < deadline {
                RunLoop.current.run(until: Date().addingTimeInterval(0.5))
            }
            XCTAssertFalse(pending.exists, "Exact Nest readback should clear the protected phone tag decision.")
        }

        openEditor()
        let firstChoice = tagChoice()
        let wasSelected = (firstChoice.value as? String) == "Selected"
        firstChoice.tap()
        XCTAssertEqual(firstChoice.value as? String, wasSelected ? "Not selected" : "Selected")
        saveAndWaitForReadback()

        openEditor()
        let changedChoice = tagChoice()
        XCTAssertEqual(
            changedChoice.value as? String,
            wasSelected ? "Not selected" : "Selected",
            "Relaunching the editor should read the changed canonical tag set back from Nest."
        )
        changedChoice.tap()
        saveAndWaitForReadback()

        openEditor()
        XCTAssertEqual(
            tagChoice().value as? String,
            wasSelected ? "Selected" : "Not selected",
            "The second canonical round trip should restore the starting tag choice."
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
