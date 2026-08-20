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
        let clientFollowUpID: String?
        let clientFollowUpTitle: String?
        let clientFollowUpSHA256: String?
        let coachFollowUpTitle: String?
        let coachFollowUpIntro: String?
        let coachFollowUpRevisedIntro: String?
        let coachFollowUpNextSessionFocus: String?
        let transcriptSegmentIDs: [String]
        let transcriptPhoneCorrectionText: String?
        let transcriptConflictCorrectionText: String?
        let expectedPacketTaskTitle: String?
        let expectedPacketGoalTitle: String?
        let expectedPacketNoteSourceText: String?
        let expectedPacketNoteLaneID: String?
        let packetNoteEditedTitle: String?
        let packetNoteEditedBody: String?
        let recordingFixtureLocalID: String?
        let recordingFixtureAssetID: String?
        let weeklyPlanCommitmentOne: String?
        let weeklyPlanCommitmentTwo: String?
        let weeklyPlanSupport: String?
        let weeklyPlanReflection: String?
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
                planBlockID: environment["QUIPSLY_CAPTURE_UI_TEST_PLAN_BLOCK_ID"],
                clientFollowUpID: environment["QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_ID"],
                clientFollowUpTitle: environment["QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_TITLE"],
                clientFollowUpSHA256: environment["QUIPSLY_CAPTURE_UI_TEST_CLIENT_FOLLOW_UP_SHA256"],
                coachFollowUpTitle: environment["QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_TITLE"],
                coachFollowUpIntro: environment["QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_INTRO"],
                coachFollowUpRevisedIntro: environment["QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_REVISED_INTRO"],
                coachFollowUpNextSessionFocus: environment["QUIPSLY_CAPTURE_UI_TEST_COACH_FOLLOW_UP_NEXT_SESSION_FOCUS"],
                transcriptSegmentIDs: (environment["QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_SEGMENT_IDS"] ?? "")
                    .split(separator: ",").map(String.init),
                transcriptPhoneCorrectionText: environment["QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_PHONE_CORRECTION_TEXT"],
                transcriptConflictCorrectionText: environment["QUIPSLY_CAPTURE_UI_TEST_TRANSCRIPT_CONFLICT_CORRECTION_TEXT"],
                expectedPacketTaskTitle: environment["QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_TASK_TITLE"],
                expectedPacketGoalTitle: environment["QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_GOAL_TITLE"],
                expectedPacketNoteSourceText: environment["QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_SOURCE_TEXT"],
                expectedPacketNoteLaneID: environment["QUIPSLY_CAPTURE_UI_TEST_EXPECTED_PACKET_NOTE_LANE_ID"],
                packetNoteEditedTitle: environment["QUIPSLY_CAPTURE_UI_TEST_PACKET_NOTE_EDITED_TITLE"],
                packetNoteEditedBody: environment["QUIPSLY_CAPTURE_UI_TEST_PACKET_NOTE_EDITED_BODY"],
                recordingFixtureLocalID: environment["QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_LOCAL_ID"],
                recordingFixtureAssetID: environment["QUIPSLY_CAPTURE_UI_TEST_RECORDING_FIXTURE_ASSET_ID"],
                weeklyPlanCommitmentOne: environment["QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_COMMITMENT_ONE"],
                weeklyPlanCommitmentTwo: environment["QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_COMMITMENT_TWO"],
                weeklyPlanSupport: environment["QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_SUPPORT"],
                weeklyPlanReflection: environment["QUIPSLY_CAPTURE_UI_TEST_WEEKLY_PLAN_REFLECTION"]
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
            planBlockID: payload["planBlockID"] as? String,
            clientFollowUpID: payload["clientFollowUpID"] as? String,
            clientFollowUpTitle: payload["clientFollowUpTitle"] as? String,
            clientFollowUpSHA256: payload["clientFollowUpSHA256"] as? String,
            coachFollowUpTitle: payload["coachFollowUpTitle"] as? String,
            coachFollowUpIntro: payload["coachFollowUpIntro"] as? String,
            coachFollowUpRevisedIntro: payload["coachFollowUpRevisedIntro"] as? String,
            coachFollowUpNextSessionFocus: payload["coachFollowUpNextSessionFocus"] as? String,
            transcriptSegmentIDs: payload["transcriptSegmentIDs"] as? [String] ?? [],
            transcriptPhoneCorrectionText: payload["transcriptPhoneCorrectionText"] as? String,
            transcriptConflictCorrectionText: payload["transcriptConflictCorrectionText"] as? String,
            expectedPacketTaskTitle: payload["expectedPacketTaskTitle"] as? String,
            expectedPacketGoalTitle: payload["expectedPacketGoalTitle"] as? String,
            expectedPacketNoteSourceText: payload["expectedPacketNoteSourceText"] as? String,
            expectedPacketNoteLaneID: payload["expectedPacketNoteLaneID"] as? String,
            packetNoteEditedTitle: payload["packetNoteEditedTitle"] as? String,
            packetNoteEditedBody: payload["packetNoteEditedBody"] as? String,
            recordingFixtureLocalID: payload["recordingFixtureLocalID"] as? String,
            recordingFixtureAssetID: payload["recordingFixtureAssetID"] as? String,
            weeklyPlanCommitmentOne: payload["weeklyPlanCommitmentOne"] as? String,
            weeklyPlanCommitmentTwo: payload["weeklyPlanCommitmentTwo"] as? String,
            weeklyPlanSupport: payload["weeklyPlanSupport"] as? String,
            weeklyPlanReflection: payload["weeklyPlanReflection"] as? String
        )
    }

    private func launchSignedInCaptureApp(
        baseURLOverride: String? = nil,
        expectProtectedOfflineShell: Bool = false,
        initialTab: String = "today",
        sessionDeepLinkRoomID: String? = nil
    ) throws -> XCUIApplication {
        let credentials = try runtimeSmokeCredentials()
        let app = XCUIApplication()
        app.launchEnvironment["QUIPSLY_API_BASE_URL"] = baseURLOverride ?? credentials.baseURL
        if let credentialsPath = credentials.credentialsPath {
            app.launchEnvironment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"] = credentialsPath
        }
        app.launchArguments.append("--quipsly-capture-runtime-smoke")
        if credentials.recordingFixtureAssetID?.isEmpty == false {
            app.launchArguments.append("--quipsly-capture-runtime-playback-fixture")
        }
        if initialTab != "today" {
            app.launchArguments.append("--capture-ui-preview-tab=\(initialTab)")
        }
        if let sessionDeepLinkRoomID, !sessionDeepLinkRoomID.isEmpty {
            app.launchArguments.append(
                "--capture-runtime-session-link=quipsly://session/\(sessionDeepLinkRoomID)?mode=live"
            )
        }
        app.launch()

        if expectProtectedOfflineShell {
            XCTAssertTrue(
                app.descendants(matching: .any)["CaptureOfflineAccessBanner"].waitForExistence(timeout: 30),
                "A recently verified account should open the protected offline shell when Nest is unreachable."
            )
            return app
        }

        signInIfNeeded(app, credentials: credentials)
        ensureExactSignedInAccount(
            app,
            credentials: credentials,
            restoringTab: initialTab
        )
        let initialSurfaceIdentifier: String
        switch initialTab {
        case "record": initialSurfaceIdentifier = "CaptureRecorderView"
        case "work": initialSurfaceIdentifier = "CaptureWorkView"
        case "library": initialSurfaceIdentifier = "CaptureLibraryView"
        case "account": initialSurfaceIdentifier = "CaptureAccountView"
        default: initialSurfaceIdentifier = "CaptureTodayView"
        }
        if initialTab != "today" {
            let expectedTitle = initialTab.capitalized
            XCTAssertTrue(
                app.navigationBars[expectedTitle].waitForExistence(timeout: 60),
                "The requested root tab should be visibly selected; a hidden TabView descendant is not launch proof."
            )
        }
        XCTAssertTrue(
            app.descendants(matching: .any)[initialSurfaceIdentifier].waitForExistence(timeout: 60),
            "The native auth transaction should finish and load the requested signed-in root surface before workflow navigation begins."
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
            if app.tabBars.firstMatch.exists { return }
            guard emailField.exists else { return }
            if (emailField.value as? String) != credentials.email {
                emailField.tap()
                emailField.typeKey("a", modifierFlags: .command)
                emailField.typeKey(.delete, modifierFlags: [])
                emailField.typeText(credentials.email)
            }

            let passwordField = app.secureTextFields["QuipslyCapturePasswordField"]
            if !passwordField.waitForExistence(timeout: 4) {
                XCTAssertTrue(
                    app.tabBars.firstMatch.exists,
                    "The restored session should reach Capture if its transient password field disappears."
                )
                return
            }
            if app.tabBars.firstMatch.exists { return }
            let currentPassword = passwordField.value as? String
            if currentPassword == nil || currentPassword?.isEmpty == true || currentPassword == "Password" {
                passwordField.tap()
                passwordField.typeText(credentials.password)
            }

            let signInButton = app.buttons["QuipslyCaptureSignInButton"]
            if app.tabBars.firstMatch.exists { return }
            if !signInButton.waitForExistence(timeout: 4) {
                XCTAssertTrue(
                    app.tabBars.firstMatch.exists,
                    "The restored session should reach Capture if its transient sign-in surface disappears."
                )
                return
            }
            if app.tabBars.firstMatch.exists { return }
            signInButton.tap()
        }
    }

    private func ensureExactSignedInAccount(
        _ app: XCUIApplication,
        credentials: RuntimeSmokeCredentials,
        restoringTab: String
    ) {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(
            tabBar.waitForExistence(timeout: 60),
            "Capture should expose its signed-in shell before account identity is trusted."
        )

        func openAccount() -> XCUIElement {
            let accountTab = tabBar.buttons["Account"].firstMatch
            XCTAssertTrue(accountTab.waitForExistence(timeout: 8))
            accountTab.tap()
            let account = app.descendants(matching: .any)["CaptureSignedInAccount"].firstMatch
            XCTAssertTrue(
                account.waitForExistence(timeout: 20),
                "Runtime proof requires a readable signed-in account identity."
            )
            return account
        }

        let expectedEmail = credentials.email.lowercased()
        var shellAccount = app.descendants(matching: .any)["CaptureSignedInShellAccount"].firstMatch
        XCTAssertTrue(
            shellAccount.waitForExistence(timeout: 20),
            "The signed-in shell must expose a noninteractive account identity for operated proof."
        )
        let restoredIdentity = String(describing: shellAccount.value ?? "").lowercased()
        if !restoredIdentity.contains(expectedEmail) {
            var account = openAccount()
            let signOut = app.buttons["CaptureSignOutButton"].firstMatch
            XCTAssertTrue(
                signOut.waitForExistence(timeout: 8),
                "A restored session for the wrong actor must expose deliberate account switching."
            )
            signOut.tap()
            // Runtime-smoke LoginView intentionally begins the credential-file
            // sign-in as soon as it appears, so the form may be too brief for
            // XCTest to observe. Use it when visible; otherwise require the
            // exact replacement identity below instead of mistaking a hidden
            // automatic sign-in for a failed sign-out.
            if app.textFields["QuipslyCaptureEmailField"].waitForExistence(timeout: 2) {
                signInIfNeeded(app, credentials: credentials)
            }
            XCTAssertTrue(
                tabBar.waitForExistence(timeout: 60),
                "The requested runtime actor should reach the signed-in shell after account switching."
            )
            account = openAccount()
            let exactAccount = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "value CONTAINS[c] %@", expectedEmail),
                object: account
            )
            XCTAssertEqual(
                XCTWaiter.wait(for: [exactAccount], timeout: 60),
                .completed,
                "Runtime proof refuses a restored Firebase session belonging to a different account."
            )

            let restoredTitle = restoringTab.capitalized
            let restoredButton = tabBar.buttons[restoredTitle].firstMatch
            XCTAssertTrue(restoredButton.waitForExistence(timeout: 8))
            restoredButton.tap()
            shellAccount = app.descendants(matching: .any)["CaptureSignedInShellAccount"].firstMatch
        }

        let exactActor = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value CONTAINS[c] %@", expectedEmail),
            object: shellAccount
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [exactActor], timeout: 60),
            .completed,
            "Runtime proof refuses a restored Firebase session belonging to a different account."
        )
    }

    private func waitForRuntimeElement(_ element: XCUIElement, in app: XCUIApplication, timeout: TimeInterval = 18, swipeAttempts: Int = 8) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var attempts = 0
        while Date() < deadline {
            if element.exists { return true }
            if attempts < swipeAttempts {
                let namedRecorderSurface = app.scrollViews["CaptureRecorderView"].firstMatch
                let recorderSurface = namedRecorderSurface.exists
                    ? namedRecorderSurface
                    : app.scrollViews.firstMatch
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

    private func jumpToTranscript(in app: XCUIApplication) {
        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 10))
        jumpMenu.tap()
        let transcript = app.buttons["CaptureTranscriptJumpToTranscript"].firstMatch
        XCTAssertTrue(transcript.waitForExistence(timeout: 10))
        transcript.tap()
    }

    private func scrollRuntimeElementIntoHittableView(
        _ element: XCUIElement,
        in app: XCUIApplication,
        timeout: TimeInterval = 18,
        swipeAttempts: Int = 8
    ) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        var attempts = 0
        while Date() < deadline {
            if element.exists && element.isHittable { return true }
            if attempts < swipeAttempts {
                let recorderSurface = app.scrollViews["CaptureRecorderView"].firstMatch
                if recorderSurface.exists && recorderSurface.isHittable {
                    recorderSurface.swipeUp()
                } else {
                    app.swipeUp()
                }
                attempts += 1
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        return element.exists && element.isHittable
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
        let destination: XCUIElement
        switch title {
        case "Today":
            destination = app.descendants(matching: .any)["CaptureTodayView"].firstMatch
        case "Record":
            destination = app.scrollViews["CaptureRecorderView"].firstMatch
        case "Work":
            destination = app.descendants(matching: .any)["CaptureWorkView"].firstMatch
        case "Library":
            destination = app.scrollViews["CaptureLibraryView"].firstMatch
        case "Account":
            destination = app.descendants(matching: .any)["CaptureAccountView"].firstMatch
        default:
            XCTFail("Capture runtime test has no destination proof for the \(title) root tab.")
            return
        }
        XCTAssertTrue(
            destination.waitForExistence(timeout: 8),
            "Capture should render the \(title) destination after its root tab is tapped."
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
                waitForRuntimeElement(
                    exactSession,
                    in: app,
                    timeout: 60,
                    swipeAttempts: 12
                ),
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

    private func attachRuntimeScreenshot(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func replaceText(in element: XCUIElement, with value: String, app: XCUIApplication) {
        XCTAssertTrue(element.waitForExistence(timeout: 8))
        for _ in 0..<12 where !element.isHittable { appSwipeUp(app) }
        XCTAssertTrue(element.isHittable)
        element.tap()
        element.typeKey("a", modifierFlags: .command)
        element.typeKey(.delete, modifierFlags: [])
        // iOS can keep SwiftUI's old value after Command-A/Delete even though the
        // selection event was accepted. Never type replacement text until the
        // binding itself proves empty; fall back to deleting from the document end.
        // Multiline SwiftUI fields can expose only a truncated chunk of their
        // value to XCTest. Re-read and clear in bounded chunks until the live
        // accessibility value is empty instead of assuming one length is exact.
        for _ in 0..<8 {
            guard let remaining = element.value as? String, !remaining.isEmpty else { break }
            element.typeKey(.rightArrow, modifierFlags: .command)
            element.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: remaining.count))
        }
        XCTAssertEqual(element.value as? String, "", "The operated field must be empty before replacement text is entered.")
        // SwiftUI can replace the TextEditor accessibility node after clearing its
        // binding. Route the new text through the application so XCTest targets the
        // currently focused replacement instead of a stale element snapshot.
        app.typeText(value)
        let packetNoteKeyboardDone = app.buttons["CapturePacketNoteKeyboardDone"].firstMatch
        let coachKeyboardDone = app.buttons["CaptureCoachFollowUpKeyboardDone"].firstMatch
        let weeklyPlanKeyboardDone = app.buttons["CaptureWeeklyPlanKeyboardDone"].firstMatch
        let keyboardDone = app.keyboards.buttons["Done"].firstMatch
        if packetNoteKeyboardDone.waitForExistence(timeout: 2) { packetNoteKeyboardDone.tap() }
        else if coachKeyboardDone.waitForExistence(timeout: 2) { coachKeyboardDone.tap() }
        else if weeklyPlanKeyboardDone.waitForExistence(timeout: 2) { weeklyPlanKeyboardDone.tap() }
        else if keyboardDone.exists { keyboardDone.tap() }
        else { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.16)).tap() }
    }

    private func runtimeJSON(
        _ request: URLRequest,
        context: String,
        requireOK: Bool = true
    ) async throws -> [String: Any] {
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse,
              let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              http.statusCode == 200,
              !requireOK || payload["ok"] as? Bool == true else {
            let status = (response as? HTTPURLResponse)?.statusCode ?? -1
            XCTFail("\(context) failed against the loopback acceptance fixture with HTTP \(status).")
            throw NSError(
                domain: "QuipslyCaptureRuntime",
                code: status,
                userInfo: [NSLocalizedDescriptionKey: context]
            )
        }
        return payload
    }

    private func injectConcurrentTranscriptCorrection(
        credentials: RuntimeSmokeCredentials,
        segmentID: String,
        correctedText: String
    ) async throws {
        guard let baseURL = URL(string: credentials.baseURL),
              baseURL.scheme == "http",
              ["127.0.0.1", "localhost", "::1"].contains(baseURL.host ?? ""),
              let roomID = credentials.sessionID,
              !roomID.isEmpty else {
            XCTFail("Concurrent transcript acceptance is restricted to one explicit loopback fixture.")
            throw NSError(domain: "QuipslyCaptureRuntime", code: 1)
        }
        let emulatorHost = ProcessInfo.processInfo.environment["FIREBASE_AUTH_EMULATOR_HOST"]
            ?? "127.0.0.1:9099"
        guard !emulatorHost.contains("/"),
              let authURL = URL(
                string: "http://\(emulatorHost)/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key"
              ),
              ["127.0.0.1", "localhost", "::1"].contains(authURL.host ?? "") else {
            XCTFail("Concurrent transcript acceptance requires the loopback Firebase emulator.")
            throw NSError(domain: "QuipslyCaptureRuntime", code: 2)
        }

        var authRequest = URLRequest(url: authURL)
        authRequest.httpMethod = "POST"
        authRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        authRequest.httpBody = try JSONSerialization.data(withJSONObject: [
            "email": credentials.email,
            "password": credentials.password,
            "returnSecureToken": true,
        ])
        let auth = try await runtimeJSON(
            authRequest,
            context: "Firebase emulator authentication",
            requireOK: false
        )
        guard let idToken = auth["idToken"] as? String, !idToken.isEmpty else {
            XCTFail("The loopback Firebase emulator returned no bearer token.")
            throw NSError(domain: "QuipslyCaptureRuntime", code: 3)
        }

        var deskComponents = URLComponents(
            url: baseURL.appendingPathComponent("api/mobile/capture/transcripts/corrections"),
            resolvingAgainstBaseURL: false
        )
        deskComponents?.queryItems = [URLQueryItem(name: "callRoomId", value: roomID)]
        guard let deskURL = deskComponents?.url else {
            throw NSError(domain: "QuipslyCaptureRuntime", code: 4)
        }
        var deskRequest = URLRequest(url: deskURL)
        deskRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        deskRequest.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        let desk = try await runtimeJSON(deskRequest, context: "Concurrent transcript evidence read")
        guard let segments = desk["segments"] as? [[String: Any]],
              let segment = segments.first(where: { $0["id"] as? String == segmentID }),
              let providerText = segment["providerText"] as? String,
              let endSeconds = segment["endSeconds"] as? NSNumber else {
            XCTFail("The exact concurrent transcript segment is absent from the loopback fixture.")
            throw NSError(domain: "QuipslyCaptureRuntime", code: 5)
        }
        let providerSpeaker = segment["providerSpeakerLabel"] as? String
        let acceptedCorrection = segment["acceptedCorrection"] as? [String: Any]
        let acceptedCorrectionID = acceptedCorrection?["id"] as? String
        let providerSpeakerJSON: Any = providerSpeaker.map { $0 as Any } ?? NSNull()
        let acceptedCorrectionIDJSON: Any = acceptedCorrectionID.map { $0 as Any } ?? NSNull()

        var correctionRequest = URLRequest(
            url: baseURL.appendingPathComponent("api/mobile/capture/transcripts/corrections")
        )
        correctionRequest.httpMethod = "POST"
        correctionRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        correctionRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        correctionRequest.httpBody = try JSONSerialization.data(withJSONObject: [
            "operation": "accept-human-correction",
            "roomId": roomID,
            "segmentId": segmentID,
            "clientRequestId": "runtime-concurrent-transcript-\(UUID().uuidString.lowercased())",
            "expectedText": providerText,
            "expectedSpeakerLabel": providerSpeakerJSON,
            "expectedAcceptedCorrectionId": acceptedCorrectionIDJSON,
            "correctedText": correctedText,
            "correctedSpeakerLabel": providerSpeakerJSON,
            "reason": "Concurrent loopback reviewer acceptance for stale-overlay reconciliation proof.",
            "confirmedAgainstPlayback": true,
            "playbackPositionSeconds": endSeconds.doubleValue,
        ])
        let correction = try await runtimeJSON(
            correctionRequest,
            context: "Concurrent transcript correction"
        )
        let accepted = correction["correction"] as? [String: Any]
        XCTAssertEqual(accepted?["segmentId"] as? String, segmentID)
        XCTAssertEqual(accepted?["correctedText"] as? String, correctedText)
        XCTAssertEqual(accepted?["status"] as? String, "accepted")
    }

    private func appSwipeUp(_ app: XCUIApplication) {
        let transcriptReviewSurface = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        let recorderSurface = app.scrollViews["CaptureRecorderView"].firstMatch
        let surface = transcriptReviewSurface.exists && transcriptReviewSurface.isHittable
            ? transcriptReviewSurface
            : recorderSurface.exists && recorderSurface.isHittable
                ? recorderSurface
                : app.scrollViews.firstMatch
        if surface.exists { surface.swipeUp() }
        else { app.swipeUp() }
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

    private func saveProjectQuickEntry(
        kind: String,
        title: String,
        body: String,
        projectName: String,
        tagLabel: String,
        createsTag: Bool,
        expectedMessage: String,
        in app: XCUIApplication
    ) {
        let entryButton = app.buttons["CaptureWorkQuickEntry_\(kind)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(entryButton, in: app, timeout: 20, swipeAttempts: 10),
            "Work should expose Quick \(kind.capitalized) for the newly selected project."
        )
        entryButton.tap()

        let sheet = app.descendants(matching: .any)["CaptureQuickEntrySheet_\(kind)"].firstMatch
        XCTAssertTrue(sheet.waitForExistence(timeout: 6))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Destination, \(projectName)")
        ).firstMatch.waitForExistence(timeout: 4))

        let titleField = app.textFields["CaptureQuickEntryTitle"].firstMatch
        XCTAssertTrue(titleField.waitForExistence(timeout: 4))
        titleField.tap()
        titleField.typeText(title)
        let keyboardDone = app.buttons["CaptureQuickEntryKeyboardDone"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 4))
        keyboardDone.tap()
        let bodyField = app.textFields["CaptureQuickEntryBody"].firstMatch
        XCTAssertTrue(bodyField.waitForExistence(timeout: 4))
        bodyField.tap()
        expectation(
            for: NSPredicate(format: "hasKeyboardFocus == true"),
            evaluatedWith: bodyField
        )
        waitForExpectations(timeout: 4)
        bodyField.typeText(body)
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 4))
        keyboardDone.tap()

        if createsTag {
            let tagField = app.textFields["CaptureQuickEntryNewTagField"].firstMatch
            for _ in 0..<10 where !tagField.isHittable { sheet.swipeUp() }
            XCTAssertTrue(tagField.isHittable)
            tagField.tap()
            tagField.typeText(tagLabel)
            let addTag = app.buttons["CaptureQuickEntryNewTagAdd"].firstMatch
            XCTAssertTrue(addTag.waitForExistence(timeout: 4))
            addTag.tap()
            XCTAssertTrue(app.buttons["Remove new tag \(tagLabel)"].waitForExistence(timeout: 4))
        } else {
            let tag = app.buttons.matching(
                NSPredicate(format: "label == %@ OR label CONTAINS %@", tagLabel, tagLabel)
            ).firstMatch
            for _ in 0..<10 where !tag.isHittable { sheet.swipeUp() }
            XCTAssertTrue(tag.isHittable, "The Work projection should expose the tag created by the prior canonical capture.")
            tag.tap()
            expectation(for: NSPredicate(format: "value == %@", "Selected"), evaluatedWith: tag)
            waitForExpectations(timeout: 4)
        }

        let save = app.buttons["CaptureQuickEntrySave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(sheet.waitForNonExistence(timeout: 6))
        let acknowledgement = app.staticTexts.matching(
            NSPredicate(format: "label == %@", expectedMessage)
        ).firstMatch
        XCTAssertTrue(
            acknowledgement.waitForExistence(timeout: 30),
            "Nest should acknowledge the exact project-bound \(kind.lowercased())."
        )
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
        XCTAssertTrue(
            waitForRuntimeElement(app.staticTexts[title].firstMatch, in: app, timeout: 30, swipeAttempts: 10),
            "Work should read the canonical \(kind.lowercased()) back from the same project."
        )
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

    func testSignedInIPhoneUpdatesCanonicalWeeklyPlanAndSurvivesRelaunch() throws {
        let credentials = try runtimeSmokeCredentials()
        let commitmentOne = try XCTUnwrap(credentials.weeklyPlanCommitmentOne)
        let commitmentTwo = try XCTUnwrap(credentials.weeklyPlanCommitmentTwo)
        let support = try XCTUnwrap(credentials.weeklyPlanSupport)
        let reflection = try XCTUnwrap(credentials.weeklyPlanReflection)

        func openEditor(in app: XCUIApplication) {
            let trigger = app.buttons.matching(
                NSPredicate(
                    format: "identifier == %@ OR identifier == %@",
                    "CaptureTodayWeeklyPlanEdit",
                    "CaptureTodayWeeklyPlanCreate"
                )
            ).firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(trigger, in: app, timeout: 30, swipeAttempts: 12),
                "Today should expose the current canonical weekly plan or the explicit create action."
            )
            trigger.tap()
            XCTAssertTrue(
                app.collectionViews["CaptureWeeklyPlanSheet"].waitForExistence(timeout: 8),
                "The signed-in app should present the protected weekly-plan editor."
            )
        }

        func reveal(_ element: XCUIElement, in form: XCUIElement) {
            for _ in 0..<16 where !element.isHittable {
                form.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
                    .press(
                        forDuration: 0.05,
                        thenDragTo: form.coordinate(
                            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)
                        )
                    )
                RunLoop.current.run(until: Date().addingTimeInterval(0.15))
            }
            XCTAssertTrue(element.isHittable, "The weekly-plan editor must keep every operated field reachable.")
        }

        var app = try launchSignedInCaptureApp(initialTab: "today")
        openEditor(in: app)
        let form = app.collectionViews["CaptureWeeklyPlanSheet"].firstMatch
        let commitmentOneField = app.textFields["CaptureWeeklyPlanCommitmentOne"].firstMatch
        let commitmentTwoField = app.textFields["CaptureWeeklyPlanCommitmentTwo"].firstMatch
        replaceText(in: commitmentOneField, with: commitmentOne, app: app)
        replaceText(in: commitmentTwoField, with: commitmentTwo, app: app)

        let supportField = app.textFields["CaptureWeeklyPlanSupport"].firstMatch
        reveal(supportField, in: form)
        replaceText(in: supportField, with: support, app: app)
        let reflectionField = app.textFields["CaptureWeeklyPlanReflection"].firstMatch
        reveal(reflectionField, in: form)
        replaceText(in: reflectionField, with: reflection, app: app)
        let reviewed = app.switches["CaptureWeeklyPlanReviewed"].firstMatch
        reveal(reviewed, in: form)
        if reviewed.value as? String == "0" {
            reviewed.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
            expectation(
                for: NSPredicate(format: "value == %@", "1"),
                evaluatedWith: reviewed
            )
            waitForExpectations(timeout: 3)
        }
        XCTAssertEqual(reviewed.value as? String, "1")

        let save = app.buttons["CaptureWeeklyPlanSave"].firstMatch
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(
            form.waitForNonExistence(timeout: 30),
            "The editor should close only after Nest acknowledges the protected decision."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayWeeklyPlanPending"].exists,
            "A successful signed-in operation should leave no unresolved phone outbox item."
        )

        app.terminate()
        app = try launchSignedInCaptureApp(initialTab: "today")
        let canonicalCard = app.descendants(matching: .any)["CaptureTodayWeeklyPlan"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(canonicalCard, in: app, timeout: 30, swipeAttempts: 12),
            "The current weekly plan should survive process relaunch."
        )
        openEditor(in: app)
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanCommitmentOne"].value as? String, commitmentOne)
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanCommitmentTwo"].value as? String, commitmentTwo)
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanSupport"].value as? String, support)
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanReflection"].value as? String, reflection)
        XCTAssertEqual(app.switches["CaptureWeeklyPlanReviewed"].value as? String, "1")
        attachRuntimeScreenshot(app, name: "Canonical weekly plan after signed-in iPhone relaunch")
    }

    func testOwnerCreatesTwoVersionedNestBackupsFromAccount() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let projectName = credentials.projectName, !projectName.isEmpty else {
            throw XCTSkip("Nest portability requires the exact owned source Nest name.")
        }

        let app = try launchSignedInCaptureApp(initialTab: "account")
        let portabilityLink = app.descendants(matching: .any)[
            "CaptureAccountNestPortability"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(portabilityLink, in: app, timeout: 20, swipeAttempts: 12),
            "The signed-in Account should make backup and transfer reachable."
        )
        portabilityLink.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureNestPortabilityView"].waitForExistence(timeout: 12)
        )

        let projectPicker = app.buttons["CaptureNestPortabilityProjectPicker"].firstMatch
        XCTAssertTrue(projectPicker.waitForExistence(timeout: 12))
        projectPicker.tap()
        let projectChoice = app.buttons[projectName].firstMatch
        XCTAssertTrue(
            projectChoice.waitForExistence(timeout: 6),
            "Only owned Nests should appear in the portability destination picker."
        )
        projectChoice.tap()

        let export = app.buttons["CaptureNestExportButton"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(export, in: app, timeout: 15, swipeAttempts: 8)
        )
        XCTAssertTrue(export.isEnabled)
        export.tap()

        let share = app.buttons["CaptureNestShareBackup"].firstMatch
        XCTAssertTrue(
            share.waitForExistence(timeout: 30),
            "Authenticated Nest export should create one shareable protected package."
        )
        let filename = app.staticTexts["CaptureNestExportFilename"].firstMatch
        XCTAssertTrue(filename.waitForExistence(timeout: 5))
        let firstFilename = filename.label
        XCTAssertTrue(firstFilename.hasSuffix(".json"))

        export.tap()
        let secondFilename = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label != %@", firstFilename),
            object: filename
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [secondFilename], timeout: 30),
            .completed,
            "A repeated export must retain the first backup and expose a distinct filename."
        )
        XCTAssertTrue(filename.label.hasSuffix(".json"))
        XCTAssertNotEqual(filename.label, firstFilename)
        XCTAssertTrue(share.isHittable)
        attachRecordingIdentity(
            "\(projectName):\(firstFilename):\(filename.label)",
            name: "Two versioned owner Nest backups"
        )
    }

    func testIPhoneCreatesRetainedProjectAndOrganizesCanonicalWork() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let projectName = credentials.projectName,
              !projectName.isEmpty,
              let taskTitle = credentials.projectTaskTitle,
              !taskTitle.isEmpty,
              let tagLabel = credentials.projectTagLabel,
              !tagLabel.isEmpty else {
            throw XCTSkip("Project creation requires a unique retained project name, Task title, and tag label.")
        }

        let noteTitle = "\(taskTitle) · note"
        let goalTitle = "\(taskTitle) · goal"
        let app = try launchSignedInCaptureApp()
        tapRootTab("Work", in: app)
        XCTAssertTrue(app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 20))

        let newProject = app.buttons["CaptureWorkNewProjectInline"].firstMatch
        XCTAssertTrue(newProject.waitForExistence(timeout: 10))
        newProject.tap()
        XCTAssertTrue(app.navigationBars["New project"].waitForExistence(timeout: 6))

        let name = app.textFields["CaptureWorkProjectName"].firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 4))
        name.tap()
        name.typeText(projectName)
        let description = app.textFields["CaptureWorkProjectDescription"].firstMatch
        XCTAssertTrue(description.waitForExistence(timeout: 4))
        description.tap()
        description.typeText("Durable product fixture for operating Quipsly Capture project, task, note, goal, and taxonomy workflows over time.")
        let keyboardDone = app.buttons["Done"].firstMatch
        if keyboardDone.waitForExistence(timeout: 2) { keyboardDone.tap() }
        let productionKind = app.buttons["CaptureWorkProjectKind_production"].firstMatch
        for _ in 0..<4 where !productionKind.isHittable { app.swipeUp() }
        XCTAssertTrue(productionKind.isHittable)
        productionKind.tap()

        let create = app.buttons["CaptureWorkProjectCreate"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 4))
        XCTAssertTrue(create.isEnabled)
        create.tap()
        XCTAssertTrue(app.navigationBars["New project"].waitForNonExistence(timeout: 30))
        XCTAssertTrue(
            app.staticTexts[projectName].firstMatch.waitForExistence(timeout: 30),
            "Work should select the exact canonical project created through the compiled app."
        )

        saveProjectQuickEntry(
            kind: "TASK",
            title: taskTitle,
            body: "Operate the durable project through the real iPhone Capture surface and independently read it back from Nest.",
            projectName: projectName,
            tagLabel: tagLabel,
            createsTag: true,
            expectedMessage: "The task is saved in \(projectName) and assigned to you. Set its timing from Today, Work, or Calendar when useful.",
            in: app
        )
        saveProjectQuickEntry(
            kind: "NOTE",
            title: noteTitle,
            body: "This retained note records why the project exists and gives future product operations a real artifact to revisit.",
            projectName: projectName,
            tagLabel: tagLabel,
            createsTag: false,
            expectedMessage: "The private note is saved in \(projectName). Continue it from that Nest, Library, or Search.",
            in: app
        )
        saveProjectQuickEntry(
            kind: "GOAL",
            title: goalTitle,
            body: "Keep this project useful as a durable cross-device Quipsly Capture operating fixture.",
            projectName: projectName,
            tagLabel: tagLabel,
            createsTag: false,
            expectedMessage: "The goal is saved as active in \(projectName). Add progress evidence or supporting tasks when useful.",
            in: app
        )
        attachRecordingIdentity(projectName, name: "Retained iPhone-created project")
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
        editBody.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
        expectation(
            for: NSPredicate(format: "hasKeyboardFocus == true"),
            evaluatedWith: editBody
        )
        waitForExpectations(timeout: 4)
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

    func testTranscriptFollowThroughReturnsToExactSourceOnIPhone() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let goalID = credentials.goalID, !goalID.isEmpty,
              let sessionID = credentials.sessionID, !sessionID.isEmpty else {
            throw XCTSkip("The transcript follow-through journey requires exact Session, task, and goal IDs.")
        }
        let app = try launchSignedInCaptureApp()

        let task = app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(task, in: app, timeout: 30, swipeAttempts: 8),
            "Today should render the exact recent transcript-derived task identity."
        )
        let taskSource = app.descendants(matching: .any)["CaptureTodayTaskSourceLink_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(taskSource, in: app, timeout: 15, swipeAttempts: 8),
            "The transcript-derived task should expose its exact source-return control."
        )
        XCTAssertTrue(taskSource.label.contains("0:03"))
        XCTAssertTrue(taskSource.label.contains("0:04"))

        let goal = app.descendants(matching: .any)["CaptureTodayGoal_\(goalID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(goal, in: app, timeout: 15, swipeAttempts: 10),
            "Today should render the exact transcript-derived goal identity."
        )
        let goalSource = app.descendants(matching: .any)["CaptureTodayGoalSourceLink_\(goalID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(goalSource, in: app, timeout: 15, swipeAttempts: 10),
            "The transcript-derived goal should preserve the same source-return control."
        )
        XCTAssertTrue(goalSource.label.contains("0:03"))
        XCTAssertTrue(goalSource.label.contains("0:04"))

        taskSource.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30),
            "Returning from the task should open the protected transcript review."
        )
        let sourceBoundary = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTranscriptSourceBoundary_")
        ).firstMatch
        XCTAssertTrue(sourceBoundary.waitForExistence(timeout: 10))
        XCTAssertFalse(
            sourceBoundary.identifier.contains(sessionID),
            "The source boundary should identify the immutable segment, not substitute the room identity."
        )
        XCTAssertTrue(app.staticTexts["Welcome, everybody."].firstMatch.waitForExistence(timeout: 15))
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].firstMatch.exists,
            "A different iPhone must remain review-only when it does not hold the exact local recording asset."
        )
    }

    func testRetainedSessionShowsCompleteMultiSegmentPacketOnIPhone() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false else {
            throw XCTSkip("Complete-span packet review requires the exact retained Session ID and title.")
        }
        let app = try launchSignedInCaptureApp(initialTab: "record")
        selectRequestedSession(in: app, credentials: credentials)

        let reviewLink = app.descendants(matching: .any)["CaptureSessionTranscriptReviewLink_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(reviewLink, in: app, timeout: 30, swipeAttempts: 8),
            "The exact completed canonical Session should expose direct transcript and packet review."
        )
        XCTAssertTrue(reviewLink.isHittable)
        reviewLink.tap()

        XCTAssertTrue(
            app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30),
            "Direct Session review should open the compiled canonical transcript surface."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].firstMatch.waitForExistence(timeout: 20),
            "The simulator must stay review-only because it does not hold the protected imported source asset."
        )

        let packetLoaded = app.descendants(matching: .any)["CaptureTranscriptPacketLoadedBoundary"].firstMatch
        XCTAssertTrue(
            packetLoaded.waitForExistence(timeout: 30),
            "The canonical packet request should finish before the test navigates to a review lane."
        )
        guard packetLoaded.exists else {
            attachRuntimeScreenshot(app, name: "Retained packet did not reach loaded boundary")
            return
        }

        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 12))
        guard jumpMenu.exists else {
            attachRuntimeScreenshot(app, name: "Retained packet jump menu unavailable")
            return
        }
        jumpMenu.tap()
        let jumpToGoals = app.buttons["CaptureTranscriptJumpToGoals"].firstMatch
        XCTAssertTrue(
            jumpToGoals.waitForExistence(timeout: 12),
            "A loaded goal candidate should make the explicit Goals jump action available."
        )
        guard jumpToGoals.exists else {
            attachRuntimeScreenshot(app, name: "Retained packet Goals jump unavailable")
            return
        }
        jumpToGoals.tap()

        let createGoal = app.buttons["CapturePacketGoalAcceptButton"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(createGoal, in: app, timeout: 20, swipeAttempts: 6),
            "The retained v4 goal lane should expose its deliberate human creation control."
        )
        guard createGoal.exists else {
            attachRuntimeScreenshot(app, name: "Retained packet goal control unavailable after explicit jump")
            return
        }
        let completeThought = "The test goal is to preserve the original recording, verify the exact checksum, and hold all transcript work until every participant has consented and a human explicitly releases it."
        let completeSourceText = app.staticTexts.matching(
            NSPredicate(format: "label == %@", completeThought)
        ).firstMatch
        XCTAssertTrue(
            completeSourceText.waitForExistence(timeout: 12),
            "Capture must render the entire source thought instead of truncating it to one transcript segment."
        )
        XCTAssertTrue(
            app.staticTexts["Complete thought across 3 immutable transcript segments"].firstMatch.waitForExistence(timeout: 12),
            "The native candidate must disclose its complete three-segment evidence span."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePacketGoalSourceReviewRequired"].firstMatch.waitForExistence(timeout: 12),
            "Provider-only packet evidence must explain that every source segment needs playback review."
        )
        XCTAssertFalse(
            createGoal.isEnabled,
            "A packet goal must not become canonical work until its complete three-segment source has been reviewed."
        )

        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Retained complete transcript span — review only"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        attachRecordingIdentity(completeThought, name: "Retained packet complete goal source")
        // Intentionally do not tap any packet decision. The enclosing operator
        // compares authoritative packet readback before and after this test.
    }

    func testReviewedTranscriptPacketMaterializesCanonicalNoteGoalAndTask() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false,
              credentials.transcriptSegmentIDs.count == 3,
              let expectedGoalTitle = credentials.expectedPacketGoalTitle,
              !expectedGoalTitle.isEmpty,
              let expectedTaskTitle = credentials.expectedPacketTaskTitle,
              !expectedTaskTitle.isEmpty,
              let expectedNoteSourceText = credentials.expectedPacketNoteSourceText,
              !expectedNoteSourceText.isEmpty,
              let expectedNoteLaneID = credentials.expectedPacketNoteLaneID,
              !expectedNoteLaneID.isEmpty,
              let editedNoteTitle = credentials.packetNoteEditedTitle,
              !editedNoteTitle.isEmpty,
              let editedNoteBody = credentials.packetNoteEditedBody,
              !editedNoteBody.isEmpty,
              let expectedAssetID = credentials.recordingFixtureAssetID,
              !expectedAssetID.isEmpty else {
            throw XCTSkip("Reviewed packet materialization requires exact Session, three-segment source, goal title, note draft, and recording-asset identities.")
        }
        let app = try launchSignedInCaptureApp(initialTab: "record")
        let fixtureReceipt = app.descendants(matching: .any)["CaptureRuntimePlaybackFixtureReceipt"].firstMatch
        XCTAssertTrue(
            fixtureReceipt.waitForExistence(timeout: 20),
            "The compiled app must install the checksum-verified retained source before transcript review."
        )
        XCTAssertTrue(
            String(describing: fixtureReceipt.value ?? "").contains(expectedAssetID),
            "The operated fixture receipt must identify the exact canonical recording asset; got \(String(describing: fixtureReceipt.value ?? "nil"))."
        )

        selectRequestedSession(in: app, credentials: credentials)
        let reviewLink = app.descendants(matching: .any)["CaptureSessionTranscriptReviewLink_\(sessionID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reviewLink, in: app, timeout: 30, swipeAttempts: 8))
        reviewLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30))
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].waitForExistence(timeout: 3),
            "The exact retained local source should make playback review available on this operated simulator."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketLoadedBoundary"].firstMatch.waitForExistence(timeout: 30)
        )

        // The review packet can contain a substantial candidate queue. Use the
        // same explicit Transcript jump that a person would use instead of
        // depending on a fixed number of swipes through unrelated candidates.
        // This also proves that retained-source playback remains directly
        // reachable as the packet grows.
        for (reviewIndex, segmentID) in credentials.transcriptSegmentIDs.enumerated() {
            jumpToTranscript(in: app)
            let play = app.buttons["CaptureTranscriptPlayButton_\(segmentID)"].firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(play, in: app, timeout: 20, swipeAttempts: 12),
                "The exact packet source segment \(segmentID) must expose retained-source playback."
            )
            XCTAssertTrue(play.isEnabled)
            play.tap()

            let confirm = app.buttons["CaptureTranscriptConfirmAsIsButton_\(segmentID)"].firstMatch
            XCTAssertTrue(confirm.waitForExistence(timeout: 5))
            let playbackReachedSegmentEnd = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "enabled == true"),
                object: confirm
            )
            XCTAssertEqual(
                XCTWaiter.wait(for: [playbackReachedSegmentEnd], timeout: 15),
                .completed,
                "Playback must reach the exact segment end before its provider text can be confirmed."
            )
            confirm.tap()
            let progress = app.staticTexts["CaptureTranscriptReviewProgressCount"].firstMatch
            let expectedReviewedCount = reviewIndex + 1
            let receiptReadBack = XCTNSPredicateExpectation(
                predicate: NSPredicate(
                    format: "label BEGINSWITH %@",
                    "\(expectedReviewedCount) of "
                ),
                object: progress
            )
            XCTAssertEqual(
                XCTWaiter.wait(for: [receiptReadBack], timeout: 30),
                .completed,
                "Nest must read back review progress after the human playback-verification receipt for \(segmentID)."
            )
        }

        let buildCurrentPacket = app.buttons["CaptureTranscriptBuildCurrentPacketButton"].firstMatch
        for _ in 0..<16 where !buildCurrentPacket.exists {
            app.scrollViews["CaptureTranscriptReviewView"].firstMatch.swipeDown()
        }
        XCTAssertTrue(
            buildCurrentPacket.waitForExistence(timeout: 10),
            "Changing transcript review state must stale the old packet and expose an append-only rebuild."
        )
        XCTAssertTrue(buildCurrentPacket.isEnabled)
        buildCurrentPacket.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketStaleBoundary"].firstMatch
                .waitForNonExistence(timeout: 30),
            "The rebuilt packet must snapshot the current human-reviewed transcript state."
        )

        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 10))
        jumpMenu.tap()
        let jumpToNotes = app.buttons["CaptureTranscriptJumpToNotes"].firstMatch
        XCTAssertTrue(jumpToNotes.waitForExistence(timeout: 10))
        jumpToNotes.tap()

        let sourcePrefix = "CapturePacketNoteSourceText_"
        let laneSourcePrefix = "\(sourcePrefix)\(expectedNoteLaneID)-"
        let exactNoteSource = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@ AND identifier BEGINSWITH %@",
                expectedNoteSourceText,
                laneSourcePrefix
            )
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(exactNoteSource, in: app, timeout: 20, swipeAttempts: 12),
            "The rebuilt packet must retain the exact complete-thought source on the requested note lane."
        )
        let candidateKey = String(exactNoteSource.identifier.dropFirst(sourcePrefix.count))
        XCTAssertFalse(candidateKey.isEmpty)

        let editCandidate = app.buttons["CapturePacketNoteEditButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(editCandidate, in: app, timeout: 12, swipeAttempts: 6))
        editCandidate.tap()
        let noteTitle = app.textFields["CapturePacketNoteTitleField"].firstMatch
        let noteBody = app.textFields["CapturePacketNoteBodyField"].firstMatch
        XCTAssertTrue(noteTitle.waitForExistence(timeout: 8))
        XCTAssertTrue(noteBody.waitForExistence(timeout: 8))
        replaceText(in: noteTitle, with: editedNoteTitle, app: app)
        replaceText(in: noteBody, with: editedNoteBody, app: app)
        let saveDraft = app.buttons["CapturePacketCreateNoteButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(saveDraft.isEnabled)
        saveDraft.tap()
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label == %@", "EDITED DRAFT")).firstMatch
                .waitForExistence(timeout: 30),
            "The non-canonical edit must read back from Nest before acceptance."
        )
        XCTAssertFalse(app.descendants(matching: .any)["CapturePacketNoteSaved_\(candidateKey)"].exists)

        let reviewNote = app.buttons["CapturePacketReviewNoteButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reviewNote, in: app, timeout: 12, swipeAttempts: 6))
        reviewNote.tap()
        XCTAssertTrue(noteTitle.waitForExistence(timeout: 8))
        XCTAssertEqual(noteTitle.value as? String, editedNoteTitle)
        XCTAssertEqual(noteBody.value as? String, editedNoteBody)
        let saveCanonicalNote = app.buttons["CapturePacketCreateNoteButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(saveCanonicalNote.isEnabled)
        saveCanonicalNote.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePacketNoteSaved_\(candidateKey)"].firstMatch
                .waitForExistence(timeout: 30),
            "The separate playback-gated save must read back as one canonical Session note."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePacketNoteGovernance_\(candidateKey)"].firstMatch
                .waitForExistence(timeout: 12),
            "The canonical note must expose its governed materialization receipt in Capture."
        )

        jumpMenu.tap()
        let jumpToGoals = app.buttons["CaptureTranscriptJumpToGoals"].firstMatch
        XCTAssertTrue(jumpToGoals.waitForExistence(timeout: 10))
        jumpToGoals.tap()

        let accept = app.buttons["CapturePacketGoalAcceptButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(accept, in: app, timeout: 20, swipeAttempts: 8))
        XCTAssertFalse(app.descendants(matching: .any)["CapturePacketGoalSourceReviewRequired"].firstMatch.exists)
        XCTAssertTrue(accept.isEnabled)
        let exactGoalTitle = app.staticTexts.matching(
            NSPredicate(format: "label == %@", expectedGoalTitle)
        ).firstMatch
        XCTAssertTrue(exactGoalTitle.waitForExistence(timeout: 8))
        accept.tap()
        let create = app.buttons["CapturePacketGoalCreateButton"].firstMatch
        XCTAssertTrue(create.waitForExistence(timeout: 8))
        XCTAssertTrue(create.isEnabled)
        create.tap()

        let accepted = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketGoalAccepted_")
        ).firstMatch
        XCTAssertTrue(
            accepted.waitForExistence(timeout: 30),
            "The explicit create decision must read back as one accepted canonical goal."
        )

        jumpMenu.tap()
        let jumpToTasks = app.buttons["CaptureTranscriptJumpToTasks"].firstMatch
        XCTAssertTrue(jumpToTasks.waitForExistence(timeout: 10))
        jumpToTasks.tap()
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(NSPredicate(format: "label == %@", expectedTaskTitle)).firstMatch,
                in: app,
                timeout: 20,
                swipeAttempts: 8
            ),
            "The reviewed packet must expose its exact source-backed task candidate directly."
        )
        let acceptTask = app.buttons["CapturePacketTaskAcceptButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(acceptTask, in: app, timeout: 12, swipeAttempts: 6))
        XCTAssertTrue(acceptTask.isEnabled)
        acceptTask.tap()
        let createTask = app.buttons["CapturePacketTaskCreateButton"].firstMatch
        XCTAssertTrue(createTask.waitForExistence(timeout: 8))
        XCTAssertTrue(createTask.isEnabled)
        createTask.tap()
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketTaskAccepted_")
            ).firstMatch.waitForExistence(timeout: 30),
            "The explicit create decision must read back as one accepted canonical task."
        )

        tapRootTab("Today", in: app)
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(NSPredicate(format: "label == %@", expectedGoalTitle)).firstMatch,
                in: app,
                timeout: 30,
                swipeAttempts: 12
            ),
            "Today must read back the exact canonical goal created from the fully reviewed packet."
        )
        let showMoreTasks = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMoreTasks, in: app, timeout: 5, swipeAttempts: 8) {
            showMoreTasks.tap()
        }
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(NSPredicate(format: "label == %@", expectedTaskTitle)).firstMatch,
                in: app,
                timeout: 30,
                swipeAttempts: 12
            ),
            "Today must read back the exact actor-owned task created from the fully reviewed packet."
        )
        attachRuntimeScreenshot(app, name: "Reviewed packet canonical goal readback")
    }

    func testReviewedTranscriptPacketMergesIntoExactExistingNoteAndReturnsToSource() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false,
              credentials.transcriptSegmentIDs.count == 3,
              let expectedNoteSourceText = credentials.expectedPacketNoteSourceText,
              !expectedNoteSourceText.isEmpty,
              let expectedNoteLaneID = credentials.expectedPacketNoteLaneID,
              !expectedNoteLaneID.isEmpty,
              let noteID = credentials.noteID, !noteID.isEmpty,
              let sourceTitle = credentials.noteEditSourceTitle, !sourceTitle.isEmpty,
              let mergedTitle = credentials.noteEditUpdatedTitle, !mergedTitle.isEmpty,
              let sourceBody = credentials.noteEditSourceBody, !sourceBody.isEmpty,
              let mergedBody = credentials.noteEditUpdatedBody, !mergedBody.isEmpty,
              sourceTitle != mergedTitle,
              sourceBody != mergedBody,
              let expectedAssetID = credentials.recordingFixtureAssetID,
              !expectedAssetID.isEmpty else {
            throw XCTSkip("Reviewed packet merge requires exact Session, three-segment source, existing note, merged note, and recording-asset identities.")
        }

        var app = try launchSignedInCaptureApp(initialTab: "record")
        let fixtureReceipt = app.descendants(matching: .any)["CaptureRuntimePlaybackFixtureReceipt"].firstMatch
        XCTAssertTrue(
            fixtureReceipt.waitForExistence(timeout: 20),
            "The compiled app must install the checksum-verified retained source before merge review."
        )
        XCTAssertTrue(String(describing: fixtureReceipt.value ?? "").contains(expectedAssetID))

        selectRequestedSession(in: app, credentials: credentials)
        let reviewLink = app.descendants(matching: .any)["CaptureSessionTranscriptReviewLink_\(sessionID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reviewLink, in: app, timeout: 30, swipeAttempts: 8))
        reviewLink.tap()
        let review = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 30))
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].waitForExistence(timeout: 3),
            "The exact retained local source must make playback review available for an operated merge."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketLoadedBoundary"].firstMatch
                .waitForExistence(timeout: 30)
        )

        // Candidate queues can grow independently of the immutable transcript.
        // Use the person-facing jump control so this operation proves the exact
        // source stays directly reachable without relying on a swipe budget.
        for (reviewIndex, segmentID) in credentials.transcriptSegmentIDs.enumerated() {
            jumpToTranscript(in: app)
            let play = app.buttons["CaptureTranscriptPlayButton_\(segmentID)"].firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(play, in: app, timeout: 20, swipeAttempts: 12),
                "The complete merge source segment \(segmentID) must expose retained-source playback."
            )
            XCTAssertTrue(play.isEnabled)
            play.tap()

            let confirm = app.buttons["CaptureTranscriptConfirmAsIsButton_\(segmentID)"].firstMatch
            XCTAssertTrue(confirm.waitForExistence(timeout: 5))
            let playbackReachedSegmentEnd = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "enabled == true"),
                object: confirm
            )
            XCTAssertEqual(
                XCTWaiter.wait(for: [playbackReachedSegmentEnd], timeout: 15),
                .completed,
                "Playback must reach the exact segment end before merge evidence can be confirmed."
            )
            confirm.tap()
            let progress = app.staticTexts["CaptureTranscriptReviewProgressCount"].firstMatch
            let receiptReadBack = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "label BEGINSWITH %@", "\(reviewIndex + 1) of "),
                object: progress
            )
            XCTAssertEqual(
                XCTWaiter.wait(for: [receiptReadBack], timeout: 30),
                .completed,
                "Nest must read back each playback-verification receipt before merge."
            )
        }

        let buildCurrentPacket = app.buttons["CaptureTranscriptBuildCurrentPacketButton"].firstMatch
        for _ in 0..<16 where !buildCurrentPacket.exists {
            review.swipeDown()
        }
        XCTAssertTrue(buildCurrentPacket.waitForExistence(timeout: 10))
        XCTAssertTrue(buildCurrentPacket.isEnabled)
        buildCurrentPacket.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketStaleBoundary"].firstMatch
                .waitForNonExistence(timeout: 30),
            "The merge must use a packet snapshot built after complete source review."
        )

        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 10))
        jumpMenu.tap()
        let jumpToNotes = app.buttons["CaptureTranscriptJumpToNotes"].firstMatch
        XCTAssertTrue(jumpToNotes.waitForExistence(timeout: 10))
        jumpToNotes.tap()

        let sourcePrefix = "CapturePacketNoteSourceText_"
        let exactNoteSource = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@ AND identifier BEGINSWITH %@",
                expectedNoteSourceText,
                "\(sourcePrefix)\(expectedNoteLaneID)-"
            )
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(exactNoteSource, in: app, timeout: 20, swipeAttempts: 12),
            "The rebuilt packet must expose the exact complete-thought candidate selected for merge."
        )
        let candidateKey = String(exactNoteSource.identifier.dropFirst(sourcePrefix.count))
        XCTAssertFalse(candidateKey.isEmpty)

        let merge = app.buttons["CapturePacketNoteMergeButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(merge, in: app, timeout: 12, swipeAttempts: 8))
        XCTAssertTrue(merge.isEnabled)
        merge.tap()

        let targetPicker = app.descendants(matching: .any)["CapturePacketNoteMergeTargetPicker"].firstMatch
        XCTAssertTrue(targetPicker.waitForExistence(timeout: 8))
        targetPicker.tap()
        let targetChoice = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@ AND label CONTAINS %@", sourceTitle, "revision 1")
        ).firstMatch
        XCTAssertTrue(
            targetChoice.waitForExistence(timeout: 6),
            "The deliberate merge picker must expose the exact existing note and its revision count."
        )
        targetChoice.tap()

        let titleField = app.textFields["CapturePacketNoteTitleField"].firstMatch
        let bodyField = app.textFields["CapturePacketNoteBodyField"].firstMatch
        XCTAssertTrue(titleField.waitForExistence(timeout: 8))
        XCTAssertTrue(bodyField.waitForExistence(timeout: 8))
        XCTAssertEqual(titleField.value as? String, sourceTitle)
        let proposedCombinedBody = bodyField.value as? String ?? ""
        XCTAssertTrue(proposedCombinedBody.contains(sourceBody))
        XCTAssertGreaterThan(
            proposedCombinedBody.count,
            sourceBody.count,
            "Selecting a merge target should present the complete combined note for human review."
        )

        replaceText(in: titleField, with: mergedTitle, app: app)
        replaceText(in: bodyField, with: mergedBody, app: app)
        let keyboardDone = app.buttons["CapturePacketNoteKeyboardDone"].firstMatch
        if keyboardDone.waitForExistence(timeout: 3) {
            keyboardDone.tap()
        }
        let boundary = app.staticTexts["CapturePacketNoteBoundary"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(boundary, in: app, timeout: 8, swipeAttempts: 5))
        XCTAssertTrue(boundary.label.contains("Updates exactly one existing note"))
        XCTAssertTrue(boundary.label.contains("creates no task, goal, reminder, calendar event, message"))

        let saveMerge = app.buttons["CapturePacketCreateNoteButton_\(candidateKey)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(saveMerge, in: app, timeout: 8, swipeAttempts: 5))
        XCTAssertTrue(saveMerge.isEnabled)
        saveMerge.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePacketNoteSaved_\(candidateKey)"].firstMatch
                .waitForExistence(timeout: 30),
            "Nest must acknowledge the merge as one canonical Session-note revision."
        )
        XCTAssertTrue(
            app.staticTexts["Merged into one revisioned Session note"].firstMatch.exists,
            "The terminal candidate state must distinguish merge from new-note creation."
        )
        attachRuntimeScreenshot(app, name: "Reviewed transcript candidate merged into exact note")

        app.terminate()
        app = try launchSignedInCaptureApp(initialTab: "record")
        selectRequestedSession(in: app, credentials: credentials)
        let notesCard = app.descendants(matching: .any)["CaptureSessionNotesToggle"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(notesCard, in: app, timeout: 30, swipeAttempts: 12))
        notesCard.tap()
        let canonicalNote = app.descendants(matching: .any)["CaptureSessionNoteCanonical_\(noteID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(canonicalNote, in: app, timeout: 15, swipeAttempts: 10),
            "A fresh app launch must read back the same canonical note identity."
        )
        XCTAssertTrue(app.staticTexts[mergedTitle].firstMatch.exists)
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label == %@", mergedBody)).firstMatch.exists
        )
        let mergedSource = app.descendants(matching: .any)["CaptureSessionNoteMergedSourceLink_\(noteID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(mergedSource, in: app, timeout: 12, swipeAttempts: 10),
            "The revised note must expose a deliberate return to the latest merged transcript evidence."
        )
        mergedSource.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30))
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptSourceBoundary_\(credentials.transcriptSegmentIDs[0])"]
                .firstMatch.waitForExistence(timeout: 20),
            "Returning from the merged note must focus the exact first segment of the complete source span."
        )
        XCTAssertTrue(app.staticTexts["Opened from linked work"].firstMatch.exists)
        attachRuntimeScreenshot(app, name: "Merged note returned to exact transcript source")
    }

    func testReviewedTranscriptPacketAddsEvidenceToExactExistingGoalAndReturnsToSource() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false,
              credentials.transcriptSegmentIDs.count == 3,
              let expectedCandidateTitle = credentials.expectedPacketGoalTitle,
              !expectedCandidateTitle.isEmpty,
              let goalID = credentials.goalID, !goalID.isEmpty,
              let goalTitle = credentials.goalEditSourceTitle, !goalTitle.isEmpty,
              let expectedAssetID = credentials.recordingFixtureAssetID,
              !expectedAssetID.isEmpty else {
            throw XCTSkip("Reviewed goal-evidence merge requires exact Session, three-segment source, existing goal, and recording-asset identities.")
        }

        var app = try launchSignedInCaptureApp(initialTab: "record")
        let fixtureReceipt = app.descendants(matching: .any)["CaptureRuntimePlaybackFixtureReceipt"].firstMatch
        XCTAssertTrue(fixtureReceipt.waitForExistence(timeout: 20))
        XCTAssertTrue(String(describing: fixtureReceipt.value ?? "").contains(expectedAssetID))

        selectRequestedSession(in: app, credentials: credentials)
        let reviewLink = app.descendants(matching: .any)["CaptureSessionTranscriptReviewLink_\(sessionID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reviewLink, in: app, timeout: 30, swipeAttempts: 8))
        reviewLink.tap()
        let review = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 30))
        XCTAssertFalse(app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].waitForExistence(timeout: 3))
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketLoadedBoundary"].firstMatch
                .waitForExistence(timeout: 30)
        )

        for (reviewIndex, segmentID) in credentials.transcriptSegmentIDs.enumerated() {
            jumpToTranscript(in: app)
            let play = app.buttons["CaptureTranscriptPlayButton_\(segmentID)"].firstMatch
            XCTAssertTrue(waitForRuntimeElement(play, in: app, timeout: 20, swipeAttempts: 12))
            XCTAssertTrue(play.isEnabled)
            play.tap()
            let confirm = app.buttons["CaptureTranscriptConfirmAsIsButton_\(segmentID)"].firstMatch
            XCTAssertTrue(confirm.waitForExistence(timeout: 5))
            let playbackReachedSegmentEnd = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "enabled == true"),
                object: confirm
            )
            XCTAssertEqual(XCTWaiter.wait(for: [playbackReachedSegmentEnd], timeout: 15), .completed)
            confirm.tap()
            let progress = app.staticTexts["CaptureTranscriptReviewProgressCount"].firstMatch
            let receiptReadBack = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "label BEGINSWITH %@", "\(reviewIndex + 1) of "),
                object: progress
            )
            XCTAssertEqual(XCTWaiter.wait(for: [receiptReadBack], timeout: 30), .completed)
        }

        let buildCurrentPacket = app.buttons["CaptureTranscriptBuildCurrentPacketButton"].firstMatch
        for _ in 0..<16 where !buildCurrentPacket.exists { review.swipeDown() }
        XCTAssertTrue(buildCurrentPacket.waitForExistence(timeout: 10))
        XCTAssertTrue(buildCurrentPacket.isEnabled)
        buildCurrentPacket.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptPacketStaleBoundary"].firstMatch
                .waitForNonExistence(timeout: 30)
        )

        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 10))
        jumpMenu.tap()
        let jumpToGoals = app.buttons["CaptureTranscriptJumpToGoals"].firstMatch
        XCTAssertTrue(jumpToGoals.waitForExistence(timeout: 10))
        jumpToGoals.tap()
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(NSPredicate(format: "label == %@", expectedCandidateTitle)).firstMatch,
                in: app,
                timeout: 20,
                swipeAttempts: 10
            )
        )

        let beginMerge = app.buttons["CapturePacketGoalBeginMergeButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(beginMerge, in: app, timeout: 12, swipeAttempts: 8))
        XCTAssertTrue(beginMerge.isEnabled)
        beginMerge.tap()
        let picker = app.descendants(matching: .any)["CapturePacketGoalMergeTargetPicker"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 8))
        picker.tap()
        let targetChoice = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", goalTitle)
        ).firstMatch
        XCTAssertTrue(targetChoice.waitForExistence(timeout: 8))
        targetChoice.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePacketGoalMergeTargetSummary_\(goalID)"].firstMatch
                .waitForExistence(timeout: 8)
        )
        let merge = app.buttons["CapturePacketGoalMergeButton"].firstMatch
        XCTAssertTrue(merge.isEnabled)
        merge.tap()
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketGoalAccepted_")
            ).firstMatch.waitForExistence(timeout: 30)
        )
        XCTAssertTrue(app.staticTexts["Added as reviewed evidence to one existing goal"].firstMatch.exists)
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketGoalGovernance_")
            ).firstMatch.waitForExistence(timeout: 10),
            "The accepted goal candidate must expose its durable governed action receipt after server readback."
        )
        attachRuntimeScreenshot(app, name: "Reviewed transcript evidence added to exact existing goal")

        app.terminate()
        app = try launchSignedInCaptureApp(initialTab: "today")
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(NSPredicate(format: "label == %@", goalTitle)).firstMatch,
                in: app,
                timeout: 30,
                swipeAttempts: 14
            )
        )
        let mergedSource = app.descendants(matching: .any)["CaptureTodayGoalMergedSourceLink_\(goalID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(mergedSource, in: app, timeout: 15, swipeAttempts: 12),
            "Today must expose the latest appended evidence separately from the goal's numeric progress."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayGoalMergedSourceLinkGovernance_\(goalID)"]
                .firstMatch.waitForExistence(timeout: 10),
            "The reloaded Today goal must preserve its governed merge receipt."
        )
        mergedSource.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30))
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptSourceBoundary_\(credentials.transcriptSegmentIDs[0])"]
                .firstMatch.waitForExistence(timeout: 20)
        )
        XCTAssertTrue(app.staticTexts["Opened from linked work"].firstMatch.exists)
        attachRuntimeScreenshot(app, name: "Goal evidence returned to exact transcript source")
    }

    func testReviewedTranscriptPacketAddsEvidenceToExactExistingTaskAndReturnsToSource() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false,
              !credentials.transcriptSegmentIDs.isEmpty,
              let expectedCandidateTitle = credentials.expectedPacketTaskTitle,
              !expectedCandidateTitle.isEmpty,
              let taskID = credentials.taskID, !taskID.isEmpty,
              let taskTitle = credentials.taskEditSourceTitle, !taskTitle.isEmpty,
              let expectedAssetID = credentials.recordingFixtureAssetID,
              !expectedAssetID.isEmpty else {
            throw XCTSkip("Reviewed task-evidence merge requires exact Session, source span, existing task, and recording-asset identities.")
        }

        var app = try launchSignedInCaptureApp(initialTab: "record")
        let fixtureReceipt = app.descendants(matching: .any)["CaptureRuntimePlaybackFixtureReceipt"].firstMatch
        XCTAssertTrue(fixtureReceipt.waitForExistence(timeout: 20))
        XCTAssertTrue(String(describing: fixtureReceipt.value ?? "").contains(expectedAssetID))

        selectRequestedSession(in: app, credentials: credentials)
        let reviewLink = app.descendants(matching: .any)["CaptureSessionTranscriptReviewLink_\(sessionID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reviewLink, in: app, timeout: 30, swipeAttempts: 8))
        reviewLink.tap()
        let review = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        XCTAssertTrue(review.waitForExistence(timeout: 30))
        XCTAssertFalse(app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptPacketLoadedBoundary"].firstMatch.waitForExistence(timeout: 30))

        for (reviewIndex, segmentID) in credentials.transcriptSegmentIDs.enumerated() {
            jumpToTranscript(in: app)
            let play = app.buttons["CaptureTranscriptPlayButton_\(segmentID)"].firstMatch
            XCTAssertTrue(waitForRuntimeElement(play, in: app, timeout: 20, swipeAttempts: 12))
            XCTAssertTrue(play.isEnabled)
            play.tap()
            let confirm = app.buttons["CaptureTranscriptConfirmAsIsButton_\(segmentID)"].firstMatch
            XCTAssertTrue(confirm.waitForExistence(timeout: 5))
            let playbackReachedSegmentEnd = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "enabled == true"),
                object: confirm
            )
            XCTAssertEqual(XCTWaiter.wait(for: [playbackReachedSegmentEnd], timeout: 15), .completed)
            confirm.tap()
            let progress = app.staticTexts["CaptureTranscriptReviewProgressCount"].firstMatch
            let receiptReadBack = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "label BEGINSWITH %@", "\(reviewIndex + 1) of "),
                object: progress
            )
            XCTAssertEqual(XCTWaiter.wait(for: [receiptReadBack], timeout: 30), .completed)
        }

        let buildCurrentPacket = app.buttons["CaptureTranscriptBuildCurrentPacketButton"].firstMatch
        for _ in 0..<16 where !buildCurrentPacket.exists { review.swipeDown() }
        XCTAssertTrue(buildCurrentPacket.waitForExistence(timeout: 10))
        XCTAssertTrue(buildCurrentPacket.isEnabled)
        buildCurrentPacket.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptPacketStaleBoundary"].firstMatch.waitForNonExistence(timeout: 30))

        let jumpMenu = app.buttons["CaptureTranscriptJumpMenu"].firstMatch
        XCTAssertTrue(jumpMenu.waitForExistence(timeout: 10))
        jumpMenu.tap()
        let jumpToTasks = app.buttons["CaptureTranscriptJumpToTasks"].firstMatch
        XCTAssertTrue(jumpToTasks.waitForExistence(timeout: 10))
        jumpToTasks.tap()
        XCTAssertTrue(waitForRuntimeElement(
            app.staticTexts.matching(NSPredicate(format: "label == %@", expectedCandidateTitle)).firstMatch,
            in: app,
            timeout: 20,
            swipeAttempts: 10
        ))

        let beginMerge = app.buttons["CapturePacketTaskMergeModeButton"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(beginMerge, in: app, timeout: 12, swipeAttempts: 8))
        XCTAssertTrue(beginMerge.isEnabled)
        beginMerge.tap()
        let picker = app.descendants(matching: .any)["CapturePacketTaskMergeTargetPicker"].firstMatch
        XCTAssertTrue(picker.waitForExistence(timeout: 8))
        picker.tap()
        let targetChoice = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", taskTitle)
        ).firstMatch
        XCTAssertTrue(targetChoice.waitForExistence(timeout: 8))
        targetChoice.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketTaskMergeTargetSummary_\(taskID)"].firstMatch.waitForExistence(timeout: 8))
        let merge = app.buttons["CapturePacketTaskMergeButton"].firstMatch
        XCTAssertTrue(merge.isEnabled)
        merge.tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketTaskAccepted_")
        ).firstMatch.waitForExistence(timeout: 30))
        XCTAssertTrue(app.staticTexts["Added as reviewed evidence to one existing task"].firstMatch.exists)
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CapturePacketTaskGovernance_")
            ).firstMatch.waitForExistence(timeout: 10),
            "The accepted task candidate must expose its durable governed action receipt after server readback."
        )
        attachRuntimeScreenshot(app, name: "Reviewed transcript evidence added to exact existing task")

        app.terminate()
        app = try launchSignedInCaptureApp(initialTab: "today")
        XCTAssertTrue(waitForRuntimeElement(
            app.staticTexts.matching(NSPredicate(format: "label == %@", taskTitle)).firstMatch,
            in: app,
            timeout: 30,
            swipeAttempts: 14
        ))
        let mergedSource = app.descendants(matching: .any)["CaptureTodayTaskMergedEvidenceSource_\(taskID)"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(mergedSource, in: app, timeout: 15, swipeAttempts: 12))
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayTaskMergedEvidenceGovernance_\(taskID)"]
                .firstMatch.waitForExistence(timeout: 10),
            "The reloaded Today task must preserve its governed merge receipt."
        )
        mergedSource.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSourceBoundary_\(credentials.transcriptSegmentIDs[0])"].firstMatch.waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Opened from linked work"].firstMatch.exists)
        attachRuntimeScreenshot(app, name: "Task evidence returned to exact transcript source")
    }

    @MainActor
    func testOfflineTranscriptReviewQueuesSurvivesRelaunchReconcilesAndHoldsConflict() async throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              credentials.sessionTitle?.isEmpty == false,
              credentials.transcriptSegmentIDs.count == 2,
              let rawLocalRecordingID = credentials.recordingFixtureLocalID,
              !rawLocalRecordingID.isEmpty,
              let localRecordingID = UUID(uuidString: rawLocalRecordingID)?.uuidString,
              let expectedAssetID = credentials.recordingFixtureAssetID,
              !expectedAssetID.isEmpty,
              let phoneCorrectionText = credentials.transcriptPhoneCorrectionText,
              !phoneCorrectionText.isEmpty,
              let conflictCorrectionText = credentials.transcriptConflictCorrectionText,
              !conflictCorrectionText.isEmpty,
              phoneCorrectionText != conflictCorrectionText else {
            throw XCTSkip("Offline transcript reconciliation requires one exact Session, two segments, distinct correction text, and retained-source identities.")
        }
        let confirmationSegmentID = credentials.transcriptSegmentIDs[0]
        let correctionSegmentID = credentials.transcriptSegmentIDs[1]

        var app = try launchSignedInCaptureApp(initialTab: "record")
        let fixtureReceipt = app.descendants(matching: .any)["CaptureRuntimePlaybackFixtureReceipt"].firstMatch
        XCTAssertTrue(fixtureReceipt.waitForExistence(timeout: 20))
        XCTAssertTrue(String(describing: fixtureReceipt.value ?? "").contains(expectedAssetID))

        selectRequestedSession(in: app, credentials: credentials)
        let onlineReviewLink = app.descendants(matching: .any)[
            "CaptureSessionTranscriptReviewLink_\(sessionID)"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(onlineReviewLink, in: app, timeout: 45, swipeAttempts: 12),
            "The exact retained Session must open canonical transcript review before the network is removed."
        )
        onlineReviewLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 20))
        XCTAssertTrue(
            waitForRuntimeElement(
                app.buttons["CaptureTranscriptPlayButton_\(confirmationSegmentID)"].firstMatch,
                in: app,
                timeout: 30,
                swipeAttempts: 14
            ),
            "Online readback must materialize the exact transcript snapshot before offline review."
        )
        XCTAssertFalse(app.descendants(matching: .any)["CaptureTranscriptProtectedCacheBoundary"].exists)
        app.terminate()

        func launchProtectedOfflineApp() -> XCUIApplication {
            let offline = XCUIApplication()
            offline.launchEnvironment["QUIPSLY_API_BASE_URL"] = "http://127.0.0.1:9"
            offline.launchArguments.append("--quipsly-capture-runtime-smoke")
            offline.launch()
            return offline
        }

        func openOfflineReview(_ offline: XCUIApplication) -> Bool {
            guard offline.descendants(matching: .any)["CaptureOfflineAccessBanner"]
                .waitForExistence(timeout: 30) else {
                XCTFail("Removing Nest must enter the account-bound protected offline shell.")
                return false
            }
            let review = offline.descendants(matching: .any)[
                "CaptureOfflineTranscriptReviewLink_\(localRecordingID)"
            ].firstMatch
            guard review.waitForExistence(timeout: 15) else {
                XCTFail("Protected offline access must expose cached transcript review before the capture and follow-through feeds.")
                return false
            }
            let hittable = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "hittable == true AND enabled == true"),
                object: review
            )
            guard XCTWaiter.wait(for: [hittable], timeout: 10) == .completed else {
                XCTFail("Protected transcript review must be an immediately reachable, enabled continuation action.")
                return false
            }
            review.tap()
            guard offline.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 20) else {
                XCTFail("The protected transcript continuation must navigate into transcript review.")
                return false
            }
            guard offline.descendants(matching: .any)["CaptureTranscriptProtectedCacheBoundary"]
                .waitForExistence(timeout: 20) else {
                XCTFail("The offline review must identify protected cached transcript evidence.")
                return false
            }
            return true
        }

        app = launchProtectedOfflineApp()
        guard openOfflineReview(app) else { return }

        let speakerPlay = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTranscriptSpeakerPlay_")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(speakerPlay, in: app, timeout: 20, swipeAttempts: 10),
            "The protected offline snapshot must retain a representative provider-voice sample."
        )
        XCTAssertTrue(speakerPlay.isEnabled)
        speakerPlay.tap()
        let useSpeakerSample = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTranscriptSpeakerUseSample_")
        ).firstMatch
        let speakerSampleReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND enabled == true"),
            object: useSpeakerSample
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [speakerSampleReady], timeout: 20),
            .completed,
            "A voice sample becomes usable only after playback reaches its provider span."
        )
        useSpeakerSample.tap()
        let identifySpeaker = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTranscriptIdentifySpeaker_")
        ).firstMatch
        XCTAssertTrue(identifySpeaker.waitForExistence(timeout: 8))
        XCTAssertTrue(identifySpeaker.isEnabled)
        identifySpeaker.tap()
        XCTAssertTrue(
            app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTranscriptSpeakerPending_")
            ).firstMatch.waitForExistence(timeout: 8),
            "Offline voice identity must journal its participant, full provider-cluster snapshot, and playback receipt before reconnect."
        )

        let confirmationPlay = app.buttons[
            "CaptureTranscriptPlayButton_\(confirmationSegmentID)"
        ].firstMatch
        XCTAssertTrue(waitForRuntimeElement(confirmationPlay, in: app, timeout: 20, swipeAttempts: 14))
        XCTAssertTrue(confirmationPlay.isEnabled)
        confirmationPlay.tap()
        let queueConfirmation = app.buttons[
            "CaptureTranscriptConfirmAsIsButton_\(confirmationSegmentID)"
        ].firstMatch
        XCTAssertTrue(queueConfirmation.waitForExistence(timeout: 5))
        let confirmationReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: queueConfirmation
        )
        XCTAssertEqual(XCTWaiter.wait(for: [confirmationReady], timeout: 15), .completed)
        XCTAssertTrue(queueConfirmation.label.localizedCaseInsensitiveContains("queue"))
        queueConfirmation.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "CaptureTranscriptDecisionPending_\(confirmationSegmentID)"
            ].waitForExistence(timeout: 8)
        )

        let correctionPlay = app.buttons[
            "CaptureTranscriptPlayButton_\(correctionSegmentID)"
        ].firstMatch
        XCTAssertTrue(waitForRuntimeElement(correctionPlay, in: app, timeout: 20, swipeAttempts: 14))
        correctionPlay.tap()
        let correctionPlaybackReady = app.buttons[
            "CaptureTranscriptConfirmAsIsButton_\(correctionSegmentID)"
        ].firstMatch
        XCTAssertTrue(correctionPlaybackReady.waitForExistence(timeout: 5))
        let correctionReady = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: correctionPlaybackReady
        )
        XCTAssertEqual(XCTWaiter.wait(for: [correctionReady], timeout: 15), .completed)
        let correct = app.buttons["CaptureTranscriptCorrectButton_\(correctionSegmentID)"].firstMatch
        XCTAssertTrue(correct.waitForExistence(timeout: 5))
        correct.tap()
        replaceText(
            in: app.textFields["CaptureTranscriptCorrectWordsField"].firstMatch,
            with: phoneCorrectionText,
            app: app
        )
        let queueCorrection = app.buttons[
            "CaptureTranscriptAcceptCorrectionButton_\(correctionSegmentID)"
        ].firstMatch
        XCTAssertTrue(queueCorrection.waitForExistence(timeout: 8))
        XCTAssertTrue(queueCorrection.isEnabled)
        XCTAssertTrue(queueCorrection.label.localizedCaseInsensitiveContains("queue"))
        queueCorrection.tap()

        let queuedBoundary = app.descendants(matching: .any)[
            "CaptureTranscriptReviewOutboxBoundary"
        ].firstMatch
        guard queuedBoundary.waitForExistence(timeout: 8) else {
            XCTFail("The transcript toolbar must keep protected outbox status visible wherever review leaves the reader.")
            attachRuntimeScreenshot(app, name: "Offline transcript outbox status missing")
            return
        }
        XCTAssertEqual(queuedBoundary.value as? String, "Queued")
        XCTAssertTrue(queuedBoundary.label.contains("3 waiting"))
        attachRuntimeScreenshot(app, name: "Offline transcript and voice decisions protected before reconnect")
        app.terminate()

        app = launchProtectedOfflineApp()
        guard openOfflineReview(app) else { return }
        let recoveredBoundary = app.descendants(matching: .any)[
            "CaptureTranscriptReviewOutboxBoundary"
        ].firstMatch
        XCTAssertTrue(
            recoveredBoundary.waitForExistence(timeout: 10),
            "The voice identity and both transcript decisions must survive app process death."
        )
        XCTAssertEqual(recoveredBoundary.value as? String, "Queued")
        XCTAssertTrue(recoveredBoundary.label.contains("3 waiting"))

        try await injectConcurrentTranscriptCorrection(
            credentials: credentials,
            segmentID: correctionSegmentID,
            correctedText: conflictCorrectionText
        )
        app.terminate()

        app = try launchSignedInCaptureApp(initialTab: "record")
        selectRequestedSession(in: app, credentials: credentials)
        let reconnectedReviewLink = app.descendants(matching: .any)[
            "CaptureSessionTranscriptReviewLink_\(sessionID)"
        ].firstMatch
        XCTAssertTrue(waitForRuntimeElement(reconnectedReviewLink, in: app, timeout: 45, swipeAttempts: 12))
        reconnectedReviewLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 20))

        let heldBoundary = app.descendants(matching: .any)[
            "CaptureTranscriptReviewOutboxBoundary"
        ].firstMatch
        let heldReadback = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "Held"),
            object: heldBoundary
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [heldReadback], timeout: 60),
            .completed,
            "Reconnect must acknowledge the unchanged segment and hold the stale-overlay decision for review."
        )
        XCTAssertTrue(heldBoundary.label.contains("0 waiting"))
        XCTAssertTrue(heldBoundary.label.contains("1 held"))

        let verified = app.descendants(matching: .any)[
            "CaptureTranscriptVerifiedAsIs_\(confirmationSegmentID)"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(verified, in: app, timeout: 30, swipeAttempts: 14),
            "The non-conflicting offline decision must read back as one canonical playback verification."
        )
        let heldSegment = app.descendants(matching: .any)[
            "CaptureTranscriptDecisionPending_\(correctionSegmentID)"
        ].firstMatch
        XCTAssertTrue(waitForRuntimeElement(heldSegment, in: app, timeout: 20, swipeAttempts: 14))
        XCTAssertEqual(heldSegment.value as? String, "Held")
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label == %@", conflictCorrectionText))
                .firstMatch.waitForExistence(timeout: 8),
            "Canonical readback must show the concurrent reviewed overlay rather than phone text."
        )
        XCTAssertFalse(
            app.staticTexts.matching(NSPredicate(format: "label == %@", phoneCorrectionText))
                .firstMatch.exists,
            "A held phone decision must not overwrite canonical transcript truth."
        )
        attachRuntimeScreenshot(app, name: "Offline transcript reconciliation and stale-overlay hold")
    }

    func testOutsiderCannotSeeRetainedTranscriptFollowThrough() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty,
              let goalID = credentials.goalID, !goalID.isEmpty,
              let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty else {
            throw XCTSkip("The account-isolation journey requires exact Session, task, and goal identities.")
        }
        let app = try launchSignedInCaptureApp()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayFollowThroughEmpty"].waitForExistence(timeout: 30),
            "The outsider's canonical Today request should finish with an explicitly empty private workspace."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayTask_\(taskID)"].exists,
            "Another account must not see the retained transcript-derived task."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayGoal_\(goalID)"].exists,
            "Another account must not see the retained transcript-derived goal."
        )

        tapRootTab("Record", in: app)
        let sessionChooser = app.buttons["CaptureSessionChooser"].firstMatch
        XCTAssertTrue(sessionChooser.waitForExistence(timeout: 15))
        sessionChooser.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSessionPickerEmpty"].waitForExistence(timeout: 15),
            "The outsider's Session chooser should finish with no accessible Session rows."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionPicker_\(sessionID)"].exists,
            "Another account must not receive the private Session identity."
        )
        XCTAssertFalse(
            app.staticTexts[sessionTitle].firstMatch.exists,
            "Another account must not receive the private Session title."
        )
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

    func testCanonicalTaskFocusPlanPersistsThroughNestWithoutMutatingTask() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let taskID = credentials.taskID, !taskID.isEmpty else {
            throw XCTSkip("The focus-plan journey requires one exact open task ID.")
        }
        let app = try launchSignedInCaptureApp()
        let showMore = app.buttons["CaptureTodayShowMoreTasks"].firstMatch
        if waitForRuntimeElement(showMore, in: app, timeout: 12, swipeAttempts: 6) {
            showMore.tap()
        }

        let plan = app.buttons["CaptureTodayTaskPlanFocus_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(plan, in: app, timeout: 25, swipeAttempts: 12),
            "The exact canonical task should expose one deliberate focus-planning action."
        )
        XCTAssertTrue(plan.isEnabled)
        plan.tap()

        XCTAssertTrue(app.navigationBars["Plan focus"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTodayFocusPlanStart"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTodayFocusPlanDuration"].exists)
        XCTAssertTrue(app.staticTexts["Does not change the task deadline or status"].exists)
        XCTAssertTrue(app.staticTexts["Does not create a reminder or appointment"].exists)
        XCTAssertTrue(app.staticTexts["Does not write to Google or Apple Calendar"].exists)

        let save = app.buttons["CaptureTodayFocusPlanSave"].firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let planned = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureTodayFocusBlock_")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(planned, in: app, timeout: 35, swipeAttempts: 12),
            "Nest acknowledgement should project the same persisted block back into iPhone Today."
        )
        let plannedIdentifier = planned.identifier
        XCTAssertTrue(plannedIdentifier.hasPrefix("CaptureTodayFocusBlock_mobile-focus-create-"))
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayFocusPlanPending_\(taskID)"].exists,
            "An exact Nest acknowledgement must close the protected creation outbox."
        )
        XCTAssertTrue(
            app.buttons["CaptureTodayFocusDoneButton"].isEnabled,
            "A persisted plan should offer the separate explicit actual-time decision."
        )

        app.terminate()
        let relaunched = try launchSignedInCaptureApp()
        let persisted = relaunched.descendants(matching: .any)[plannedIdentifier].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(persisted, in: relaunched, timeout: 35, swipeAttempts: 12),
            "Relaunch should read the identical canonical focus block back from Nest."
        )
        XCTAssertTrue(relaunched.buttons["CaptureTodayFocusDoneButton"].isEnabled)
        XCTAssertFalse(
            relaunched.descendants(matching: .any)["CaptureTodayFocusPlanPending_\(taskID)"].exists
        )
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

    func testCanonicalSourceAnnotationStartsOnePrivateWritingDraft() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let annotationID = credentials.annotationID, !annotationID.isEmpty,
              let annotationBody = credentials.annotationBody, !annotationBody.isEmpty else {
            throw XCTSkip("The annotation-writing journey requires one exact accessible annotation ID and body.")
        }

        let app = try launchSignedInCaptureApp()
        let card = app.descendants(matching: .any)["CaptureTodayAnnotation_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(card, in: app, timeout: 30, swipeAttempts: 16),
            "Today should render the exact canonical source annotation before writing."
        )
        XCTAssertTrue(app.staticTexts[annotationBody].exists)
        let start = app.buttons["CaptureTodayAnnotationDraftStart_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(start, in: app, timeout: 12, swipeAttempts: 8),
            "A writable source annotation should expose one explicit private-draft decision."
        )
        XCTAssertTrue(start.isEnabled)
        start.tap()

        let open = app.descendants(matching: .any)["CaptureTodayAnnotationDraftOpen_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(open, in: app, timeout: 30, swipeAttempts: 16),
            "The exact Nest acknowledgement should replace Start with the durable private draft link."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayAnnotationDraftPending_\(annotationID)"].exists,
            "An acknowledged handoff must leave no pending phone decision."
        )
        XCTAssertFalse(start.exists, "The same annotation should not offer a second accidental one-tap draft.")

        app.terminate()
        let relaunched = try launchSignedInCaptureApp()
        let persisted = relaunched.descendants(matching: .any)["CaptureTodayAnnotationDraftOpen_\(annotationID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(persisted, in: relaunched, timeout: 30, swipeAttempts: 16),
            "Relaunch should project the same persisted citation-backed draft from Nest."
        )
        XCTAssertFalse(
            relaunched.buttons["CaptureTodayAnnotationDraftStart_\(annotationID)"].exists,
            "Canonical readback must keep the handoff idempotent after relaunch."
        )
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
            app.descendants(matching: .any)["CaptureSessionGuardian"].firstMatch.waitForExistence(timeout: 8),
            "Record should rank the most important Session, call, source, signal, and recovery intervention before a take."
        )
        XCTAssertTrue(
            app.buttons["CaptureStartButton"].firstMatch.exists,
            "The local recorder start control should have a stable accessibility identity."
        )

        let sessionTruth = app.buttons["CaptureSessionTruthDisclosure"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(sessionTruth, in: app, timeout: 8, swipeAttempts: 4),
            "Record should expose one calm expandable summary of source, lifecycle, and recording truth."
        )
        sessionTruth.tap()
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts["Journey"].firstMatch,
                in: app,
                timeout: 8,
                swipeAttempts: 3
            )
        )
        let recordingBoundaryCopy = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Joining, CallKit, consent, local recording, and server recording remain separate states")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(
                recordingBoundaryCopy,
                in: app,
                timeout: 8,
                swipeAttempts: 6
            ),
            "CallKit, room join, consent, local recording, and server recording should remain visibly separate."
        )
        sessionTruth.tap()

        let liveRoom = app.descendants(matching: .any)["CaptureLiveRoomDisclosure"].firstMatch
        XCTAssertTrue(
            scrollRuntimeElementIntoHittableView(liveRoom, in: app),
            "Provider-room controls should be subordinate to and reachable below the local recorder."
        )
        liveRoom.tap()
        XCTAssertTrue(waitForRuntimeElement(app.descendants(matching: .any)["CaptureProviderRoomBoundaryCopy"].firstMatch, in: app, timeout: 8, swipeAttempts: 2), "The live-room boundary copy and controls should be available on demand.")
        XCTAssertTrue(waitForRuntimeElement(app.buttons["ProviderJoinRoomButton"].firstMatch, in: app, timeout: 8, swipeAttempts: 2), "Joining a room must remain a distinct action from starting local recording.")
        XCTAssertTrue(waitForRuntimeElement(app.descendants(matching: .any)["CaptureSourceTruthFootnote"].firstMatch, in: app), "The selected-microphone source boundary should remain visible in the runtime path.")

        XCTAssertTrue(app.tabBars.buttons["Library"].firstMatch.exists)
        XCTAssertTrue(app.tabBars.buttons["Account"].firstMatch.exists)
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].firstMatch.exists, "A recording-in-progress banner must not appear before a take starts.")
    }

    func testAcceptedSessionLinkFocusesCanonicalRoomWithoutJoiningOrRecording() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty else {
            throw XCTSkip("Session deep-link proof requires one exact accessible Session ID and title.")
        }

        let app = try launchSignedInCaptureApp(
            initialTab: "record",
            sessionDeepLinkRoomID: sessionID
        )
        XCTAssertTrue(
            app.staticTexts[sessionTitle].firstMatch.waitForExistence(timeout: 30),
            "Capture should re-authorize and focus the exact canonical Session named by the inert app link."
        )
        let handoffBoundaryCopy = app.staticTexts.matching(
            NSPredicate(
                format: "label == %@",
                "Session opened from the private link. Review the audio route and consent, then explicitly join the live room or start a local source."
            )
        ).firstMatch
        XCTAssertTrue(
            handoffBoundaryCopy.waitForExistence(timeout: 15),
            "The native handoff should explain that join and recording remain deliberate actions."
        )
        XCTAssertFalse(
            app.otherElements["GlobalCaptureBanner"].exists,
            "Opening a Session link must never start or imply local recording."
        )
        XCTAssertFalse(
            app.buttons["CaptureStopButton"].exists,
            "Opening a Session link must not create recorder state."
        )
        XCTAssertFalse(
            app.buttons["ProviderLeaveRoomButton"].exists,
            "Opening a Session link must not join provider media."
        )
        attachRecordingIdentity(
            "\(sessionID)|\(sessionTitle)|focused|not-joined|not-recording",
            name: "Accepted Session link to native canonical room"
        )
    }

    func testIPhoneCreatesRetainedSessionAndReadsRecordingTruth() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionTitle = credentials.sessionTitle,
              sessionTitle.hasPrefix("QA Retained · ") else {
            throw XCTSkip("Retained Session truth requires one unique visibly retained Session title.")
        }
        var app = try launchSignedInCaptureApp()

        let newSession = app.buttons["New session"].firstMatch
        XCTAssertTrue(newSession.waitForExistence(timeout: 20))
        newSession.tap()
        XCTAssertTrue(app.navigationBars["New session"].waitForExistence(timeout: 6))

        let title = app.textFields["NewCaptureSessionTitleField"].firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 4))
        title.tap()
        title.typeText(sessionTitle)
        let create = app.buttons["NewCaptureSessionCreateButton"].firstMatch
        XCTAssertTrue(create.isEnabled)
        create.tap()

        XCTAssertTrue(
            app.staticTexts[sessionTitle].firstMatch.waitForExistence(timeout: 30),
            "The compiled app should select the exact retained Session it created."
        )
        XCTAssertTrue(app.navigationBars["New session"].waitForNonExistence(timeout: 8))
        let prepareSession = app.buttons["CaptureOpenNextSessionButton"].firstMatch
        XCTAssertTrue(
            prepareSession.waitForExistence(timeout: 8),
            "A newly created Session should become the explicit next Session to prepare."
        )
        XCTAssertTrue(prepareSession.isEnabled)
        XCTAssertTrue(prepareSession.isHittable)

        app.terminate()
        app = try launchSignedInCaptureApp(initialTab: "record")
        let authorityStatus = app.descendants(matching: .any)["CaptureSessionAuthorityStatus"].firstMatch
        let authorityDeadline = Date().addingTimeInterval(90)
        var authorityAbsentSince: Date?
        var authoritySettled = false
        while Date() < authorityDeadline {
            if authorityStatus.exists {
                authorityAbsentSince = nil
            } else if let authorityAbsentSince,
                      Date().timeIntervalSince(authorityAbsentSince) >= 2 {
                authoritySettled = true
                break
            } else if authorityAbsentSince == nil {
                authorityAbsentSince = Date()
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        XCTAssertTrue(
            authoritySettled,
            "Record should settle its protected Session snapshot against authoritative Nest before capture decisions continue."
        )
        if !app.staticTexts[sessionTitle].firstMatch.waitForExistence(timeout: 10) {
            let chooser = app.buttons["CaptureSessionChooser"].firstMatch
            XCTAssertTrue(chooser.waitForExistence(timeout: 8))
            chooser.tap()
            let retainedSession = app.buttons.matching(
                NSPredicate(format: "label CONTAINS %@", sessionTitle)
            ).firstMatch
            XCTAssertTrue(retainedSession.waitForExistence(timeout: 20))
            retainedSession.tap()
        }
        XCTAssertTrue(app.staticTexts[sessionTitle].firstMatch.waitForExistence(timeout: 8))
        XCTAssertTrue(
            waitForRuntimeElement(
                app.descendants(matching: .any)["CaptureConsentStrip"].firstMatch,
                in: app,
                timeout: 8,
                swipeAttempts: 2
            )
        )
        XCTAssertTrue(
            waitForRuntimeElement(
                app.descendants(matching: .any)["CaptureRecorderHero"].firstMatch,
                in: app,
                timeout: 8,
                swipeAttempts: 4
            )
        )
        XCTAssertTrue(
            waitForRuntimeElement(
                app.descendants(matching: .any)["CaptureSessionGuardian"].firstMatch,
                in: app,
                timeout: 8,
                swipeAttempts: 4
            ),
            "The retained Session should expose one calm operational Guardian before recording."
        )
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].firstMatch.exists)

        let sessionTruth = app.descendants(matching: .any)["CaptureSessionTruthDisclosure"].firstMatch
        XCTAssertTrue(
            sessionTruth.waitForExistence(timeout: 8),
            "The retained Session should expose its compact recording truth before the primary Record control."
        )
        let truthFrame = sessionTruth.frame
        let appFrame = app.frame
        XCTAssertFalse(truthFrame.isEmpty)
        app.coordinate(
            withNormalizedOffset: CGVector(
                dx: truthFrame.midX / appFrame.width,
                dy: truthFrame.midY / appFrame.height
            )
        ).tap()
        XCTAssertEqual(sessionTruth.value as? String, "Expanded")
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSessionTruthPanel"].firstMatch.waitForExistence(timeout: 8),
            "Session readiness should expose the actual truth panel, not satisfy assertions from a hidden tab subtree."
        )
        XCTAssertTrue(
            app.staticTexts["Journey"].firstMatch.waitForExistence(timeout: 8)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureRetainedSourceTruth"].firstMatch.waitForExistence(timeout: 8),
            "Session readiness should distinguish retained masters from prepared rooms and live tracks."
        )
        XCTAssertTrue(
            app.staticTexts["Retained source set"].firstMatch.waitForExistence(timeout: 8)
        )
        let recordingBoundaryCopy = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Joining, CallKit, consent, local recording, and server recording remain separate states")
        ).firstMatch
        XCTAssertTrue(recordingBoundaryCopy.waitForExistence(timeout: 8))
        let providerRecordingBoundary = app.staticTexts["CaptureProviderRecordingBoundary"].firstMatch
        for _ in 0..<8 where !providerRecordingBoundary.isHittable {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
                .press(
                    forDuration: 0.05,
                    thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.58))
                )
            RunLoop.current.run(until: Date().addingTimeInterval(0.35))
        }
        XCTAssertTrue(
            providerRecordingBoundary.isHittable,
            "Provider recording should remain a separate receipt-backed section after the readiness disclosure opens."
        )
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].firstMatch.exists)
    }

    func testAssignedCoachCreatesRevisesAndReleasesClientFollowUpInCapture() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let title = credentials.coachFollowUpTitle, !title.isEmpty,
              let intro = credentials.coachFollowUpIntro, !intro.isEmpty,
              let revisedIntro = credentials.coachFollowUpRevisedIntro, !revisedIntro.isEmpty,
              let nextSessionFocus = credentials.coachFollowUpNextSessionFocus,
              !nextSessionFocus.isEmpty else {
            throw XCTSkip("The coach follow-up journey requires exact Session and unique draft-copy identities.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let card = app.descendants(matching: .any)["CaptureCoachClientFollowUp"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(card, in: app, timeout: 45, swipeAttempts: 20),
            "The assigned coach should receive the canonical private follow-up workspace on the exact Session."
        )
        XCTAssertTrue(app.staticTexts["Assigned coach · canonical Nest state"].firstMatch.exists)
        card.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureCoachFollowUpReviewView"].waitForExistence(timeout: 8),
            "The private follow-up editor should open as a bounded workspace instead of expanding inside the recorder timeline."
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "never emails, texts, publishes, schedules, bills, changes consent")
            ).firstMatch.exists
        )

        let titleField = app.descendants(matching: .any)["CaptureCoachFollowUpTitle"].firstMatch
        replaceText(in: titleField, with: title, app: app)
        let introField = app.descendants(matching: .any)["CaptureCoachFollowUpIntro"].firstMatch
        replaceText(in: introField, with: intro, app: app)
        let focusField = app.descendants(matching: .any)["CaptureCoachFollowUpNextSession"].firstMatch
        replaceText(in: focusField, with: nextSessionFocus, app: app)

        let save = app.buttons["CaptureCoachFollowUpSave"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(save, in: app, timeout: 12, swipeAttempts: 12))
        XCTAssertTrue(save.isEnabled)
        save.tap()
        let revisionOne = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND identifier ENDSWITH %@",
                "CaptureClientFollowUpSnapshot_",
                "_r1"
            )
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(revisionOne, in: app, timeout: 40, swipeAttempts: 16),
            "Nest should return the exact immutable private revision 1 before any release is possible."
        )
        XCTAssertTrue(app.staticTexts[title].firstMatch.exists)
        XCTAssertTrue(app.staticTexts[intro].firstMatch.exists)

        let reloadedIntro = app.descendants(matching: .any)["CaptureCoachFollowUpIntro"].firstMatch
        replaceText(in: reloadedIntro, with: revisedIntro, app: app)
        let revise = app.buttons["CaptureCoachFollowUpSave"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(revise, in: app, timeout: 12, swipeAttempts: 12))
        XCTAssertTrue(revise.isEnabled)
        revise.tap()
        let revisionTwo = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "identifier BEGINSWITH %@ AND identifier ENDSWITH %@",
                "CaptureClientFollowUpSnapshot_",
                "_r2"
            )
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(revisionTwo, in: app, timeout: 40, swipeAttempts: 16),
            "A second save should return immutable private revision 2 instead of rewriting revision 1."
        )
        XCTAssertTrue(app.staticTexts[revisedIntro].firstMatch.exists)

        let confirmation = app.switches["CaptureCoachFollowUpReleaseConfirmation"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(confirmation, in: app, timeout: 15, swipeAttempts: 12))
        turnOn(confirmation, in: app)
        let release = app.buttons["CaptureCoachFollowUpRelease"].firstMatch
        XCTAssertTrue(waitForRuntimeElement(release, in: app, timeout: 8, swipeAttempts: 8))
        XCTAssertTrue(release.isEnabled)
        release.tap()

        let released = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Latest released server snapshot")
        ).firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(released, in: app, timeout: 40, swipeAttempts: 16),
            "The coach should read back the exact released server snapshot after the explicit confirmation."
        )
        XCTAssertFalse(app.buttons["CaptureCoachFollowUpRelease"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts[revisedIntro].firstMatch.exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "No email, message, calendar event, or publication occurred")
            ).firstMatch.exists
        )
        attachRecordingIdentity(
            "\(sessionID)|\(title)|revision-2|released-in-quipsly",
            name: "Retained iPhone coach follow-up authoring"
        )
    }

    func testReleasedClientFollowUpAppearsAndAcknowledgesInCapture() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let outputID = credentials.clientFollowUpID, !outputID.isEmpty,
              let outputTitle = credentials.clientFollowUpTitle, !outputTitle.isEmpty,
              let contentSHA256 = credentials.clientFollowUpSHA256,
              contentSHA256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
            throw XCTSkip("The client follow-up journey requires exact Session, released output, title, and SHA-256 identities.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let card = app.descendants(matching: .any)["CaptureClientFollowUp_\(outputID)"].firstMatch
        let sessionSyncStatus = app.descendants(matching: .any)["CaptureSessionSyncStatus"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(card, in: app, timeout: 40, swipeAttempts: 18),
            "The intended client should receive the exact released follow-up on the selected iPhone Session. Session sync: \(sessionSyncStatus.exists ? sessionSyncStatus.label : "unavailable")."
        )
        XCTAssertTrue(
            app.staticTexts[outputTitle].firstMatch.exists,
            "Capture should render the exact released follow-up title."
        )
        let hash = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", contentSHA256)
        ).firstMatch
        XCTAssertTrue(
            hash.exists,
            "Capture should render the exact content hash before accepting client readback."
        )
        XCTAssertFalse(app.staticTexts["RETAINED PRIVATE MARKER: never release this formulation."].exists)
        XCTAssertFalse(app.staticTexts["RETAINED SHARED MARKER: room visibility is not follow-up consent."].exists)
        XCTAssertFalse(app.staticTexts["RETAINED UNREVIEWED MARKER"].exists)

        let acknowledgeID = "CaptureClientFollowUpAcknowledge_\(outputID)"
        let acknowledge = app.buttons[acknowledgeID].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(acknowledge, in: app, timeout: 15, swipeAttempts: 6),
            "The intended client should receive an explicit in-app open confirmation control."
        )
        XCTAssertTrue(
            acknowledge.isEnabled,
            "This retained native proof requires a released follow-up without a prior open receipt."
        )
        acknowledge.tap()

        let confirmed = app.buttons[acknowledgeID].firstMatch
        let receipt = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label CONTAINS %@ AND enabled == false", "Open confirmed"),
            object: confirmed
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [receipt], timeout: 30),
            .completed,
            "Nest readback should replace the iPhone action with a disabled exact-content open receipt."
        )
        XCTAssertTrue(app.staticTexts["Run one protected rehearsal"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Use a sustainable boundary"].firstMatch.exists)
        attachRecordingIdentity(
            "\(sessionID)|\(outputID)|\(contentSHA256)",
            name: "Retained iPhone client follow-up readback"
        )
    }

    func testPriorCoachingContinuityProjectsIntoExactNextSession() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty else {
            throw XCTSkip("The coaching-continuity journey requires the exact next Session ID and title.")
        }
        let app = try launchSignedInCaptureApp()
        tapRootTab("Record", in: app)
        selectRequestedSession(in: app, credentials: credentials)

        let followThrough = app.descendants(matching: .any)["CapturePriorSessionFollowThrough"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(followThrough, in: app, timeout: 40, swipeAttempts: 18),
            "Capture should project the released client follow-up and current canonical work into the next coaching Session."
        )
        XCTAssertTrue(app.staticTexts["Run one protected rehearsal"].firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Use a sustainable boundary"].firstMatch.exists)
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts["Latest check-in 75%"].firstMatch,
                in: app,
                timeout: 12,
                swipeAttempts: 8
            ),
            "Capture should show the client's latest canonical goal progress in next-Session preparation."
        )
        XCTAssertTrue(
            app.staticTexts[
                "Evidence: I used the smaller boundary in one difficult conversation and recovered before overcommitting."
            ].firstMatch.exists,
            "Capture should preserve the client's evidence note with the progress receipt."
        )
        XCTAssertTrue(app.staticTexts["New check-in since release"].firstMatch.exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "no copied work")
            ).firstMatch.exists,
            "The native follow-through workspace should disclose its no-copy boundary."
        )

        let card = app.descendants(matching: .any)["CapturePriorSessionContinuity"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(card, in: app, timeout: 40, swipeAttempts: 18),
            "Capture should project the actor-private brief into the exact next coaching Session."
        )
        XCTAssertTrue(app.staticTexts["Retained coaching follow-up rehearsal"].firstMatch.exists)

        let disclosure = app.buttons["Review carried-forward brief"].firstMatch
        XCTAssertTrue(disclosure.waitForExistence(timeout: 8))
        disclosure.tap()
        XCTAssertTrue(
            waitForRuntimeElement(
                app.staticTexts.matching(
                    NSPredicate(format: "label CONTAINS %@", "Next-session continuity")
                ).firstMatch,
                in: app,
                timeout: 8,
                swipeAttempts: 4
            ),
            "The native projection should reveal the exact saved continuity body on deliberate review."
        )
        let boundary = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "current Session unchanged")
        ).firstMatch
        XCTAssertTrue(boundary.exists, "Capture should disclose the no-copy and no-mutation boundary.")

        let taskEvidence = app.buttons[
            "CapturePriorContinuityTaskEvidence_retained-coaching-continuity-task-20260803"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(taskEvidence, in: app, timeout: 12, swipeAttempts: 8),
            "The next-Session projection should expose the append-only transcript evidence attached to the canonical task."
        )
        XCTAssertTrue(app.staticTexts["Name the smallest repeatable boundary"].firstMatch.exists)
        XCTAssertTrue(
            app.staticTexts[
                "I can name the smallest repeatable boundary before the next Session."
            ].firstMatch.exists
        )
        taskEvidence.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptExactSourceMatch"].firstMatch.waitForExistence(timeout: 20),
            "Capture should resolve the carried-forward receipt as an exact transcript source, not a text-only citation."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "CaptureTranscriptSegment_retained-coaching-continuity-segment-20260803"
            ].firstMatch.waitForExistence(timeout: 12),
            "Capture should focus the exact retained transcript segment behind the task evidence."
        )
        let backToRecord = app.navigationBars.buttons.element(boundBy: 0)
        XCTAssertTrue(backToRecord.waitForExistence(timeout: 8))
        backToRecord.tap()

        let openSource = app.buttons["CapturePriorContinuityOpenSource"].firstMatch
        XCTAssertTrue(openSource.waitForExistence(timeout: 8))
        XCTAssertTrue(openSource.isEnabled)
        openSource.tap()
        XCTAssertTrue(
            app.staticTexts["Retained coaching follow-up rehearsal"].firstMatch.waitForExistence(timeout: 12),
            "Open source Session should switch Capture to the exact originating Session."
        )
        attachRecordingIdentity(
            "\(sessionID)|\(sessionTitle)|retained-coaching-follow-up-20260731",
            name: "Retained iPhone coaching continuity projection"
        )
    }

    func testExactSignedInAccountIdentityIsReadable() throws {
        let credentials = try runtimeSmokeCredentials()
        let app = try launchSignedInCaptureApp()
        let account = app.descendants(matching: .any)["CaptureSignedInShellAccount"].firstMatch
        XCTAssertTrue(account.waitForExistence(timeout: 8))
        XCTAssertTrue(
            String(describing: account.value ?? "")
                .localizedCaseInsensitiveContains(credentials.email),
            "Account must expose the exact authenticated email used by this operated journey."
        )
        attachRecordingIdentity(
            credentials.email,
            name: "Exact signed-in Capture account"
        )
    }

    func testClientOpensExactFollowThroughGoalInWork() throws {
        let credentials = try runtimeSmokeCredentials()
        guard let sessionID = credentials.sessionID, !sessionID.isEmpty,
              let sessionTitle = credentials.sessionTitle, !sessionTitle.isEmpty,
              let taskID = credentials.taskID, !taskID.isEmpty,
              let goalID = credentials.goalID, !goalID.isEmpty else {
            throw XCTSkip("The coaching follow-through Work journey requires exact Session, task, and goal identities.")
        }
        let app = try launchSignedInCaptureApp(initialTab: "record")
        selectRequestedSession(in: app, credentials: credentials)

        let taskButton = app.buttons["CaptureFollowThroughOpenTask_\(taskID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(taskButton, in: app, timeout: 40, swipeAttempts: 18),
            "The intended client should be able to open the exact released commitment in Work."
        )
        XCTAssertTrue(taskButton.isEnabled)

        let goalButton = app.buttons["CaptureFollowThroughOpenGoal_\(goalID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(goalButton, in: app, timeout: 20, swipeAttempts: 12),
            "The intended client should be able to open the exact released goal in Work."
        )
        XCTAssertTrue(goalButton.isEnabled)
        let recorder = app.scrollViews["CaptureRecorderView"].firstMatch
        for _ in 0..<12 where !goalButton.isHittable {
            recorder.swipeUp()
        }
        XCTAssertTrue(goalButton.isHittable, "The exact goal action should be physically reachable on iPhone.")
        goalButton.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureWorkView"].firstMatch.waitForExistence(timeout: 15),
            "The follow-through action should switch to the canonical Work surface."
        )
        let exactGoal = app.descendants(matching: .any)["CaptureWorkGoal_\(goalID)"].firstMatch
        XCTAssertTrue(
            exactGoal.waitForExistence(timeout: 30),
            "Work should load and reveal the exact goal identity, not a copied follow-up item."
        )
        let search = app.textFields["CaptureWorkSearchField"].firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 8))
        XCTAssertEqual(
            search.value as? String,
            "Use a sustainable boundary",
            "The Work handoff should narrow the canonical project to the selected goal."
        )
        XCTAssertTrue(app.staticTexts["75% · I used the smaller boundary in one difficult conversation and recovered before overcommitting."].firstMatch.exists)
        let checkIn = app.buttons["CaptureTodayGoalCheckIn_\(goalID)"].firstMatch
        XCTAssertTrue(checkIn.exists)
        XCTAssertTrue(checkIn.isEnabled, "The owning client should retain the standard canonical goal check-in control.")
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureWorkTask_\(taskID)"].firstMatch.exists,
            "The exact-title handoff should not leave unrelated Work rows in the focused result."
        )
        attachRecordingIdentity(
            "\(sessionID)|\(sessionTitle)|\(goalID)|75",
            name: "Retained client follow-through to exact Work goal"
        )
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

        var stop = app.buttons["CaptureStopButton"].firstMatch
        if !stop.waitForExistence(timeout: 8) {
            // A first-install permission transition can rebuild the root shell
            // while AVAudioRecorder keeps the take alive. Operate the same
            // global recovery banner a coach sees instead of assuming the
            // recorder detail view survived that system-owned transition.
            let activeCapture = app.buttons["GlobalCaptureBanner"].firstMatch
            XCTAssertTrue(
                activeCapture.waitForExistence(timeout: 8),
                "Starting a take should expose either recorder controls or the global active-capture recovery banner."
            )
            activeCapture.tap()
            stop = app.buttons["CaptureStopButton"].firstMatch
        }
        XCTAssertTrue(
            stop.waitForExistence(timeout: 8),
            "The actual AVAudioRecorder-backed take should start and remain operable after permission transitions."
        )
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

        let missingPlanReason = app.textFields.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureMissingPlannedSourceReason_")
        ).firstMatch
        let waiveMissingMaster = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureWaiveMissingPlannedSource_")
        ).firstMatch
        if waitForRuntimeElement(missingPlanReason, in: app, timeout: 30, swipeAttempts: 12) {
            XCTAssertTrue(
                waitForRuntimeElement(waiveMissingMaster, in: app, timeout: 8, swipeAttempts: 4),
                "A missing required master should expose the phone-only, reason-required recovery decision."
            )
            missingPlanReason.tap()
            missingPlanReason.typeText(
                "The interrupted take could not decode after process recovery; continue with the verified source."
            )
            expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: waiveMissingMaster)
            waitForExpectations(timeout: 8)
            waiveMissingMaster.tap()
            XCTAssertTrue(
                missingPlanReason.waitForNonExistence(timeout: 20),
                "The append-only waiver should refresh the exact Session source plan before Studio handoff."
            )
            let resolvedEvidence = app.descendants(matching: .any).matching(
                NSPredicate(format: "identifier BEGINSWITH %@", "CaptureResolvedEvidence_")
            ).firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(resolvedEvidence, in: app, timeout: 20, swipeAttempts: 6),
                "The phone should preserve the interrupted receipt and its reason as visible resolved evidence."
            )
        }

        let handoffCard = app.descendants(matching: .any)["CaptureStudioHandoffCard_\(sessionID)"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(handoffCard, in: app, timeout: 45, swipeAttempts: 10),
            "A server-verified recording should keep its Studio handoff state reachable beside the recorder."
        )
        let promotionStatusIdentifier = "CaptureStudioPromotionStatus_\(sessionID)"
        // SwiftUI can expose these controls as Button, Link, or Other across
        // runtimes. Their stable identifiers are the cross-version contract;
        // element-class guessing is not.
        let attachToStudio = app.descendants(matching: .any)[
            "CaptureAttachToStudioButton_\(sessionID)"
        ].firstMatch
        let openStudioReview = app.descendants(matching: .any)[
            "CaptureOpenStudioReviewLink_\(sessionID)"
        ].firstMatch
        let openStudioReviewByLabel = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", "Review in Studio")
        ).firstMatch

        if waitForRuntimeElement(attachToStudio, in: app, timeout: 20, swipeAttempts: 10) {
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
        } else {
            let reviewIsReachable = waitForRuntimeElement(
                openStudioReview,
                in: app,
                timeout: 4,
                swipeAttempts: 2
            ) || waitForRuntimeElement(
                openStudioReviewByLabel,
                in: app,
                timeout: 8,
                swipeAttempts: 6
            )
            XCTAssertTrue(
                reviewIsReachable,
                "The repaired source plan should expose either an attach action or an idempotent Studio review action."
            )
        }

        let promotionDeadline = Date().addingTimeInterval(45)
        var durableStudioHandoff = false
        while Date() < promotionDeadline {
            let promotionStatus = app.descendants(matching: .any)[promotionStatusIdentifier].firstMatch
            let normalizedStatus = promotionStatus.label.lowercased()
            if promotionStatus.exists
                && (normalizedStatus.contains("in studio") || normalizedStatus.contains("studio media ready"))
                && (openStudioReview.exists || openStudioReviewByLabel.exists) {
                durableStudioHandoff = true
                break
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        XCTAssertTrue(
            durableStudioHandoff,
            "Studio handoff should either attach now or read back an earlier idempotent attachment with the exact review action."
        )
    }

    func testPhysicalIPhoneSwitchesCamerasWithoutMergingSourceMovies() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip(
            "Camera-switch source proof requires real front and back iPhone cameras. "
                + "Simulator coverage must not claim physical lens or movie evidence."
        )
        #else
        let credentials = try runtimeSmokeCredentials()
        guard credentials.sessionID?.isEmpty == false,
              credentials.sessionTitle?.isEmpty == false else {
            throw XCTSkip(
                "Physical camera switching requires one exact fresh Session ID and title."
            )
        }

        let app = try launchSignedInCaptureApp(initialTab: "record")
        selectRequestedSession(in: app, credentials: credentials)

        let confirmConsent = app.buttons["CaptureConfirmConsentButton"].firstMatch
        if waitForRuntimeElement(
            confirmConsent,
            in: app,
            timeout: 6,
            swipeAttempts: 4
        ) {
            confirmConsent.tap()
            let consentSheet = app.descendants(matching: .any)[
                "CaptureConsentConfirmationSheet"
            ].firstMatch
            XCTAssertTrue(consentSheet.waitForExistence(timeout: 8))
            turnOn(app.switches["CaptureConsentRecordVideoToggle"], in: app)
            turnOn(
                app.switches["CaptureConsentAudibleParticipantsToggle"],
                in: app
            )
            let save = app.buttons["CaptureConsentSaveChoicesButton"]
            XCTAssertTrue(
                waitForRuntimeElement(save, in: app, timeout: 8, swipeAttempts: 5)
            )
            XCTAssertTrue(save.isEnabled)
            save.tap()
        }

        let recordingMode = app.segmentedControls[
            "CaptureRecordingModePicker"
        ].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(
                recordingMode,
                in: app,
                timeout: 10,
                swipeAttempts: 6
            )
        )
        recordingMode.buttons["Camera"].tap()

        tapRootTab("Library", in: app)
        let recordingsBefore = recordingIdentifiers(
            in: app,
            prefix: "LocalRecordingRow_"
        )
        tapRootTab("Record", in: app)

        let cameraPermission = addUIInterruptionMonitor(
            withDescription: "Physical camera permission"
        ) { alert in
            for label in ["Allow", "OK"] where alert.buttons[label].exists {
                alert.buttons[label].tap()
                return true
            }
            return false
        }
        defer { removeUIInterruptionMonitor(cameraPermission) }

        var prepare = app.buttons["CaptureVideoPrepareButton"].firstMatch
        XCTAssertTrue(
            waitForRuntimeElement(prepare, in: app, timeout: 10, swipeAttempts: 7)
        )
        prepare.tap()
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if springboard.alerts.firstMatch.waitForExistence(timeout: 5) {
            let allow = springboard.alerts.firstMatch.buttons["Allow"]
            XCTAssertTrue(allow.exists)
            allow.tap()
            app.activate()
        }
        var start = app.buttons["CaptureVideoStartButton"].firstMatch
        if !start.waitForExistence(timeout: 15) {
            prepare = app.buttons["CaptureVideoPrepareButton"].firstMatch
            XCTAssertTrue(
                waitForRuntimeElement(prepare, in: app, timeout: 8, swipeAttempts: 5)
            )
            prepare.tap()
            start = app.buttons["CaptureVideoStartButton"].firstMatch
        }
        XCTAssertTrue(start.waitForExistence(timeout: 20))
        XCTAssertTrue(start.isEnabled)
        start.tap()

        let flip = app.buttons["CaptureVideoSwitchCameraButton"].firstMatch
        XCTAssertTrue(
            flip.waitForExistence(timeout: 20),
            "The real front-camera movie should expose the explicit source-boundary switch."
        )
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        flip.tap()

        XCTAssertTrue(
            app.buttons["CaptureVideoSwitchCameraButton"].firstMatch
                .waitForExistence(timeout: 30),
            "The first movie should validate before the back camera begins another source in the same group."
        )
        XCTAssertTrue(
            app.segmentedControls["CaptureVideoCameraPicker"]
                .buttons["Back"].isSelected,
            "The second immutable movie should visibly use the back camera."
        )
        RunLoop.current.run(until: Date().addingTimeInterval(2))
        app.buttons["CaptureVideoStopButton"].firstMatch.tap()
        let savedState = app.staticTexts["CaptureVideoStateLabel"].firstMatch
        XCTAssertEqual(
            XCTWaiter.wait(
                for: [
                    XCTNSPredicateExpectation(
                        predicate: NSPredicate(
                            format: "label == %@",
                            "Video saved on this iPhone"
                        ),
                        object: savedState
                    )
                ],
                timeout: 30
            ),
            .completed,
            "The second immutable movie must finish validation before Library evidence is inspected."
        )

        tapRootTab("Library", in: app)
        let allRecordings = recordingIdentifiers(
            in: app,
            prefix: "LocalRecordingRow_"
        )
        let newRecordings = allRecordings.subtracting(recordingsBefore)
        XCTAssertEqual(
            newRecordings.count,
            2,
            "One lens switch must preserve two immutable movie rows, not rewrite one file."
        )

        var cameraLabels = Set<String>()
        var captureGroupIdentifiers = Set<String>()
        for rowIdentifier in newRecordings {
            let recordingID = rowIdentifier.replacingOccurrences(
                of: "LocalRecordingRow_",
                with: ""
            )
            let row = app.descendants(matching: .any)[rowIdentifier].firstMatch
            XCTAssertTrue(row.waitForExistence(timeout: 10))
            let profile = app.descendants(matching: .any)[
                "LocalRecordingRecordedVideoProfile_\(recordingID)"
            ].firstMatch
            XCTAssertTrue(profile.waitForExistence(timeout: 10))
            cameraLabels.insert(profile.label)

            let group = row.descendants(matching: .any).matching(
                NSPredicate(
                    format: "identifier BEGINSWITH %@",
                    "LocalRecordingCaptureGroup_"
                )
            ).firstMatch
            XCTAssertTrue(
                group.waitForExistence(timeout: 10),
                "Each lens source should expose its durable capture-group identity in its own Library row."
            )
            captureGroupIdentifiers.insert(group.identifier)
        }
        XCTAssertTrue(cameraLabels.contains { $0.contains("Front") })
        XCTAssertTrue(cameraLabels.contains { $0.contains("Back") })
        XCTAssertEqual(
            captureGroupIdentifiers.count,
            1,
            "Front and back camera movies must retain one capture-group identity."
        )
        attachRecordingIdentity(
            captureGroupIdentifiers.first ?? "missing-group",
            name: "Physical front-to-back camera switch capture group"
        )
        #endif
    }
}
