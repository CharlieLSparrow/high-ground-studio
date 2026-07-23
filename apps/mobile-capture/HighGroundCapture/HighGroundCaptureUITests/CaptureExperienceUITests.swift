import XCTest

final class CaptureExperienceUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--capture-ui-preview"]
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"].waitForExistence(timeout: 12),
            "The deterministic capture preview should launch without credentials or network access."
        )
    }

    func testCaptureFirstNavigationKeepsFourFocusedDestinations() {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))

        for tab in ["Today", "Record", "Library", "Account"] {
            XCTAssertTrue(tabBar.buttons[tab].exists, "Expected the \(tab) capture destination.")
        }

        XCTAssertEqual(tabBar.buttons.count, 4, "Capture should not expose editor, publishing, or diagnostics as primary iPhone destinations.")

        XCTAssertTrue(app.descendants(matching: .any)["CaptureNextSessionCard"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionListRow_preview-coaching-ready"].exists,
            "Today should not repeat the same next session in the Later session list."
        )
        XCTAssertTrue(app.buttons["New session"].exists)

        app.buttons["CaptureOpenNextSessionButton"].tap()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["CaptureStartButton"].isEnabled)
        let project = app.descendants(matching: .any)["CaptureSessionProject_preview-coaching-ready"]
        reveal(project)
        XCTAssertTrue(project.exists)
        XCTAssertTrue(project.label.contains("High Ground Odyssey"), "Record should show the canonical Session Nest, not an invented upload destination.")

        tabBar.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        tabBar.buttons["Account"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
    }

    func testRecordQuickCaptureMakesNoteTaskAndGoalImmediateWithoutFakingPreviewWrites() {
        app.tabBars.buttons["Record"].tap()
        let noteButton = app.buttons["CaptureQuickEntry_NOTE_preview-coaching-ready"]
        reveal(noteButton)
        XCTAssertTrue(noteButton.isHittable)
        XCTAssertTrue(app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"].exists)
        XCTAssertTrue(app.buttons["CaptureQuickEntry_GOAL_preview-coaching-ready"].exists)
        XCTAssertTrue(app.buttons["CaptureQuickEntry_SOURCE_preview-coaching-ready"].exists)

        noteButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].waitForExistence(timeout: 5))
        let body = app.textFields["CaptureQuickEntryBody"]
        XCTAssertTrue(body.exists)
        body.tap()
        body.typeText("Let the opening breathe before the first cut.")
        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let syncCard = app.descendants(matching: .any)["CaptureQuickEntrySyncCard"]
        XCTAssertTrue(syncCard.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].exists)
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists, "Preview must not invent a pending durable outbox record.")
    }

    func testRecordSourceCaptureTargetsPrivateInboxBeforeAnyResearchNest() {
        app.tabBars.buttons["Record"].tap()
        let sourceButton = app.buttons["CaptureQuickEntry_SOURCE_preview-coaching-ready"]
        reveal(sourceButton)
        XCTAssertTrue(sourceButton.isHittable)
        sourceButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_SOURCE"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Personal Inbox")).firstMatch.exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Not chosen yet")).firstMatch.exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "stays private and unfiled")).firstMatch.exists)
        let body = app.textFields["CaptureQuickEntryBody"]
        body.tap()
        body.typeText("https://example.com/high-ground-reference")
        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testQuickCaptureChoosesExistingCanonicalNestTags() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let productionTag = app.buttons["CaptureQuickEntryTag_preview-production"].firstMatch
        reveal(productionTag)
        XCTAssertTrue(productionTag.exists)
        XCTAssertEqual(productionTag.value as? String, "Not selected")
        productionTag.tap()
        XCTAssertEqual(productionTag.value as? String, "Selected")
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "same canonical tag")
        ).firstMatch.exists)

        let newTagField = app.textFields["CaptureQuickEntryNewTagField"]
        reveal(newTagField)
        XCTAssertTrue(newTagField.isHittable)
        newTagField.tap()
        newTagField.typeText("Product development")
        let addTag = app.buttons["CaptureQuickEntryNewTagAdd"]
        XCTAssertTrue(addTag.isEnabled)
        addTag.tap()
        XCTAssertTrue(app.buttons["Remove new tag Product development"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["New on sync"].exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "protected in the phone outbox")
        ).firstMatch.exists)
    }

    func testTaskQuickCaptureAuthorsAnExplicitRecurrenceWithoutImplyingAReminder() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Weekly production review")

        let repeatPicker = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceMode"].firstMatch
        reveal(repeatPicker)
        XCTAssertTrue(repeatPicker.exists)
        repeatPicker.tap()
        let fixed = app.buttons["Fixed schedule"].firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        fixed.tap()

        let firstDue = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceFirstDue"].firstMatch
        reveal(firstDue)
        XCTAssertTrue(firstDue.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryRecurrenceFrequency"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryRecurrenceInterval"].exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "three-occurrence planning horizon")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "does not schedule a reminder or provider calendar event")
        ).firstMatch.exists)

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testTodayUsesCanonicalFollowThroughWithoutImplyingExternalActions() {
        let card = app.descendants(matching: .any)["CaptureTodayFollowThroughCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        let complete = app.buttons["Block done"]
        XCTAssertTrue(complete.exists)
        XCTAssertFalse(complete.isEnabled, "Preview work must never call Nest or imply a real task/focus mutation.")

        let sourceLink = app.buttons["Task source: Return to 00:03–00:04"]
        reveal(sourceLink)
        XCTAssertTrue(sourceLink.isHittable, "A transcript-derived task should retain a one-action route back to its exact segment.")
        XCTAssertTrue(app.staticTexts["Proof-listen the coaching recap"].exists)
        XCTAssertTrue(app.staticTexts["Leave the client with one clear next move"].exists)
        let taskTags = app.descendants(matching: .any)["CaptureTodayTaskTags_preview-task"]
        reveal(taskTags)
        XCTAssertTrue(taskTags.exists)
        XCTAssertTrue(taskTags.label.contains("High Ground Odyssey"))
        XCTAssertTrue(taskTags.label.contains("Proof listen"))

        let transcriptReview = app.staticTexts["Transcript review"]
        reveal(transcriptReview)
        XCTAssertTrue(transcriptReview.exists)
        XCTAssertTrue(app.staticTexts["AI proposals stay outside transcript truth until you listen and decide."].exists)

        let researchCues = app.staticTexts["Research cues"]
        reveal(researchCues)
        XCTAssertTrue(researchCues.exists)

        let boundary = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Focus completion never completes its task or goal.")
        ).firstMatch
        reveal(boundary)
        XCTAssertTrue(boundary.exists)

        for _ in 0..<8 where !sourceLink.isHittable {
            app.swipeDown()
        }
        XCTAssertTrue(sourceLink.isHittable)
        sourceLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSourceBoundary_preview-segment"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptPreviewBoundary"].exists)
    }

    func testTodayShowsCanonicalRecurrenceWithoutEnablingPreviewMutation() {
        let recurrence = app.descendants(matching: .any)["CaptureTodayRecurrence_preview-series_preview-task"]
        reveal(recurrence)
        XCTAssertTrue(recurrence.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Every week at 09:00")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "America/Denver")).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "No reminder or provider event is implied")).firstMatch.exists)

        let menu = app.buttons["CaptureTodayRecurrenceMenu_preview-series"]
        XCTAssertTrue(menu.exists)
        XCTAssertFalse(menu.isEnabled, "Preview recurrence controls must remain inspectable without calling Nest or inventing a series mutation.")

        let skipMissed = app.buttons["CaptureTodaySkipMissed_preview-task"]
        reveal(skipMissed)
        XCTAssertTrue(skipMissed.exists, "An overdue next occurrence should expose an explicit missed-work decision instead of silently piling up or canceling itself.")
        XCTAssertFalse(skipMissed.isEnabled, "Preview must show the missed-occurrence UX without persisting a skip.")
        XCTAssertTrue(skipMissed.label.contains("Skip missed occurrence"))
    }

    func testTranscriptReviewKeepsPreviewAndAIBehindTruthBoundaries() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptPreviewBoundary"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].exists)
        let packetTaskAccept = app.buttons["CapturePacketTaskAcceptButton"]
        reveal(packetTaskAccept)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketTaskReviewSection"].exists)
        XCTAssertTrue(app.buttons["CapturePacketTaskSource_preview-segment"].exists)
        XCTAssertFalse(packetTaskAccept.isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketTaskDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketTaskRejectButton"].isEnabled)
        let editPacketTask = app.buttons["CapturePacketTaskEditButton"]
        XCTAssertTrue(editPacketTask.isEnabled, "Preview may inspect a packet task draft while every review mutation stays disabled.")
        editPacketTask.tap()
        XCTAssertTrue(app.textFields["CapturePacketTaskTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketTaskDetailField"].exists)
        XCTAssertFalse(app.buttons["CapturePacketTaskSaveDraftButton"].isEnabled)
        app.buttons["CapturePacketTaskCancelEditButton"].tap()

        let packetGoalAccept = app.buttons["CapturePacketGoalAcceptButton"]
        reveal(packetGoalAccept)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketGoalReviewSection"].exists)
        XCTAssertTrue(app.buttons["CapturePacketGoalSource_preview-segment"].exists)
        XCTAssertFalse(packetGoalAccept.isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketGoalDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketGoalRejectButton"].isEnabled)
        let editPacketGoal = app.buttons["CapturePacketGoalEditButton"]
        XCTAssertTrue(editPacketGoal.isEnabled, "Preview may inspect a packet goal draft while every review mutation stays disabled.")
        editPacketGoal.tap()
        XCTAssertTrue(app.textFields["CapturePacketGoalTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketGoalDescriptionField"].exists)
        XCTAssertFalse(app.buttons["CapturePacketGoalSaveDraftButton"].isEnabled)
        app.buttons["CapturePacketGoalCancelEditButton"].tap()

        let aiProposal = app.staticTexts["CaptureTranscriptAIProposal"]
        reveal(aiProposal)
        XCTAssertTrue(aiProposal.exists)
        XCTAssertTrue(app.staticTexts["AI proposal · not transcript truth"].exists)
        XCTAssertFalse(app.buttons["CaptureTranscriptAcceptAIButton"].isEnabled)
        XCTAssertFalse(app.buttons["CaptureTranscriptRejectAIButton"].isEnabled)
        XCTAssertTrue(app.staticTexts["Until accepted here, this proposal does not change the effective transcript."].exists)
        let correct = app.buttons["CaptureTranscriptCorrectButton_preview-segment"]
        XCTAssertTrue(correct.isEnabled, "Preview may inspect the editor while every save path remains disabled.")
        correct.tap()
        XCTAssertTrue(app.textFields["CaptureTranscriptCorrectSpeakerField"].exists)
        XCTAssertTrue(app.textFields["CaptureTranscriptCorrectWordsField"].exists)
        XCTAssertFalse(app.buttons["Accept reviewed correction"].isEnabled)
        let makeTask = app.buttons["CaptureTranscriptMakeTaskButton"]
        XCTAssertTrue(makeTask.isEnabled, "Preview may inspect explicit task capture without creating work.")
        makeTask.tap()
        XCTAssertTrue(app.textFields["CaptureTranscriptTaskTitleField"].exists)
        XCTAssertFalse(app.buttons["CaptureTranscriptCreateTaskButton"].isEnabled)
        app.buttons["Cancel"].tap()

        let makeGoal = app.buttons["CaptureTranscriptMakeGoalButton"]
        reveal(makeGoal)
        XCTAssertTrue(makeGoal.isEnabled, "Preview may inspect explicit goal capture without creating work.")
        makeGoal.tap()
        XCTAssertTrue(app.textFields["CaptureTranscriptGoalTitleField"].exists)
        XCTAssertFalse(app.buttons["CaptureTranscriptCreateGoalButton"].isEnabled)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "creates no task, target date, reminder, calendar event, message, or publication")).firstMatch.exists)
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testTodayKeepsTranscriptDerivedGoalLinkedToExactSource() {
        let sourceLink = app.buttons["CaptureTodayGoalSourceLink_preview-goal"]
        reveal(sourceLink)
        XCTAssertTrue(sourceLink.isHittable, "A transcript-derived goal should keep a one-action route back to its exact segment.")
        sourceLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSourceBoundary_preview-segment"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptPreviewBoundary"].exists)
    }

    func testTodayGoalCheckInRecordsEvidenceWithoutImplyingCompletion() {
        let checkIn = app.buttons["CaptureTodayGoalCheckIn_preview-goal"]
        reveal(checkIn)
        XCTAssertTrue(checkIn.isHittable)
        checkIn.tap()

        let progress = app.descendants(matching: .any)["CaptureTodayGoalProgressPicker_preview-goal"]
        let note = app.textFields["CaptureTodayGoalProgressNote_preview-goal"]
        let save = app.buttons["CaptureTodayGoalCheckInSave_preview-goal"]
        XCTAssertTrue(progress.waitForExistence(timeout: 5))
        XCTAssertTrue(note.exists)
        XCTAssertTrue(save.exists)
        XCTAssertFalse(save.isEnabled, "Preview goal check-ins must remain inspectable but must never write a fake progress receipt.")
        XCTAssertTrue(app.staticTexts["Reconnect to Nest to save. Preview and protected snapshots stay read-only."].exists)

        let boundary = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Goal check-ins record progress without changing goal status.")
        ).firstMatch
        reveal(boundary)
        XCTAssertTrue(boundary.exists)
    }

    func testConsentIsExplicitAndGatesStartRecording() {
        app.tabBars.buttons["Record"].tap()
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()

        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()

        let confirm = app.buttons["CaptureConfirmConsentButton"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))

        let start = app.buttons["CaptureStartButton"]
        XCTAssertTrue(start.exists)
        XCTAssertFalse(start.isEnabled, "Recording must remain disabled until explicit session consent is recorded.")

        confirm.tap()
        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))

        let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
        let transcribe = app.switches["CaptureConsentTranscriptionToggle"]
        let nearbyPeople = app.switches["CaptureConsentAudibleParticipantsToggle"]

        XCTAssertTrue(recordAudio.exists)
        XCTAssertTrue(transcribe.exists)
        XCTAssertTrue(nearbyPeople.exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureConsentVideoOffRow"].exists,
            "The explicit video-off row may bridge to different XCUI element types across SwiftUI runtimes."
        )
        XCTAssertEqual(transcribe.value as? String, "0", "Transcription must default off and require its own opt-in.")

        turnOn(recordAudio)
        XCTAssertEqual(
            app.switches["CaptureConsentTranscriptionToggle"].value as? String,
            "0",
            "Recording must remain independently grantable with transcription off."
        )

        let nearbyPeopleChoice = app.switches["CaptureConsentAudibleParticipantsToggle"]
        turnOn(nearbyPeopleChoice)

        // SwiftUI Form virtualizes rows after toggle updates on newer runtimes.
        // Re-query and reveal the action instead of retaining a stale snapshot.
        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        reveal(saveChoices)
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(saveChoices.isEnabled)
        saveChoices.tap()

        expectation(
            for: NSPredicate(format: "exists == false"),
            evaluatedWith: consentSheet
        )
        waitForExpectations(timeout: 5)
        let readyStart = app.buttons["CaptureStartButton"]
        expectation(
            for: NSPredicate(format: "enabled == true"),
            evaluatedWith: readyStart
        )
        waitForExpectations(timeout: 5)
        XCTAssertTrue(readyStart.isEnabled, "The local recorder should become available once explicit choices and nearby-person agreement are saved.")
        XCTAssertEqual(app.staticTexts["CaptureRecorderStateLabel"].label, "Consent ready · mic checks on tap")
    }

    func testNewSessionDoesNotImplyConsentOrStartRecording() {
        let newButton = app.buttons["New session"].firstMatch
        XCTAssertTrue(newButton.waitForExistence(timeout: 5))
        newButton.tap()

        let title = app.textFields["NewCaptureSessionTitleField"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.typeText("Field interview")

        let create = app.buttons["NewCaptureSessionCreateButton"]
        XCTAssertTrue(create.isEnabled)
        create.tap()

        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["CaptureConfirmConsentButton"].exists)
        XCTAssertFalse(app.buttons["CaptureStartButton"].isEnabled)
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].exists)
    }

    func testPrimaryRecordSurfacePassesAccessibilityAudit() throws {
        app.tabBars.buttons["Record"].tap()

        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testSessionPlanIsAvailableOnThePrimaryIPhoneRecorder() {
        app.tabBars.buttons["Record"].tap()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let disclosure = app.buttons["Session plan, Notes, goals & tasks"]
        XCTAssertTrue(disclosure.waitForExistence(timeout: 5))
        disclosure.tap()

        let panel = app.descendants(matching: .any)["CaptureSessionContextPanel"]
        XCTAssertTrue(panel.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Load Nest"].exists)
        XCTAssertTrue(app.buttons["Save Nest"].exists)
        XCTAssertTrue(app.staticTexts["Quick note"].exists)
        XCTAssertTrue(app.staticTexts["Goals"].exists)
        XCTAssertTrue(app.staticTexts["Tasks"].exists)
    }

    func testAccountCriticalActionsScrollClearOfTheTabBar() {
        app.tabBars.buttons["Account"].tap()

        let signOut = app.buttons["Sign out"]
        XCTAssertTrue(signOut.waitForExistence(timeout: 5))
        for _ in 0..<5 where !signOut.isHittable {
            app.swipeUp()
        }

        XCTAssertTrue(signOut.isHittable, "Account actions must scroll completely above the persistent capture tab bar.")
        XCTAssertTrue(app.buttons["Request account deletion"].isHittable)
    }

    private func reveal(_ element: XCUIElement) {
        let visibleBottom = app.frame.maxY - 96
        if element.exists,
           element.isHittable,
           element.frame.minY >= app.frame.minY + 72,
           element.frame.maxY <= visibleBottom {
            return
        }
        for _ in 0..<8 {
            if element.exists, element.frame.maxY <= app.frame.minY + 72 {
                app.swipeDown()
            } else {
                app.swipeUp()
            }
            if element.exists,
               element.isHittable,
               element.frame.minY >= app.frame.minY + 72,
               element.frame.maxY <= visibleBottom {
                return
            }
        }
    }

    private func turnOn(_ toggle: XCUIElement) {
        reveal(toggle)
        guard toggle.value as? String != "1" else { return }
        // Hit the trailing control itself. SwiftUI's multiline Toggle label can
        // otherwise absorb a synthetic center tap on newer Simulator runtimes.
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        expectation(
            for: NSPredicate(format: "value == %@", "1"),
            evaluatedWith: toggle
        )
        waitForExpectations(timeout: 3)
    }
}

final class CaptureLoginExperienceUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = [
            "--capture-login-ui-preview",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["QuipslyCaptureLoginView"].waitForExistence(timeout: 12),
            "The deterministic native login surface should launch without credentials or network access."
        )
    }

    func testLoginOffersRecoveryAndSameEmailGooglePathAtAccessibilityTextSize() {
        XCTAssertTrue(app.textFields["QuipslyCaptureEmailField"].exists)
        XCTAssertTrue(app.secureTextFields["QuipslyCapturePasswordField"].exists)
        XCTAssertTrue(app.buttons["QuipslyCaptureSignInButton"].exists)

        reveal(app.buttons["QuipslyCapturePasswordResetButton"])
        XCTAssertTrue(app.buttons["QuipslyCapturePasswordResetButton"].exists)

        reveal(app.descendants(matching: .any)["QuipslyCaptureGoogleAccountGuidance"])
        XCTAssertTrue(app.descendants(matching: .any)["QuipslyCaptureGoogleAccountGuidance"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["QuipslyCaptureGoogleWebSignInLink"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["QuipslyCaptureAccountSupportLink"].exists)
    }

    func testCreateAccountRequiresMatchingEightCharacterPassword() {
        let createMode = app.buttons["QuipslyCaptureCreateAccountModeButton"]
        reveal(createMode, swipingDownFirst: true)
        XCTAssertTrue(createMode.exists)
        createMode.tap()

        let email = app.textFields["QuipslyCaptureEmailField"]
        let password = app.secureTextFields["QuipslyCapturePasswordField"]
        let confirmation = app.secureTextFields["QuipslyCapturePasswordConfirmationField"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 5))

        reveal(email, swipingDownFirst: true)
        email.tap()
        email.typeText("capture.tester@example.com\n")
        password.typeText("correct horse\n")
        confirmation.typeText("correct horse")

        let createAccount = app.buttons["QuipslyCaptureCreateAccountButton"]
        reveal(createAccount)
        XCTAssertTrue(createAccount.isEnabled, "Creation should become available only after the email and matching 8+ character passwords are present.")
    }

    private func reveal(_ element: XCUIElement, swipingDownFirst: Bool = false) {
        if element.exists, element.isHittable { return }
        if swipingDownFirst { app.swipeDown() }
        for _ in 0..<4 where !element.isHittable {
            app.swipeUp()
        }
    }
}

final class ShareCaptureExtensionUITests: XCTestCase {
    private var captureApp: XCUIApplication!

    private func navigateSafari(_ safari: XCUIApplication, to url: String, expectedHost: String) {
        let address = safari.textFields["Address"].firstMatch
        XCTAssertTrue(address.waitForExistence(timeout: 5), safari.debugDescription)
        address.tap()
        address.typeText("\(url)\n")
        let loadedAddress = safari.textFields.matching(
            NSPredicate(format: "label == %@ AND value CONTAINS[c] %@", "Address", expectedHost)
        ).firstMatch
        XCTAssertTrue(loadedAddress.waitForExistence(timeout: 12), safari.debugDescription)
    }

    override func setUpWithError() throws {
        continueAfterFailure = false

        // Launching the containing app first makes XCTest install the exact app
        // bundle (and embedded extension) produced by this build. This preview
        // does not publish a signed-in owner, which lets the test prove the
        // extension's account boundary without credentials or network access.
        captureApp = XCUIApplication()
        captureApp.launchArguments = ["--capture-ui-preview", "--capture-share-owner-ui-preview=none"]
        captureApp.launch()
        XCTAssertTrue(captureApp.descendants(matching: .any)["CapturePreviewModeBadge"].waitForExistence(timeout: 12))

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        if safari.navigationBars["SLSheetRootView"].exists, safari.buttons["Cancel"].exists {
            safari.buttons["Cancel"].tap()
        }
        let dismissShareSheet = safari.otherElements["PopoverDismissRegion"]
        if dismissShareSheet.exists { dismissShareSheet.tap() }
        captureApp.activate()

        addTeardownBlock { [captureApp] in
            captureApp?.terminate()
            captureApp?.launchArguments = ["--capture-ui-preview", "--capture-share-owner-ui-preview=none"]
            captureApp?.launch()
            captureApp?.terminate()
        }
    }

    func testSafariShareSheetSurfacesQuipslyButKeepsPostingLockedWithoutVerifiedAccount() {
        captureApp.terminate()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        navigateSafari(safari, to: "https://www.iana.org/", expectedHost: "iana.org")

        let share = safari.buttons.matching(
            NSPredicate(format: "label ==[c] %@ OR identifier == %@", "Share", "ShareButton")
        ).firstMatch
        if !share.waitForExistence(timeout: 3) {
            let more = safari.buttons["More"]
            XCTAssertTrue(more.waitForExistence(timeout: 5), safari.debugDescription)
            more.tap()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 10), safari.debugDescription)
        share.tap()

        let quipslyActivity = safari.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS[c] %@", "Quipsly")
        ).firstMatch
        XCTAssertTrue(
            quipslyActivity.waitForExistence(timeout: 10),
            "The installed share extension should be offered for a Safari web URL.\n\(safari.debugDescription)"
        )
        quipslyActivity.tap()

        let destination = safari.staticTexts["Open Quipsly to sign in"]
        XCTAssertTrue(
            destination.waitForExistence(timeout: 10),
            "The Share Sheet must disclose that a verified Quipsly account is required.\n\(safari.debugDescription)"
        )

        let post = safari.buttons["Post"]
        XCTAssertTrue(post.exists)
        XCTAssertFalse(post.isEnabled, "An unsigned Share Sheet must not stage or sync a private Inbox source.")
        safari.buttons["Cancel"].tap()
        let dismissShareSheet = safari.otherElements["PopoverDismissRegion"]
        if dismissShareSheet.waitForExistence(timeout: 3) { dismissShareSheet.tap() }
    }

    func testSignedInSimulatorShareSurvivesRelaunchAndOwnerSwitchInProtectedSourceOutbox() {
        let ownerID = "share-ui-test-\(UUID().uuidString.lowercased())"
        let ownerArgument = "--capture-share-owner-ui-preview=\(ownerID)"

        captureApp.terminate()
        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument]
        captureApp.launch()
        XCTAssertTrue(captureApp.descendants(matching: .any)["CapturePreviewModeBadge"].waitForExistence(timeout: 12))
        captureApp.terminate()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        navigateSafari(safari, to: "https://www.iana.org/", expectedHost: "iana.org")

        let share = safari.buttons.matching(
            NSPredicate(format: "label ==[c] %@ OR identifier == %@", "Share", "ShareButton")
        ).firstMatch
        if !share.waitForExistence(timeout: 3) {
            let more = safari.buttons["More"]
            XCTAssertTrue(more.waitForExistence(timeout: 5), safari.debugDescription)
            more.tap()
        }
        XCTAssertTrue(share.waitForExistence(timeout: 10), safari.debugDescription)
        share.tap()

        let quipslyActivity = safari.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS[c] %@", "Quipsly")
        ).firstMatch
        XCTAssertTrue(quipslyActivity.waitForExistence(timeout: 10), safari.debugDescription)
        quipslyActivity.tap()

        XCTAssertTrue(safari.staticTexts["Private Inbox · unfiled"].waitForExistence(timeout: 10), safari.debugDescription)
        XCTAssertTrue(safari.staticTexts["Web link"].waitForExistence(timeout: 10), "A normal Safari page share should remain a URL capture rather than inventing selected text.\n\(safari.debugDescription)")
        let post = safari.buttons["Post"]
        XCTAssertTrue(post.exists)
        XCTAssertTrue(post.isEnabled, "A verified simulator owner should be able to stage this URL without network access.")
        post.tap()

        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument, "--capture-ui-preview-tab=record"]
        captureApp.launch()
        XCTAssertTrue(captureApp.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertTrue(captureApp.descendants(matching: .any)["CaptureQuickEntrySyncCard"].waitForExistence(timeout: 10))
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Imported 1 protected Share Sheet source")
        ).firstMatch.exists)
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "iana.org")
        ).firstMatch.exists, "The exact Safari URL should remain visible in the protected source outbox.")
        XCTAssertTrue(captureApp.staticTexts["Saved on iPhone · waiting for Nest"].exists)

        // Process death must not turn a local-save receipt into wishful sync.
        // Relaunch the exact bundle with network actions still disabled and
        // verify that the protected ledger—not transient view state—restores it.
        captureApp.terminate()
        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument, "--capture-ui-preview-tab=record"]
        captureApp.launch()
        XCTAssertTrue(captureApp.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertTrue(captureApp.staticTexts["1 quick capture waiting"].waitForExistence(timeout: 8))
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "iana.org")
        ).firstMatch.exists, "The same URL must recover after terminating and relaunching Capture.")
        XCTAssertTrue(captureApp.staticTexts["Saved on iPhone · waiting for Nest"].exists)
        let retry = captureApp.buttons.matching(
            NSPredicate(format: "identifier == %@ OR label CONTAINS[c] %@", "CaptureQuickEntryRetry", "Retry protected captures")
        ).firstMatch
        for _ in 0..<8 where !retry.exists { captureApp.swipeUp() }
        XCTAssertTrue(retry.exists, "Recovered pending evidence should retain its explicit retry control.")

        // The ledger may hold several owners, but the rendered queue is always
        // partitioned by the currently verified account snapshot.
        let otherOwnerArgument = "--capture-share-owner-ui-preview=other-\(UUID().uuidString.lowercased())"
        captureApp.terminate()
        captureApp.launchArguments = ["--capture-ui-preview", otherOwnerArgument, "--capture-ui-preview-tab=record"]
        captureApp.launch()
        XCTAssertTrue(captureApp.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertFalse(captureApp.staticTexts["1 quick capture waiting"].exists)
        XCTAssertFalse(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "iana.org")
        ).firstMatch.exists, "A different verified owner must not see the first owner's protected URL.")
        XCTAssertFalse(captureApp.staticTexts["Saved on iPhone · waiting for Nest"].exists)
        XCTAssertFalse(captureApp.buttons["CaptureQuickEntryRetry"].exists)

        // Returning to the original verified owner reveals the same pending
        // identity again; the other account neither consumed nor copied it.
        captureApp.terminate()
        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument, "--capture-ui-preview-tab=record"]
        captureApp.launch()
        XCTAssertTrue(captureApp.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertTrue(captureApp.staticTexts["1 quick capture waiting"].waitForExistence(timeout: 8))
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "iana.org")
        ).firstMatch.exists)
        XCTAssertTrue(captureApp.staticTexts["Saved on iPhone · waiting for Nest"].exists)
    }

    func testSignedInSimulatorSelectedPassageStagesTextWithWebpageProvenance() {
        let ownerID = "passage-ui-test-\(UUID().uuidString.lowercased())"
        let ownerArgument = "--capture-share-owner-ui-preview=\(ownerID)"

        captureApp.terminate()
        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument]
        captureApp.launch()
        XCTAssertTrue(captureApp.descendants(matching: .any)["CapturePreviewModeBadge"].waitForExistence(timeout: 12))
        captureApp.terminate()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.activate()
        navigateSafari(safari, to: "https://example.com/", expectedHost: "example.com")

        let passage = safari.staticTexts["Example Domain"].firstMatch
        XCTAssertTrue(
            passage.waitForExistence(timeout: 10),
            "The deterministic example.com page must be visible before selecting a passage.\n\(safari.debugDescription)"
        )
        passage.press(forDuration: 1.2)

        // Safari's contextual Share action exports only public.plain-text. Use
        // the page Share control while the selection remains active so Safari
        // also runs the extension's documented webpage preprocessor.
        let more = safari.buttons["More"].firstMatch
        XCTAssertTrue(more.waitForExistence(timeout: 5), safari.debugDescription)
        more.tap()
        let pageShare = safari.buttons.matching(
            NSPredicate(format: "label ==[c] %@ OR identifier == %@", "Share", "ShareButton")
        ).firstMatch
        XCTAssertTrue(pageShare.waitForExistence(timeout: 8), safari.debugDescription)
        pageShare.tap()

        let quipslyActivity = safari.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS[c] %@", "Quipsly")
        ).firstMatch
        XCTAssertTrue(quipslyActivity.waitForExistence(timeout: 10), safari.debugDescription)
        quipslyActivity.tap()

        XCTAssertTrue(safari.staticTexts["Private Inbox · unfiled"].waitForExistence(timeout: 10), safari.debugDescription)
        XCTAssertTrue(
            safari.staticTexts["Passage + webpage"].waitForExistence(timeout: 10),
            "A Safari selection must retain both the selected passage and the webpage URL.\n\(safari.debugDescription)"
        )
        let post = safari.buttons["Post"]
        XCTAssertTrue(post.exists)
        XCTAssertTrue(post.isEnabled)
        post.tap()

        captureApp.launchArguments = ["--capture-ui-preview", ownerArgument, "--capture-ui-preview-tab=record"]
        captureApp.launch()
        XCTAssertTrue(captureApp.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertTrue(captureApp.descendants(matching: .any)["CaptureQuickEntrySyncCard"].waitForExistence(timeout: 10))
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Imported 1 protected Share Sheet source")
        ).firstMatch.exists)
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "Example Domain")
        ).firstMatch.exists, "The selected passage must remain visible in the protected source outbox.")
        XCTAssertTrue(captureApp.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "example.com")
        ).firstMatch.exists, "The selected passage must keep its source webpage URL.")
        XCTAssertTrue(captureApp.staticTexts["Saved on iPhone · waiting for Nest"].exists)
    }
}
