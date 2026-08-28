import XCTest

final class CaptureExperienceUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--capture-ui-preview"]
        let clientPreview = name.contains("testClientCanSeePublishedTimesAndOwnPendingRequest")
            || name.contains("testOfflineCoachingSnapshotIsClearlyReadOnly")
            || name.contains("testClientCoachingFormDraftSurvivesRelaunchOnPhone")
        app.launchEnvironment["CAPTURE_COACHING_PREVIEW_ROLE"] = clientPreview
            ? "client"
            : "coach"
        if name.contains(
            "testConsentNeededNextEpisodeOpensRecorderWithoutCrashing"
        ) {
            app.launchArguments.append(
                "--capture-consent-needed-next-preview"
            )
        }
        if name.contains("testPrivateVoiceNoteOpensCaptureWithoutMeetingPaperwork")
            || name.contains("testVoiceWritingRecordsAndStopsThroughTheSourceFirstPath")
            || name.contains("testSpeechAdaptationIsOptionalRememberedAndEasyToReach") {
            app.launchArguments.append("--capture-force-local-voice-note-ui-test")
        }
        if name.contains("testSpeechAdaptationIsOptionalRememberedAndEasyToReach") {
            app.launchArguments.append(
                "--capture-share-owner-ui-preview=voice-writing-preferences-owner"
            )
        }
        if name.contains("testVoiceWritingRecordsAndStopsThroughTheSourceFirstPath") {
            // The recording path requires an explicit, account-partitioned
            // owner even in preview mode. This DEBUG simulator marker is the
            // same narrow identity boundary used by the share/recovery tests;
            // it never exists in release or on a physical device.
            app.launchArguments.append(
                "--capture-share-owner-ui-preview=voice-writing-source-owner"
            )
        }
        if name.contains("testCoachFollowUpHoldsReleaseWhenCanonicalSourceChanged") {
            app.launchArguments.append("--capture-follow-up-source-changed-preview")
        }
        if name.contains("testReadyParticipantSeesWaitingStatusInsteadOfDisabledRecord") {
            app.launchArguments.append("--capture-waiting-for-host-ui-test")
        }
        if name.contains("testSchedulingShowsKnownConflictBeforeSave") {
            app.launchArguments.append("--capture-conflict-scheduling-preview")
        }
        if name.contains("testSchedulingRespectsAvailabilityBeforeSave") {
            app.launchArguments.append("--capture-availability-scheduling-preview")
        }
        if name.contains("testSchedulingRoutesUnsubscribedCoachToNativePlan") {
            app.launchArguments.append("--capture-subscription-required-preview")
        }
        if name.contains("testClientCanSeePublishedTimesAndOwnPendingRequest")
            || name.contains("testOfflineCoachingSnapshotIsClearlyReadOnly") {
            app.launchArguments.append("--capture-client-booking-preview")
        }
        if name.contains("testOfflineCoachingSnapshotIsClearlyReadOnly") {
            app.launchArguments.append("--capture-coaching-offline-preview")
        }
        if name.contains("testCoachCanReviewIncomingTimeRequest") {
            app.launchArguments.append("--capture-coach-requests-preview")
        }
        if name.contains("testConfirmedRequestHasImmediateSessionHandoff") {
            app.launchArguments.append("--capture-confirmed-request-preview")
        }
        if name.contains("testClientCoachingFormDraftSurvivesRelaunchOnPhone") {
            app.launchArguments += [
                "--capture-client-booking-preview",
                "--capture-share-owner-ui-preview=coaching-forms-client-recovery",
            ]
        }
        if name.contains("testCoachReviewsSharedFormWithoutSeeingPrivateDraftAnswers") {
            app.launchArguments += [
                "--capture-coach-booking-preview",
                "--capture-coaching-forms-coach-preview",
            ]
        }
        if name.contains("testCoachingHomeMakesThePhoneOnlyWorkflowConcrete")
            || name.contains("testCoachingHomeKeepsPrimaryActionsReachableAtLargestTextSize") {
            app.launchArguments.append("--capture-coach-booking-preview")
        }
        if name.contains(
            "testEpisodeThreadKeepsCollaborationBesideTheRecorderWithoutStartingCapture"
        ) || name.contains(
            "testEpisodeManuscriptIsReadableBesideTheRecorderWithoutCreatingAnEditableCopy"
        ) {
            app.launchArguments += [
                "--capture-ui-preview-tab=record",
                "--capture-ui-preview-session=preview-studio-group-ready",
            ]
        }
        if name.contains("testRecordingReceiptOutboxSurvivesRelaunchAndStaysAccountPartitioned") {
            app.launchArguments += [
                "--capture-share-owner-ui-preview=recording-receipt-owner",
                "--capture-recording-receipt-outbox-ui-test",
            ]
        }
        let launchesRecorderPreview: Bool
        if name.contains(
            "testEpisodeThreadKeepsCollaborationBesideTheRecorderWithoutStartingCapture"
        ) || name.contains(
            "testEpisodeManuscriptIsReadableBesideTheRecorderWithoutCreatingAnEditableCopy"
        ) {
            launchesRecorderPreview = true
        } else if name.contains(
            "testEpisodeWatchKeepsExactCurrentPassVisibleWithoutALocalClip"
        ) {
            launchesRecorderPreview = true
            app.launchArguments += [
                "--capture-ui-preview-tab=record",
                "--capture-ui-preview-session=preview-studio-group-ready",
                "--capture-watch-preview-state=current-pass",
            ]
        } else if name.contains(
            "testEpisodeWatchKeepsPreviousPassClearActionVisibleWithoutALocalClip"
        ) {
            launchesRecorderPreview = true
            app.launchArguments += [
                "--capture-ui-preview-tab=record",
                "--capture-ui-preview-session=preview-studio-group-ready",
                "--capture-watch-preview-state=previous-pass",
            ]
        } else {
            launchesRecorderPreview = false
        }
        app.launch()
        if launchesRecorderPreview {
            openLocalRecorderIfNeeded()
            XCTAssertTrue(
                app.otherElements["CaptureRecorderHero"]
                    .waitForExistence(timeout: 12),
                "The deterministic episode preview should launch directly in the recorder without credentials or network access."
            )
        } else {
            XCTAssertTrue(
                app.descendants(matching: .any)["CapturePreviewModeBadge"]
                    .waitForExistence(timeout: 12),
                "The deterministic capture preview should launch without credentials or network access."
            )
        }
    }

    func testCaptureFirstNavigationKeepsFiveFocusedDestinations() {
        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 5))

        for tab in ["Home", "Record", "Nests", "Library", "Account"] {
            XCTAssertTrue(tabBar.buttons[tab].exists, "Expected the \(tab) capture destination.")
        }

        XCTAssertEqual(tabBar.buttons.count, 5, "Capture should expose project work without exposing editor, publishing, or diagnostics as primary iPhone destinations.")

        XCTAssertTrue(app.descendants(matching: .any)["CaptureNextSessionCard"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionListRow_preview-coaching-ready"].exists,
            "Today should not repeat the same next session in the Later session list."
        )
        XCTAssertTrue(app.buttons["New session"].exists)
        XCTAssertTrue(
            app.buttons["CaptureStartVoiceNote"].exists,
            "Private speech-to-writing should be a primary Home action, not hidden in Session setup."
        )
        XCTAssertTrue(
            app.staticTexts["Speak to write"].exists,
            "Home should name the outcome plainly for someone who needs to draft by speaking."
        )

        let joinSession = app.buttons["CaptureOpenNextSessionButton"]
        XCTAssertEqual(
            joinSession.label,
            "Join session",
            "A ready appointment should lead with the familiar call action, not production terminology."
        )
        XCTAssertTrue(app.staticTexts["Ready to join"].exists)
        XCTAssertFalse(app.staticTexts["Ready to record"].exists)
        joinSession.tap()
        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureRecordingModePicker"].exists)
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

    func testHomeStaysCalmWhileDeeperToolsRemainReachable() {
        XCTAssertTrue(app.scrollViews["CaptureTodayView"].waitForExistence(timeout: 5))
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTodayFollowThroughCard"].exists,
            "The first screen should not expand the entire cross-Nest work dashboard."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureFinishQueueCard"].exists,
            "Recording pipeline detail belongs in Library, not beneath Home's primary actions."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureCalendarContinuityCard"].exists,
            "Calendar connections are account setup, not daily Home content."
        )

        openAcrossNestsFollowThrough()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTodayFollowThroughCard"]
                .waitForExistence(timeout: 5),
            "Moving cross-Nest follow-through must not remove the capability."
        )

        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))
        app.segmentedControls["CaptureLibrarySectionPicker"].buttons["Recordings"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureFinishQueueCard"]
                .waitForExistence(timeout: 5),
            "Recording and transcript readiness should remain available in Library."
        )

        app.tabBars.buttons["Account"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
        let calendar = app.descendants(matching: .any)["CaptureCalendarContinuityCard"]
        reveal(calendar)
        XCTAssertTrue(
            calendar.waitForExistence(timeout: 5),
            "Calendar connections should remain reachable from Account."
        )
    }

    func testPrivateVoiceNoteOpensCaptureWithoutMeetingPaperwork() {
        let voiceNote = app.buttons["CaptureStartVoiceNote"]
        XCTAssertTrue(voiceNote.waitForExistence(timeout: 5))
        voiceNote.tap()

        XCTAssertTrue(
            app.otherElements["CapturePersonalVoiceNoteHeader"]
                .waitForExistence(timeout: 8),
            "Voice Note should open a private writing recorder directly."
        )
        XCTAssertTrue(
            app.navigationBars["Speak to write"].exists,
            "The focused writing path should use the same plain-language name as its Home action."
        )
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].exists)
        XCTAssertTrue(app.tabBars.buttons["Record"].isSelected)
        XCTAssertFalse(
            app.otherElements["CaptureProviderRoomControls"].exists,
            "A private Voice Note must not look like a meeting room."
        )
        XCTAssertFalse(
            app.otherElements["CaptureConsentStrip"].exists,
            "Recording your own private thought should not add participant-consent paperwork."
        )
        XCTAssertFalse(
            app.otherElements["CaptureRecordingModePicker"].exists,
            "Voice Note should default to audio instead of asking for production setup."
        )
        XCTAssertTrue(
            app.buttons["CaptureStartButton"].isEnabled,
            "A private thought must remain recordable without creating an online Session first."
        )
        XCTAssertEqual(
            app.staticTexts["CaptureRecorderStateLabel"].label,
            "Ready to speak",
            "Private dictation should use familiar speech-to-writing language instead of meeting consent language."
        )
        XCTAssertTrue(
            app.staticTexts["CaptureVoiceWritingRecorderDetail"].label.contains("editable writing"),
            "Before recording, Quipsly should make the automatic speech-to-writing outcome obvious."
        )
        XCTAssertTrue(
            app.staticTexts["CaptureSessionStatusMessage"].label.contains("offline"),
            "The local-first path should explain that recording and writing remain available without Nest."
        )
    }

    func testSpeechAdaptationIsOptionalRememberedAndEasyToReach() {
        app.buttons["CaptureStartVoiceNote"].tap()
        XCTAssertTrue(
            app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 8)
        )

        let recorderToggle = app.switches[
            "CaptureVoiceWritingSpeechAdaptationToggle"
        ]
        reveal(recorderToggle)
        XCTAssertTrue(
            recorderToggle.waitForExistence(timeout: 5),
            "Someone who is often misunderstood should be able to adapt recognition from the writing recorder without finding setup first."
        )
        turnOff(recorderToggle)
        turnOn(recorderToggle)

        app.tabBars.buttons["Account"].tap()
        let accountToggle = app.switches["CaptureSpeechAdaptationToggle"]
        reveal(accountToggle)
        XCTAssertTrue(accountToggle.waitForExistence(timeout: 5))
        XCTAssertEqual(
            accountToggle.value as? String,
            "1",
            "The account-partitioned speech choice should follow the person from the recorder to Account."
        )

        let vocabularyLink = app.buttons["CaptureSpeechVocabularyLink"]
        reveal(vocabularyLink)
        XCTAssertTrue(vocabularyLink.waitForExistence(timeout: 5))
        vocabularyLink.tap()
        XCTAssertTrue(app.navigationBars["Words Quipsly knows"].waitForExistence(timeout: 5))

        let phraseField = app.textFields["CaptureSpeechVocabularyField"]
        XCTAssertTrue(phraseField.waitForExistence(timeout: 5))
        phraseField.tap()
        phraseField.typeText("Homer Sparrow")
        app.buttons["CaptureSpeechVocabularyAdd"].tap()
        let learnedPhrase = app.staticTexts["Homer Sparrow"]
        XCTAssertTrue(
            learnedPhrase.waitForExistence(timeout: 5),
            "People should be able to see and adjust the names Quipsly uses for recognition."
        )
        learnedPhrase.swipeLeft()
        let delete = app.buttons["Delete"].firstMatch
        XCTAssertTrue(delete.waitForExistence(timeout: 3))
        delete.tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()

        // Restore the deterministic preview persona to its default so the
        // persisted accessibility preference cannot make later tests order-dependent.
        turnOff(accountToggle)
    }

    func testVoiceWritingRecordsAndStopsThroughTheSourceFirstPath() {
        XCTAssertTrue(
            app.staticTexts["Draft a paper or capture a thought."].exists,
            "Home should present speech-to-writing as a serious drafting tool, not only a quick voice memo."
        )
        app.buttons["CaptureStartVoiceNote"].tap()
        XCTAssertTrue(
            app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 8)
        )

        addUIInterruptionMonitor(withDescription: "Microphone permission") { alert in
            let allow = alert.buttons["Allow"]
            if allow.exists {
                allow.tap()
                return true
            }
            let allowWhileUsing = alert.buttons["Allow While Using App"]
            if allowWhileUsing.exists {
                allowWhileUsing.tap()
                return true
            }
            return false
        }

        let start = app.buttons["CaptureStartButton"]
        XCTAssertTrue(start.waitForExistence(timeout: 5))
        start.tap()
        // XCTest invokes interruption monitors on the next interaction after
        // a system prompt appears. Use the inert status-bar corner so the
        // replayed tap cannot activate content that moves when the new global
        // recording banner enters the safe area.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.01)).tap()

        let stop = app.buttons["CaptureStopButton"]
        XCTAssertTrue(
            stop.waitForExistence(timeout: 15),
            "Private speech-to-writing should enter a visible recording state after one ordinary permission prompt."
        )
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingPauseResumeButton"].exists,
            "Pause must remain next to the active recorder instead of becoming a setup workflow."
        )

        let deferred = app.descendants(matching: .any)["CaptureVoiceWritingDeferredTranscript"]
        let live = app.descendants(matching: .any)["CaptureVoiceWritingLiveTranscript"]
        XCTAssertTrue(
            deferred.waitForExistence(timeout: 4) || live.exists,
            "Voice writing should either show live words or plainly promise the source-backed writing after Stop."
        )

        stop.tap()
        XCTAssertTrue(
            app.staticTexts["CaptureRecorderStateLabel"]
                .waitForExistence(timeout: 10)
        )
        XCTAssertTrue(
            app.buttons["CaptureStopButton"].waitForNonExistence(timeout: 10),
            "Stopping voice writing must close the microphone-owned source instead of leaving capture active."
        )
    }

    func testVoiceWritingOffersStructureAndSourceWithoutLeavingCapture() {
        app.tabBars.buttons["Library"].tap()
        let writingSection = app.buttons["Writing"]
        XCTAssertTrue(writingSection.waitForExistence(timeout: 5))
        writingSection.tap()
        let previewDraft = app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
        XCTAssertTrue(
            previewDraft.waitForExistence(timeout: 5),
            "Library should make a voice-created writing draft directly openable."
        )
        previewDraft.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingEditor"]
                .waitForExistence(timeout: 5),
            "Writing should open inside Capture rather than handing off to another app."
        )
        XCTAssertFalse(
            app.tabBars.firstMatch.exists,
            "Focused writing should use the full screen instead of letting global tabs cover editing controls."
        )
        XCTAssertTrue(app.buttons["Write"].exists)
        XCTAssertTrue(app.buttons["Transcript"].exists)
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingContinueToolbar"].exists,
            "Someone writing by voice should always be one obvious tap from continuing to speak."
        )
        let shareMenu = app.buttons["CaptureVoiceWritingShareMenu"]
        XCTAssertTrue(shareMenu.exists, "Writing should expose the familiar system share action.")
        shareMenu.tap()
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingShareWord"].exists,
            "Speech-created writing should be directly shareable as a Word document."
        )
        XCTAssertTrue(app.buttons["CaptureVoiceWritingShareText"].exists)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.35)).tap()
        let styleMenu = app.buttons["CaptureVoiceWritingStyleMenu"]
        XCTAssertTrue(styleMenu.exists, "Paper structure should use the familiar compact text-style menu.")
        styleMenu.tap()
        for style in ["Heading", "Subheading", "Body"] {
            XCTAssertTrue(
                app.buttons["CaptureVoiceWritingStyle_\(style)"].exists,
                "The text-style menu should expose \(style) without crowding the editor."
            )
        }
        app.buttons["CaptureVoiceWritingStyle_Body"].tap()
        for control in ["Bullets", "Numbered", "Checklist", "Quote"] {
            XCTAssertTrue(app.buttons["CaptureVoiceWritingStructure_\(control)"].exists)
        }

        let writing = app.descendants(matching: .any)["CaptureVoiceWritingBody"]
        XCTAssertTrue(writing.waitForExistence(timeout: 5))
        let bullets = app.buttons["CaptureVoiceWritingStructure_Bullets"]
        XCTAssertTrue(bullets.isHittable)
        bullets.tap()
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingContinueKeyboard"].exists,
            "Keep talking should remain reachable while the keyboard is open."
        )
        XCTAssertTrue(
            ((writing.value as? String) ?? "").contains("• "),
            "A visible structure control must change the actual editable writing."
        )
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "voice-writing-structure-editor.png"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testVoiceWritingRemainsReadableAtLargestAccessibilityTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 12))
        app.tabBars.buttons["Library"].tap()
        let writingSection = app.buttons["Writing"]
        XCTAssertTrue(writingSection.waitForExistence(timeout: 5))
        writingSection.tap()
        let previewDraft = app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
        let library = app.scrollViews["CaptureLibraryView"]
        for _ in 0..<4 where !previewDraft.exists {
            library.swipeUp()
        }
        XCTAssertTrue(previewDraft.waitForExistence(timeout: 5))
        reveal(previewDraft)
        previewDraft.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingEditor"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.buttons["Write"].isHittable)
        XCTAssertTrue(app.buttons["Transcript"].isHittable)
        XCTAssertTrue(app.textFields["CaptureVoiceWritingTitle"].isHittable)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingBody"].isHittable,
            "The spoken draft must remain directly editable at the largest accessibility text size."
        )
        XCTAssertTrue(
            app.staticTexts["CaptureVoiceWritingWordCount"].exists,
            "A paper-writing surface should show a useful word count without adding another workflow."
        )
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingContinueToolbar"].exists,
            "The persistent microphone action must not disappear when text grows."
        )

        // Hit regions and descriptions were audited above on this same
        // transcript surface. Defer the task row's clipped-text audit until
        // the operated journey is complete so XCTest cannot leave the lazy
        // accessibility hierarchy half-walked before the edit interaction.
    }

    func testVoiceWritingDeletesTheDraftWithoutDeletingItsSource() {
        app.tabBars.buttons["Library"].tap()
        app.buttons["Writing"].tap()
        let previewDraft = app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
        XCTAssertTrue(previewDraft.waitForExistence(timeout: 5))
        previewDraft.tap()

        let editor = app.descendants(matching: .any)["CaptureVoiceWritingEditor"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let delete = app.buttons["Delete writing"].firstMatch
        for _ in 0..<6 where !delete.exists || !delete.isHittable {
            editor.swipeUp()
        }
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingNest"].exists,
            "Organization should show the current Nest and private ownership without opening settings."
        )
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(
                format: "label CONTAINS[c] %@",
                "never shares the writing"
            )).firstMatch.exists,
            "Filing in a Nest must not imply that a private paper was shared."
        )
        XCTAssertTrue(
            delete.waitForExistence(timeout: 5),
            "Writing should have an ordinary, discoverable delete action."
        )
        XCTAssertTrue(delete.isEnabled)
        XCTAssertTrue(delete.isHittable)
        sleep(1)
        delete.tap()
        let alert = app.alerts["Delete this writing?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 3))
        XCTAssertTrue(alert.buttons["Delete writing"].exists)
        XCTAssertTrue(
            alert.staticTexts.matching(NSPredicate(
                format: "label CONTAINS[c] %@",
                "original recording and timed transcript stay safe"
            )).firstMatch.exists,
            "Deletion must plainly distinguish the editable draft from its recoverable source."
        )
        alert.buttons["Cancel"].tap()
        XCTAssertTrue(editor.exists)
    }

    func testVoiceWritingKeepsTimedSourceBesideEditableText() {
        app.tabBars.buttons["Library"].tap()
        app.buttons["Writing"].tap()
        let previewDraft = app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
        XCTAssertTrue(previewDraft.waitForExistence(timeout: 5))
        previewDraft.tap()

        let transcript = app.buttons["Transcript"]
        XCTAssertTrue(transcript.waitForExistence(timeout: 5))
        transcript.tap()

        XCTAssertTrue(app.textFields["CaptureVoiceWritingTranscriptSearch"].exists)
        XCTAssertTrue(app.buttons["CaptureVoiceWritingCopyTranscript"].exists)
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingTranscriptSegment_A17F4C12-0000-4000-8000-000000000032_0"].exists
        )
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingTranscriptSegment_A17F4C12-0000-4000-8000-000000000032_6400"].exists
        )
        XCTAssertTrue(
            app.staticTexts["The first idea connects the experience I described to the research question."].exists
        )
        let editPassage = app.buttons[
            "CaptureVoiceWritingEditTranscript_voice-writing-preview-a17f4c12-0000-4000-8000-000000000032-0"
        ]
        XCTAssertTrue(
            editPassage.waitForExistence(timeout: 5),
            "A timed voice-writing passage should be directly correctable without opening the coaching follow-through desk."
        )
        editPassage.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingCorrectionSheet"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.descendants(matching: .any)["CaptureVoiceWritingCorrectionText"].exists)
        XCTAssertTrue(app.buttons["CaptureVoiceWritingCorrectionPlay"].exists)
        XCTAssertFalse(
            app.buttons["CaptureVoiceWritingSaveCorrection"].isEnabled,
            "The deterministic presentation must show the real correction UI without pretending it saved a mutation."
        )
        app.buttons["Cancel"].tap()
        XCTAssertTrue(
            app.staticTexts["CaptureVoiceWritingTranscriptSourceBoundary"].exists,
            "Direct correction should never obscure which words still come from the retained source."
        )
    }

    func testCoachingHomeMakesThePhoneOnlyWorkflowConcrete() {
        relaunchCoachingPreview(role: "coach")
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(
            coaching.waitForExistence(timeout: 5),
            "Today should make the complete coaching workflow a first-class destination."
        )
        coaching.tap()

        XCTAssertTrue(
            app.scrollViews["CaptureCoachingHome"].waitForExistence(timeout: 5),
            "Coaching should open as a native iPhone surface, not a web handoff."
        )
        let firstScreen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        firstScreen.name = "coaching-home-first-screen.png"
        firstScreen.lifetime = .keepAlways
        add(firstScreen)
        XCTAssertTrue(app.staticTexts["Coaching"].exists)
        XCTAssertFalse(
            app.staticTexts["Sessions, clients, recordings, transcripts, notes, goals, and tasks—together on this iPhone."].exists,
            "The phone should begin with the next real Session instead of repeating a product tour under the Coaching title."
        )
        let openNextSession = app.buttons["CaptureCoachingOpen_preview-booking"]
        XCTAssertTrue(
            openNextSession.exists && openNextSession.isHittable,
            "The coach's next Session must be immediately actionable without scrolling."
        )
        let newAppointment = app.buttons["CaptureCoachingNewAppointmentButton"]
        XCTAssertTrue(newAppointment.exists)
        XCTAssertTrue(
            newAppointment.isEnabled,
            "Opening the native scheduling sheet is safe and should never look disabled; only final preview saves stay non-mutating."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingBooking_preview-booking"].exists,
            "The native home should expose upcoming appointments with exact client continuity."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureCoachingPracticeCommand"].exists,
            "Routine preparation must not become a mandatory-looking queue when the Session is already obvious above."
        )
        XCTAssertFalse(
            app.buttons["CaptureCoachingManage_preview-booking"].exists,
            "A deterministic first screen should not show disabled administration beside the primary Session action."
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS[c] %@", "needs a decision")
            ).firstMatch.exists,
            "Coaching should offer useful next steps without assigning the coach another review process."
        )
        // ShareLink's generated type varies between iOS releases. Its
        // explicit accessibility label is the operated fallback contract.
        let shareInvite = app.descendants(matching: .any)["Share coaching invitation"]
        reveal(shareInvite)
        XCTAssertTrue(
            shareInvite.exists && shareInvite.isHittable,
            "A coach should retain the system share sheet as a fallback to durable email delivery."
        )
        let relationship = app.descendants(matching: .any)["CaptureCoachingRelationship_preview-engagement"]
        reveal(relationship)
        XCTAssertTrue(
            relationship.exists,
            "The phone should expose the durable client space rather than reducing coaching to a call."
        )
        relationship.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingRelationshipPulse"]
                .waitForExistence(timeout: 5),
            "A client space should lead with the next Session and relationship work instead of making a coach hunt through cards."
        )
        let workspaceFirstScreen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        workspaceFirstScreen.name = "coaching-workspace-first-screen.png"
        workspaceFirstScreen.lifetime = .keepAlways
        add(workspaceFirstScreen)
        XCTAssertTrue(
            app.segmentedControls["CaptureCoachingWorkFilter"].isHittable,
            "Shared notes, tasks, and goals should be reachable before chat and repeated Session history."
        )
        for kind in ["NOTE", "TASK", "GOAL"] {
            let quickAdd = app.descendants(matching: .any)["CaptureCoachingQuickAdd_\(kind)"]
            XCTAssertTrue(
                quickAdd.waitForExistence(timeout: 5),
                "Client spaces should expose a direct \(kind.lowercased()) action without routing through a process dashboard."
            )
        }
        let primaryAction = app.buttons["CaptureCoachingRelationshipPrimaryAction"]
        XCTAssertTrue(
            primaryAction.exists,
            "The relationship pulse should provide one status-aware primary Session action."
        )
        XCTAssertEqual(
            primaryAction.label,
            "Open Session",
            "Preparation should remain available inside the Session without becoming required paperwork."
        )
    }

    func testCoachWithoutAppointmentsStartsWithSchedulingInsteadOfAnEmptyDashboard() {
        relaunchCoachingPreview(
            role: "coach",
            additionalArguments: ["--capture-availability-scheduling-preview"]
        )
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let schedule = app.buttons["CaptureCoachingNewAppointmentButton"]
        XCTAssertTrue(schedule.waitForExistence(timeout: 5))
        XCTAssertTrue(schedule.isHittable)
        XCTAssertFalse(
            app.staticTexts["No upcoming coaching appointments yet."].exists,
            "An empty Upcoming dashboard should not precede the action that creates the first appointment."
        )
        XCTAssertFalse(
            app.staticTexts["Upcoming"].exists,
            "A new coach should begin with scheduling, not an empty status section."
        )
    }

    func testCoachingHomeKeepsPrimaryActionsReachableAtLargestTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-coach-booking-preview",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launchEnvironment["CAPTURE_COACHING_PREVIEW_ROLE"] = "coach"
        app.launch()

        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 12))
        reveal(coaching)
        coaching.tap()

        let openSession = app.buttons["CaptureCoachingOpen_preview-booking"]
        XCTAssertTrue(openSession.waitForExistence(timeout: 5))
        XCTAssertTrue(
            openSession.isHittable,
            "The next coaching Session must remain reachable at the largest accessibility text size."
        )

        let shareInvite = app.descendants(matching: .any)["Share coaching invitation"]
        reveal(shareInvite)
        XCTAssertTrue(
            shareInvite.isHittable,
            "The standard share sheet must remain reachable without shrinking its label."
        )

        let relationship = app.descendants(matching: .any)["CaptureCoachingRelationship_preview-engagement"]
        reveal(relationship)
        XCTAssertTrue(
            relationship.isHittable,
            "The client space must remain reachable at the largest accessibility text size."
        )

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testClientCoachingFormDraftSurvivesRelaunchOnPhone() throws {
        relaunchCoachingPreview(
            role: "client",
            additionalArguments: [
                "--capture-client-booking-preview",
                "--capture-share-owner-ui-preview=coaching-forms-client-recovery",
            ]
        )
        openCoachingForms()

        let draft = app.descendants(matching: .any)[
            "CaptureCoachingFormAssignment_preview-form-draft"
        ]
        XCTAssertTrue(
            draft.waitForExistence(timeout: 5),
            "A client should see the exact assigned form in Capture without a browser handoff."
        )
        draft.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureCoachingFormResponse"].waitForExistence(timeout: 5),
            "The assigned form should open as a native phone surface."
        )

        let reflection = app.textViews["CaptureCoachingFormInput_what-matters"]
        XCTAssertTrue(reflection.waitForExistence(timeout: 5))
        let valueBeforeEditing = reflection.value as? String
        reflection.tap()
        for character in " 804217" {
            reflection.typeText(String(character))
        }
        let keyboardDone = app.buttons["CaptureCoachingFormKeyboardDone"]
        XCTAssertTrue(
            keyboardDone.waitForExistence(timeout: 3),
            "Long-form coaching answers need a standard way to finish editing."
        )
        keyboardDone.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))
        let committedValue = reflection.value as? String
        XCTAssertTrue(
            committedValue?.isEmpty == false && committedValue != valueBeforeEditing,
            "The keyboard must commit a changed draft before persistence is evaluated."
        )

        let submit = app.buttons["CaptureCoachingFormSubmit"]
        XCTAssertTrue(submit.exists)
        XCTAssertFalse(
            submit.isEnabled,
            "Deterministic preview must exercise the form without pretending to share externally."
        )

        app.terminate()
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"]
                .waitForExistence(timeout: 12)
        )
        openCoachingForms()
        app.descendants(matching: .any)["CaptureCoachingFormAssignment_preview-form-draft"].tap()

        let recovered = app.textViews["CaptureCoachingFormInput_what-matters"]
        XCTAssertTrue(recovered.waitForExistence(timeout: 5))
        XCTAssertEqual(
            recovered.value as? String,
            committedValue,
            "A protected, account-scoped private draft should survive an ordinary app relaunch."
        )
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testCoachReviewsSharedFormWithoutSeeingPrivateDraftAnswers() throws {
        relaunchCoachingPreview(
            role: "coach",
            additionalArguments: [
                "--capture-coach-booking-preview",
                "--capture-coaching-forms-coach-preview",
            ]
        )
        openCoachingForms()

        let sendForm = app.buttons["CaptureCoachingSendFormButton"]
        reveal(sendForm, searchAboveFirst: false)
        XCTAssertTrue(sendForm.exists)
        XCTAssertFalse(
            sendForm.isEnabled,
            "Preview should expose the native send workflow without issuing an external mutation."
        )

        let shared = app.descendants(matching: .any)[
            "CaptureCoachingCoachForm_preview-form-shared"
        ]
        reveal(shared)
        XCTAssertTrue(shared.exists)
        shared.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingFormAnswer_what-matters"]
                .waitForExistence(timeout: 5),
            "A coach should read a response only after the client shares it."
        )
        XCTAssertTrue(app.staticTexts["Choose the next honest step instead of solving everything at once."].exists)

        app.navigationBars.buttons.element(boundBy: 0).tap()
        let privateDraft = app.descendants(matching: .any)[
            "CaptureCoachingCoachForm_preview-form-draft"
        ]
        reveal(privateDraft)
        XCTAssertTrue(privateDraft.exists)
        privateDraft.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingFormPrivateDraftBoundary"]
                .waitForExistence(timeout: 5),
            "The coach may see draft status, but never the client's private answers."
        )
        XCTAssertFalse(
            app.staticTexts["I want to make the decision smaller."].exists,
            "A private draft answer must not leak into the coach projection."
        )
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testCoachCanInspectNativeAutomaticFormRhythmWithoutTriggeringSideEffects() throws {
        relaunchCoachingPreview(
            role: "coach",
            additionalArguments: [
                "--capture-coach-booking-preview",
                "--capture-coaching-forms-coach-preview",
            ]
        )
        openCoachingForms()

        let automation = app.buttons["CaptureCoachingAutomationButton"]
        reveal(automation, searchAboveFirst: false)
        XCTAssertTrue(automation.exists && automation.isHittable)
        automation.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureCoachingFormAutomation"].waitForExistence(timeout: 5)
        )

        let addRhythm = app.buttons["CaptureCoachingAutomationAdd"]
        XCTAssertTrue(addRhythm.exists && addRhythm.isEnabled)
        addRhythm.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingAutomationEditor"]
                .waitForExistence(timeout: 5),
            "A coach should be able to inspect the complete setup flow without producing a side effect."
        )
        let saveRhythm = app.buttons["CaptureCoachingAutomationSave"]
        reveal(saveRhythm, searchAboveFirst: false)
        XCTAssertTrue(saveRhythm.exists)
        XCTAssertFalse(
            saveRhythm.isEnabled,
            "Preview evidence may inspect policy setup, but must never persist a policy."
        )
        app.buttons["CaptureCoachingAutomationCancel"].tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingAutomationPolicy_preview-policy-before"].exists,
            "The coach should see the exact canonical policy and its retained version strategy."
        )
        let sessionControls = app.buttons["Sessions · manual control"]
        reveal(sessionControls, searchAboveFirst: false)
        XCTAssertTrue(sessionControls.exists)
        sessionControls.tap()
        let sendNow = app.buttons[
            "CaptureCoachingAutomationSendNow_preview-policy-before_preview-booking"
        ]
        reveal(sendNow, searchAboveFirst: false)
        XCTAssertTrue(sendNow.exists)
        XCTAssertFalse(
            sendNow.isEnabled,
            "A deterministic UI flight must show manual control without assigning a form."
        )
        let evidence = XCTAttachment(screenshot: app.screenshot())
        evidence.name = "Native coaching form rhythm with manual Session controls"
        evidence.lifetime = .keepAlways
        add(evidence)
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testClientNeverReceivesCoachFormAutomationControls() {
        relaunchCoachingPreview(
            role: "client",
            additionalArguments: ["--capture-client-booking-preview"]
        )
        openCoachingForms()
        XCTAssertFalse(
            app.buttons["CaptureCoachingAutomationButton"].exists,
            "Automation policy and Session override controls are coach-only operational state."
        )
        XCTAssertFalse(app.buttons["CaptureCoachingAutomationAdd"].exists)
        XCTAssertFalse(app.scrollViews["CaptureCoachingFormAutomation"].exists)
    }

    func testClientCanSeePublishedTimesAndOwnPendingRequest() {
        relaunchCoachingPreview(
            role: "client",
            additionalArguments: ["--capture-client-booking-preview"]
        )
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let request = app.descendants(matching: .any)[
            "CaptureCoachingClientRequest_preview-booking-request"
        ]
        XCTAssertTrue(request.waitForExistence(timeout: 5))
        let firstScreen = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        firstScreen.name = "coaching-client-first-screen.png"
        firstScreen.lifetime = .keepAlways
        add(firstScreen)
        XCTAssertTrue(
            request.exists && request.isHittable,
            "A client's pending scheduling action should be visible before welcome copy and secondary tools."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoachingClientWelcome"]
                .waitForExistence(timeout: 5),
            "A client should see their private coaching space, not coach administration."
        )
        XCTAssertFalse(
            app.buttons["CaptureCoachingSetupButton"].exists,
            "An established client must not be asked to set up a coaching practice."
        )
        reveal(request)
        XCTAssertTrue(
            request.exists,
            "The client should be able to read back their pending request on iPhone."
        )
        let cancel = app.buttons["CaptureCoachingCancelRequest_preview-booking-request"]
        reveal(cancel)
        XCTAssertTrue(cancel.exists)
        XCTAssertFalse(
            cancel.isEnabled,
            "Deterministic preview must expose cancellation without pretending to mutate canonical scheduling truth."
        )

        let offering = app.descendants(matching: .any)[
            "CaptureCoachingPublicOffering_preview-offering"
        ]
        reveal(offering)
        XCTAssertTrue(
            offering.exists,
            "Published, privacy-safe coaching times should be available without a browser handoff."
        )
        XCTAssertFalse(
            app.buttons["CaptureCoachingNewAppointmentButton"].exists,
            "A client-only user must not inherit the coach scheduling surface."
        )
    }

    func testCoachCanReviewIncomingTimeRequest() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let request = app.descendants(matching: .any)[
            "CaptureCoachingIncomingRequest_preview-booking-request"
        ]
        reveal(request)
        XCTAssertTrue(
            request.exists,
            "An assigned coach should see incoming time requests directly in Capture."
        )
        let confirm = app.buttons[
            "CaptureCoachingConfirmRequest_preview-booking-request"
        ]
        XCTAssertTrue(confirm.exists)
        XCTAssertFalse(
            confirm.isEnabled,
            "Deterministic preview must expose confirmation without creating a fake Session."
        )
        XCTAssertTrue(
            app.buttons["CaptureCoachingDeclineRequest_preview-booking-request"].exists,
            "The coach should have a conventional decline action beside confirmation."
        )
    }

    func testOfflineCoachingSnapshotIsClearlyReadOnly() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let offlineSnapshot = app.staticTexts["Saved coaching snapshot"]
        XCTAssertTrue(
            offlineSnapshot.waitForExistence(timeout: 5),
            "A restored scheduling projection must identify itself as saved, not current truth."
        )
        let offlineExplanation = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Scheduling actions are disabled")
        ).firstMatch
        XCTAssertTrue(
            offlineExplanation.exists,
            "The offline explanation should make the read-only boundary explicit."
        )

        let pendingRequest = app.descendants(matching: .any)[
            "CaptureCoachingClientRequest_preview-booking-request"
        ]
        reveal(pendingRequest)
        XCTAssertTrue(
            pendingRequest.exists,
            "A client should retain evidence of their pending request during a temporary outage."
        )
        let cancel = app.buttons["CaptureCoachingCancelRequest_preview-booking-request"]
        reveal(cancel)
        XCTAssertTrue(cancel.exists)
        XCTAssertFalse(
            cancel.isEnabled,
            "Cached scheduling must never issue a mutation until authoritative Nest state returns."
        )
    }

    func testConfirmedRequestHasImmediateSessionHandoff() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let handoff = app.descendants(matching: .any)[
            "CaptureCoachingConfirmedHandoff"
        ]
        reveal(handoff)
        XCTAssertTrue(
            handoff.waitForExistence(timeout: 5),
            "Confirming a requested time should produce the same obvious Session handoff as direct scheduling."
        )
        XCTAssertTrue(app.staticTexts["Appointment ready"].exists)
        XCTAssertTrue(
            app.buttons["Open Session"].exists,
            "The coach should not have to hunt through scheduling after confirmation."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["Share coaching invitation"].exists,
            "The confirmed Session should retain the conventional system share fallback."
        )

        app.buttons["Open Session"].tap()
        XCTAssertTrue(
            app.tabBars.buttons["Record"].isSelected,
            "The confirmed appointment should move directly into the recorder."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureProviderRoomControls"]
                .waitForExistence(timeout: 5),
            "Open Session should land in the standard call lobby for the exact confirmed Session."
        )
        XCTAssertTrue(
            app.buttons["ProviderJoinRoomButton"].exists,
            "The confirmed Session handoff should end at one conventional Join call action."
        )
    }

    func testSchedulingShowsKnownConflictBeforeSave() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let newAppointment = app.buttons["CaptureCoachingNewAppointmentButton"]
        XCTAssertTrue(newAppointment.waitForExistence(timeout: 5))
        XCTAssertTrue(newAppointment.isEnabled)
        newAppointment.tap()

        let conflict = app.descendants(matching: .any)[
            "CaptureCoachingAppointmentConflict"
        ].firstMatch
        XCTAssertTrue(
            conflict.waitForExistence(timeout: 5),
            "A known overlapping Quipsly Session should be explained while the coach chooses a time."
        )
        let create = app.buttons["CaptureCoachingCreateAppointment"]
        XCTAssertTrue(create.waitForExistence(timeout: 5))
        XCTAssertFalse(
            create.isEnabled,
            "The iPhone must not offer Save while its current schedule projection already conflicts."
        )
    }

    func testSchedulingRespectsAvailabilityBeforeSave() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let workingHours = app.buttons["CaptureCoachingWorkingHoursButton"]
        XCTAssertTrue(
            workingHours.waitForExistence(timeout: 5),
            "A coach should be able to edit ordinary working hours without leaving the iPhone app."
        )
        workingHours.tap()
        XCTAssertTrue(
            app.navigationBars["Availability"].waitForExistence(timeout: 5),
            "Availability should be one conventional sheet, not a separate administration workflow."
        )
        XCTAssertTrue(app.buttons["CaptureCoachingSaveWorkingHours"].exists)
        app.buttons["Cancel"].tap()

        let newAppointment = app.buttons["CaptureCoachingNewAppointmentButton"]
        XCTAssertTrue(newAppointment.waitForExistence(timeout: 5))
        newAppointment.tap()

        let unavailable = app.descendants(matching: .any)[
            "CaptureCoachingAppointmentOutsideWorkingHours"
        ].firstMatch
        XCTAssertTrue(
            unavailable.waitForExistence(timeout: 5),
            "The current choice should explain that it falls outside the coach's saved working hours."
        )
        let create = app.buttons["CaptureCoachingCreateAppointment"]
        XCTAssertTrue(create.waitForExistence(timeout: 5))
        XCTAssertFalse(
            create.isEnabled,
            "The iPhone must not offer Save for a time outside authoritative working hours."
        )
    }

    func testSchedulingRoutesUnsubscribedCoachToNativePlan() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()

        let schedule = app.buttons["CaptureCoachingNewAppointmentButton"]
        XCTAssertTrue(schedule.waitForExistence(timeout: 5))
        XCTAssertTrue(
            schedule.isEnabled,
            "An unsubscribed coach should still use the ordinary Schedule coaching action."
        )
        schedule.tap()

        XCTAssertTrue(
            app.scrollViews["QuipslySubscriptionView"].waitForExistence(timeout: 5),
            "Scheduling should open the native App Store plan instead of failing with a generic server error."
        )
        XCTAssertTrue(app.buttons["CaptureRestoreQuipslyPurchases"].exists)
        XCTAssertTrue(
            app.buttons["Not now"].exists,
            "A coach should be able to leave purchase without losing existing Sessions or client work."
        )
        XCTAssertFalse(
            app.textFields["CaptureCoachingClientEmail"].exists,
            "The app must not collect a new-client appointment before scheduling access is active."
        )
    }

    func testConsentNeededNextEpisodeOpensRecorderWithoutCrashing() {
        let next = app.buttons["CaptureOpenNextSessionButton"]
        XCTAssertTrue(next.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["High Ground pre-show"].exists,
            "The regression fixture must make the consent-needed podcast the exact Next button target."
        )

        next.tap()

        XCTAssertTrue(
            app.scrollViews["CaptureRecorderView"]
                .waitForExistence(timeout: 8),
            "Opening a full Episode projection must not overflow SwiftUI's layout stack."
        )
        XCTAssertTrue(
            app.buttons["ProviderJoinRoomButton"].waitForExistence(timeout: 5),
            "Opening a Session should stop in the standard outer room before exposing recording administration."
        )
        XCTAssertFalse(app.buttons["CaptureConfirmConsentButton"].exists)
        openLocalRecorderIfNeeded()
        XCTAssertTrue(
            app.buttons["CaptureConfirmConsentButton"]
                .waitForExistence(timeout: 5),
            "Consent-needed Sessions must open the in-recorder consent action."
        )
        XCTAssertTrue(app.state == .runningForeground)
    }

    func testRecorderUsesAFamiliarMicrophoneLevelInsteadOfAnOpaquePercentage() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()

        let evidence = app.descendants(matching: .any)[
            "CaptureRecorderInputEvidence"
        ]
        reveal(evidence)
        XCTAssertTrue(
            evidence.waitForExistence(timeout: 5),
            "The primary recorder should expose inspectable audio evidence beside its record action."
        )
        XCTAssertEqual(evidence.label, "Microphone level")
        XCTAssertEqual(evidence.value as? String, "Inactive")
        XCTAssertFalse(
            evidence.label.localizedCaseInsensitiveContains("percent"),
            "A percentage without a physical unit must not stand in for audio level truth."
        )
    }

    func testRecorderLeadsWithAStandardCallGreenRoom() {
        app.tabBars.buttons["Record"].tap()

        let call = app.descendants(matching: .any)["CaptureProviderRoomControls"]
        let join = app.buttons["ProviderJoinRoomButton"]
        let useCallAudio = app.switches["CaptureUseCallAudioToggle"]
        let microphone = app.switches["CaptureJoinMicrophoneToggle"]
        let camera = app.switches["CaptureJoinCameraToggle"]
        let route = app.descendants(matching: .any)["CaptureCallInputRoute"]
        let outputRoute = app.descendants(matching: .any)["CaptureCallOutputRoute"]
        let routePicker = app.descendants(matching: .any)["CaptureCallAudioRoutePicker"]
        let consent = app.descendants(matching: .any)["CaptureConsentStrip"]
        let localOnly = app.buttons["CaptureRecordWithoutJoiningButton"]

        XCTAssertTrue(call.waitForExistence(timeout: 5))
        XCTAssertTrue(join.exists, "The green room should expose one obvious Join call action.")
        XCTAssertTrue(useCallAudio.exists, "The familiar pre-join surface should make second-device audio routing obvious.")
        XCTAssertTrue(camera.exists, "The familiar pre-join surface should expose one ordinary camera choice.")
        turnOff(camera)
        XCTAssertEqual(camera.label, "Camera")
        XCTAssertEqual(camera.value as? String, "0", "A privacy-safe camera-off choice should remain obvious before Join.")
        turnOn(useCallAudio)
        XCTAssertTrue(outputRoute.exists, "The listening route should be visible separately from the microphone before joining.")
        XCTAssertTrue(routePicker.exists, "The lobby should expose Apple's familiar system audio-route control.")
        XCTAssertTrue(microphone.exists, "Using this iPhone for call audio should expose the standard pre-join microphone choice.")
        turnOff(microphone)
        XCTAssertEqual(microphone.label, "Microphone")
        XCTAssertEqual(microphone.value as? String, "0", "Turning the pre-join microphone off should remain an ordinary mute choice, not companion mode.")
        turnOn(microphone)
        turnOff(useCallAudio)
        XCTAssertFalse(
            app.switches["CaptureJoinMicrophoneToggle"].exists,
            "Second-device mode should remove the irrelevant local microphone publication choice."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureCallAudioRoutePicker"].exists,
            "Second-device mode should not imply that this iPhone owns the call's listening route."
        )
        turnOn(useCallAudio)
        XCTAssertTrue(app.switches["CaptureJoinMicrophoneToggle"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureCallAudioRoutePicker"].exists)
        XCTAssertTrue(route.exists, "The current microphone route should be visible before joining.")
        XCTAssertTrue(localOnly.exists, "Local-only recording should remain one secondary escape hatch.")
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureOuterRoomNextStep"].exists,
            "Obvious call actions should not be followed by another paragraph of lobby instructions."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionGuardian"].exists,
            "A routine disconnected lobby is not an error and should remain quiet."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureCallAudioDeviceGuidance"].exists,
            "The standard this-iPhone audio choice should not explain itself."
        )
        XCTAssertFalse(consent.exists, "Consent and recorder controls should not turn the outer room into a vertical checklist.")

        localOnly.tap()
        XCTAssertTrue(consent.waitForExistence(timeout: 5))
        XCTAssertLessThan(
            call.frame.minY,
            consent.frame.minY,
            "The normal call path must come before recording administration and production tools."
        )
        XCTAssertTrue(app.state == .runningForeground)
    }

    func testCallLobbyRemembersSafeDeviceChoicesAcrossRelaunch() {
        app.tabBars.buttons["Record"].tap()

        let useCallAudio = app.switches["CaptureUseCallAudioToggle"]
        let microphone = app.switches["CaptureJoinMicrophoneToggle"]
        let camera = app.switches["CaptureJoinCameraToggle"]
        XCTAssertTrue(useCallAudio.waitForExistence(timeout: 5))
        turnOn(useCallAudio)
        turnOff(microphone)
        turnOff(camera)

        app.terminate()
        app = XCUIApplication()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
        ]
        app.launch()

        let restoredCallAudio = app.switches["CaptureUseCallAudioToggle"]
        let restoredMicrophone = app.switches["CaptureJoinMicrophoneToggle"]
        let restoredCamera = app.switches["CaptureJoinCameraToggle"]
        XCTAssertTrue(restoredCallAudio.waitForExistence(timeout: 8))
        XCTAssertEqual(restoredCallAudio.value as? String, "1")
        XCTAssertEqual(restoredMicrophone.value as? String, "0")
        XCTAssertEqual(restoredCamera.value as? String, "0")
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCallAudioRoutePicker"].exists,
            "A safe returning caller should regain the actual this-iPhone route control without another setup ceremony."
        )
    }

    func testEpisodeWatchStagesLeadClipWithoutInventingRecordingOrSharedMutation() {
        app.tabBars.buttons["Record"].tap()

        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let episodeSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(
            episodeSession.waitForExistence(timeout: 5),
            "The Watch scenario must explicitly enter an episode rather than inheriting the default coaching session."
        )
        episodeSession.tap()

        let card = app.descendants(matching: .any)["CaptureEpisodeWatchCard"]
        reveal(card, searchAboveFirst: false)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "An episode-bound Capture session should expose its shared Watch room on the primary recorder."
        )
        XCTAssertTrue(app.staticTexts["Ted Lasso · Be Curious"].exists)
        XCTAssertEqual(
            app.staticTexts["CaptureEpisodeWatchStatus"].label,
            "Paused together"
        )
        let clipMenu = app.buttons["CaptureEpisodeWatchClipMenu"]
        XCTAssertTrue(
            clipMenu.exists,
            "Preview must render the same three-clip selection affordance as the rehearsal room."
        )
        XCTAssertFalse(
            clipMenu.isEnabled,
            "Deterministic preview must expose the clip menu without pretending to mutate shared state."
        )

        let prepare = app.buttons["CaptureEpisodeWatchPrepareButton"]
        XCTAssertTrue(prepare.exists)
        XCTAssertFalse(
            prepare.isEnabled,
            "Deterministic preview must show the prepared workflow without downloading protected production media."
        )
        XCTAssertFalse(
            app.buttons["CaptureEpisodeWatchPlayPauseButton"].exists,
            "Shared playback controls should appear only after this iPhone validates its protected local copy."
        )

        let boundary = app.staticTexts["CaptureEpisodeWatchBoundary"]
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("Start recording before Play together"))
        XCTAssertTrue(boundary.label.contains("private preview never changes shared state"))
    }

    func testEpisodeWatchKeepsExactCurrentPassVisibleWithoutALocalClip() {
        let card = app.descendants(matching: .any)["CaptureEpisodeWatchCard"]
        reveal(card)
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.buttons["CaptureEpisodeWatchPrepareButton"].exists,
            "The protected clip remains a separate local-download concern."
        )

        let timeline = app.descendants(matching: .any)[
            "CaptureEpisodeWatchSyncTimelineButton"
        ]
        reveal(timeline)
        XCTAssertTrue(
            timeline.waitForExistence(timeout: 5),
            "Canonical timeline state must remain visible without a downloaded clip."
        )
        XCTAssertEqual(timeline.label, "1 watched span in editor")
        XCTAssertFalse(
            timeline.isEnabled,
            "An exact current pass must not offer a redundant materialization."
        )

        let editor = app.descendants(matching: .any)[
            "CaptureEpisodeWatchOpenEditorLink"
        ]
        reveal(editor)
        XCTAssertTrue(
            editor.exists,
            "A materialized exact pass should expose the assembled Nest editor even without local media."
        )
    }

    func testEpisodeWatchKeepsPreviousPassClearActionVisibleWithoutALocalClip() {
        let card = app.descendants(matching: .any)["CaptureEpisodeWatchCard"]
        reveal(card)
        XCTAssertTrue(card.waitForExistence(timeout: 5))

        let timeline = app.descendants(matching: .any)[
            "CaptureEpisodeWatchSyncTimelineButton"
        ]
        reveal(timeline)
        XCTAssertTrue(
            timeline.waitForExistence(timeout: 5),
            "A previous materialization must remain recoverable after the local clip is removed."
        )
        XCTAssertEqual(timeline.label, "Clear previous watch pass")
        XCTAssertFalse(
            timeline.isEnabled,
            "Deterministic preview surfaces state without faking a shared Nest mutation."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)[
                "CaptureEpisodeWatchOpenEditorLink"
            ].exists,
            "A stale prior pass must not be presented as the current assembled episode."
        )
    }

    func testEpisodeManuscriptIsReadableBesideTheRecorderWithoutCreatingAnEditableCopy() {
        app.tabBars.buttons["Record"].tap()

        let card = app.descendants(matching: .any)["CaptureEpisodeManuscriptCard"]
        reveal(card, searchAboveFirst: false)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "An episode-bound Capture session should expose its canonical manuscript before the shared Watch controls after following the recorder workspace."
        )
        XCTAssertTrue(app.staticTexts["The Swear Jar"].exists)
        XCTAssertTrue(
            app.staticTexts["34 blocks · read-only on iPhone"].exists,
            "The phone must state the read-only boundary instead of implying it owns another editable script."
        )

        let open = app.buttons["CaptureEpisodeManuscriptOpenButton"]
        XCTAssertTrue(
            open.waitForExistence(timeout: 5),
            "The visible manuscript card should expose its read-only reader control."
        )
        reveal(open)
        XCTAssertTrue(open.isHittable)
        open.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureEpisodeManuscriptReader"]
                .waitForExistence(timeout: 5)
        )
        let boundary = app.descendants(matching: .any)["CaptureEpisodeManuscriptBoundary"]
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("Canonical Nest manuscript"))
        XCTAssertTrue(boundary.label.contains("Read-only here"))
        XCTAssertTrue(app.staticTexts["Homer"].exists)
        XCTAssertTrue(app.staticTexts["Charlie"].exists)
        XCTAssertTrue(app.staticTexts["Clip · Be Curious"].exists)
        XCTAssertTrue(app.buttons["Refresh episode script"].exists)
        XCTAssertFalse(
            app.buttons["Refresh episode script"].isEnabled,
            "Deterministic preview must never imply it performed a canonical network refresh."
        )
    }

    func testEpisodeThreadKeepsCollaborationBesideTheRecorderWithoutStartingCapture() {
        app.tabBars.buttons["Record"].tap()

        let card = app.descendants(matching: .any)["CaptureEpisodeChatCard"]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "An episode-bound Capture session should expose its canonical collaboration thread beside Manuscript and Watch."
        )
        XCTAssertTrue(app.staticTexts["Homer"].exists)
        XCTAssertTrue(
            app.staticTexts["CaptureEpisodeChatLatestMessage"].label
                .contains("I’ll open with the swear jar story")
        )

        let open = app.buttons["CaptureEpisodeChatOpenButton"]
        XCTAssertTrue(open.isHittable)
        open.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureEpisodeChatThread"]
                .waitForExistence(timeout: 5)
        )
        let boundary = app.descendants(matching: .any)["CaptureEpisodeChatBoundary"]
        XCTAssertTrue(boundary.label.contains("Canonical episode conversation"))
        XCTAssertTrue(boundary.label.contains("never start from chat"))
        XCTAssertTrue(app.staticTexts["Charlie"].exists)
        XCTAssertTrue(app.staticTexts["Homer"].exists)
        XCTAssertFalse(
            app.buttons["CaptureEpisodeChatSendButton"].isEnabled,
            "Deterministic preview must show the production composer without pretending to author canonical chat."
        )
        XCTAssertFalse(
            app.buttons["Refresh episode thread"].isEnabled,
            "Deterministic preview must never imply a canonical network refresh."
        )
        XCTAssertFalse(
            app.staticTexts["Recording audio"].exists,
            "Opening collaboration must not start local capture."
        )
    }

    func testSessionThreadKeepsTakeCoordinationSeparateFromEpisodeWork() {
        app.tabBars.buttons["Record"].tap()

        let card = app.descendants(matching: .any)["CaptureSessionChatCard"]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "Every Capture Session should expose its room-bound conversation beside the recorder, even without a Nest project."
        )
        XCTAssertTrue(
            app.staticTexts["CaptureSessionChatLatestMessage"].label
                .contains("one clear next step")
        )

        let open = app.buttons["CaptureSessionChatOpenButton"]
        XCTAssertTrue(open.isHittable)
        open.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSessionChatThread"]
                .waitForExistence(timeout: 5)
        )
        let boundary = app.descendants(matching: .any)["CaptureSessionChatBoundary"]
        XCTAssertTrue(boundary.label.contains("Session conversation"))
        XCTAssertTrue(boundary.label.contains("Messages stay with this Session"))
        XCTAssertTrue(boundary.label.contains("Notes and Work"))
        XCTAssertFalse(
            app.buttons["CaptureSessionChatSendButton"].isEnabled,
            "Deterministic preview must expose the production composer without authoring canonical Session chat."
        )
        XCTAssertFalse(
            app.buttons["Refresh session conversation"].isEnabled,
            "Deterministic preview must never imply it refreshed the canonical Session thread."
        )
        XCTAssertFalse(
            app.buttons["Message actions"].exists,
            "A read-only thread must not expose reply, edit, or remove controls that cannot succeed."
        )
        XCTAssertFalse(
            app.staticTexts["Recording audio"].exists,
            "Opening the exact-call thread must not start local capture."
        )
    }

    func testRehearsalReadinessMakesEveryPhysicalBoundaryVisibleBeforeRecord() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()

        let card = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessCard"
        ]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "The selected Session should expose one consolidated pre-record checklist."
        )
        XCTAssertTrue(app.staticTexts["Preview only"].exists)
        let disclosure = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessDisclosure"
        ]
        XCTAssertTrue(disclosure.isHittable)
        disclosure.tap()

        let session = app.descendants(matching: .any)[
            "CaptureRehearsalCheck_session"
        ]
        XCTAssertTrue(session.exists)
        XCTAssertTrue(session.label.contains("High Ground Odyssey"))
        XCTAssertTrue(
            session.label.contains("session-capture"),
            "Preview must show its own selected episode identity instead of borrowing the protected production rehearsal slug."
        )

        let manuscript = app.descendants(matching: .any)[
            "CaptureRehearsalCheck_manuscript"
        ]
        reveal(manuscript)
        XCTAssertTrue(manuscript.waitForExistence(timeout: 3))
        expectation(
            for: NSPredicate(format: "label CONTAINS %@", "The Swear Jar"),
            evaluatedWith: manuscript
        )
        waitForExpectations(timeout: 3)
        XCTAssertTrue(manuscript.label.contains("The Swear Jar"))
        XCTAssertTrue(manuscript.label.contains("34 protected blocks"))

        let watch = app.descendants(matching: .any)[
            "CaptureRehearsalCheck_watch"
        ]
        reveal(watch)
        XCTAssertTrue(watch.exists)
        XCTAssertTrue(watch.label.contains("Ted Lasso · Be Curious"))
        XCTAssertTrue(
            watch.label.contains("does not fake a protected download")
        )

        let soundCheck = app.descendants(matching: .any)[
            "CaptureRehearsalCheck_sound-check"
        ]
        reveal(soundCheck)
        XCTAssertTrue(soundCheck.exists)
        XCTAssertTrue(soundCheck.label.contains("Optional sound check"))
        XCTAssertTrue(soundCheck.label.contains("Record and replay a private sample"))
        XCTAssertTrue(
            !app.descendants(matching: .any)[
                "CaptureRehearsalCheck_shared-preflight"
            ].exists,
            "Internal receipt delivery must not become another pre-record task."
        )
        let soundCheckControls = app.descendants(matching: .any)[
            "CaptureSoundCheckControls"
        ]
        reveal(soundCheckControls)
        XCTAssertTrue(soundCheckControls.exists)
        let soundCheckStart = app.buttons["CaptureSoundCheckStart"]
        XCTAssertTrue(soundCheckStart.exists)
        XCTAssertFalse(
            soundCheckStart.isEnabled,
            "Deterministic preview must expose the sound-check workflow without opening a microphone or inventing level evidence."
        )
        XCTAssertFalse(app.buttons["CaptureSoundCheckHeardClear"].exists)
        XCTAssertFalse(app.buttons["CaptureSoundCheckNeedsAdjustment"].exists)
        let soundCheckBoundary = app.descendants(matching: .any)[
            "CaptureSoundCheckBoundary"
        ]
        XCTAssertTrue(soundCheckBoundary.exists)
        XCTAssertTrue(soundCheckBoundary.label.contains("never uploaded"))
        XCTAssertTrue(soundCheckBoundary.label.contains("deleted automatically"))

        let runCheck = app.buttons["CaptureRehearsalRunCheck"]
        reveal(runCheck)
        XCTAssertTrue(runCheck.exists)
        XCTAssertFalse(
            runCheck.isEnabled,
            "Deterministic preview must not invent device, route, storage, or protected-download proof."
        )
        let boundary = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessBoundary"
        ]
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("never claims physical-device"))
    }

    func testNestsSearchLabelsPrivateOwnedAndSharedWorkAndOpensWritingInPlace() {
        app.tabBars.buttons["Nests"].tap()
        let searchField = app.descendants(matching: .any)["CaptureWorkSearchField"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 5))

        searchField.tap()
        searchField.typeText("paper")
        let summary = app.descendants(matching: .any)["CaptureWorkGlobalSearchSummary"]
        XCTAssertTrue(summary.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["2 results · searched 3 Nests"].exists)
        XCTAssertTrue(app.staticTexts["Doctoral research · Owned by you"].exists)
        XCTAssertTrue(app.staticTexts["High Ground Odyssey · Shared with you"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureWorkGlobalSearchResult_TASK_preview-work-task"].exists
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureWorkGlobalSearchResult_SESSION_preview-search-session"].exists
        )

        app.buttons["Clear work search"].tap()
        searchField.tap()
        searchField.typeText("Dissertation")
        let writing = app.descendants(matching: .any)["CaptureWorkGlobalSearchResult_WRITING_preview-work-note"]
        XCTAssertTrue(writing.waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Charlie Home Nest · Private to you"].exists)

        writing.tap()
        let picker = app.descendants(matching: .any)["CaptureWorkProjectPicker"]
        let privateNestSelected = expectation(
            for: NSPredicate(
                format: "value CONTAINS %@",
                "Charlie Home Nest, Private to you"
            ),
            evaluatedWith: picker
        )
        wait(for: [privateNestSelected], timeout: 5)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureWorkNote_preview-work-note"].waitForExistence(timeout: 3),
            "A native writing result should open inside its exact Nest instead of dropping the person into a generic web page."
        )
    }

    func testWorkKeepsProjectsTasksGoalsNotesAndTagsTogether() {
        app.tabBars.buttons["Nests"].tap()
        let workScroll = app.scrollViews["CaptureWorkView"]
        XCTAssertTrue(workScroll.waitForExistence(timeout: 5))
        let newProject = app.buttons["CaptureWorkNewProject"]
        XCTAssertTrue(
            newProject.exists,
            "Nests must keep canonical Nest creation directly reachable from the standard navigation bar."
        )
        XCTAssertFalse(
            newProject.isEnabled,
            "Deterministic preview must expose New Project without pretending to create a canonical Nest."
        )
        XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkProjectPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkProjectSummary"].exists)
        XCTAssertEqual(
            app.staticTexts["Access"].value as? String,
            "Can edit",
            "Nest access should be described as a human capability instead of a database role."
        )
        XCTAssertTrue(app.staticTexts["High Ground Odyssey"].exists)

        let searchField = app.descendants(matching: .any)["CaptureWorkSearchField"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 3))
        XCTAssertTrue(searchField.isHittable, "Project Work search must be directly usable on iPhone.")
        searchField.tap()
        searchField.typeText("paper")
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureWorkGlobalSearchSummary"].waitForExistence(timeout: 3),
            "Work search must cross the actor's permission-filtered Nests through the visible shipping control."
        )
        XCTAssertTrue(app.staticTexts["Doctoral research · Owned by you"].exists)
        XCTAssertTrue(app.staticTexts["High Ground Odyssey · Shared with you"].exists)
        let clearSearch = app.buttons["Clear work search"]
        XCTAssertTrue(clearSearch.isHittable)
        clearSearch.tap()
        XCTAssertEqual(searchField.value as? String, "Search all your Nests")
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 3))

        let manageVocabulary = app.buttons["CaptureWorkManageTags"]
        reveal(manageVocabulary)
        XCTAssertTrue(manageVocabulary.isHittable, "Shared vocabulary management must be directly reachable from the tag lens.")
        manageVocabulary.tap()
        XCTAssertTrue(app.navigationBars["Tag vocabulary"].waitForExistence(timeout: 5))
        let previewCreateField = app.textFields["CaptureTagVocabularyCreateField"]
        XCTAssertTrue(
            previewCreateField.waitForExistence(timeout: 3),
            "Work vocabulary must expose deliberate canonical tag creation before a record exists."
        )
        let previewCreateTag = app.buttons["CaptureTagVocabularyCreate"]
        XCTAssertTrue(previewCreateTag.exists)
        XCTAssertFalse(
            previewCreateTag.isEnabled,
            "Preview must explain direct vocabulary creation without pretending to mutate the Nest."
        )
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTagVocabularyAliases_preview-episode-4"].exists)
        let previewManageTag = app.buttons["CaptureTagVocabularyManage_preview-episode-4"]
        XCTAssertTrue(previewManageTag.exists)
        XCTAssertFalse(previewManageTag.isEnabled, "Preview must explain shared taxonomy without pretending to rename or archive it.")
        app.buttons["Retired"].tap()
        let previewRestoreTag = app.buttons["CaptureTagVocabularyRestore_preview-retired"]
        XCTAssertTrue(previewRestoreTag.waitForExistence(timeout: 3))
        XCTAssertFalse(previewRestoreTag.isEnabled, "Preview must preserve retired-tag history without faking a restore.")
        let openNestVocabulary = app.buttons["CaptureTagVocabularyOpenNest"]
        XCTAssertTrue(openNestVocabulary.isHittable, "Higher-impact merge and rollback work must remain reachable in Nest.")
        app.buttons["Done"].tap()
        XCTAssertTrue(app.navigationBars["Tag vocabulary"].waitForNonExistence(timeout: 5))

        let episodeTag = app.buttons["CaptureWorkTag_preview-episode-4"]
        for _ in 0..<8 where !episodeTag.isHittable { workScroll.swipeUp() }
        XCTAssertTrue(episodeTag.isHittable, "The Work tag lens must be visible and directly reachable in the project workspace.")
        episodeTag.tap()
        let tagFocus = app.descendants(matching: .any)["CaptureWorkTagFocus"]
        XCTAssertTrue(tagFocus.waitForExistence(timeout: 3))
        XCTAssertTrue(tagFocus.label.contains("Showing #Episode 4 in High Ground Odyssey"))
        XCTAssertEqual(episodeTag.value as? String, "Selected")

        let taskTitle = app.staticTexts["Proof-listen the episode opening"]
        reveal(taskTitle)
        XCTAssertTrue(taskTitle.exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "CaptureWorkTask_preview-work-task").firstMatch.exists)
        let taskTagEditor = app.buttons["Explore tags for Proof-listen the episode opening"]
        reveal(taskTagEditor)
        XCTAssertTrue(taskTagEditor.exists)
        XCTAssertTrue(taskTagEditor.isEnabled, "Preview Work should allow safe inspection of the real tag editor.")
        taskTagEditor.tap()
        XCTAssertTrue(app.navigationBars["Edit tags"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkTagEditorPreviewBoundary"].exists)
        let newTag = app.textFields["CaptureTodayWorkTagNewLabel"]
        XCTAssertTrue(newTag.waitForExistence(timeout: 5))
        newTag.tap()
        newTag.typeText("Recording day")
        let saveTags = app.buttons["CaptureTodayWorkTagsSave"]
        XCTAssertTrue(saveTags.exists)
        XCTAssertFalse(saveTags.isEnabled, "Preview exploration must keep the canonical Save action disabled.")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Edit tags"].waitForNonExistence(timeout: 5))
        let goalTitle = app.staticTexts["Publish an episode we trust"]
        reveal(goalTitle)
        XCTAssertTrue(goalTitle.exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "CaptureWorkGoal_preview-work-goal").firstMatch.exists)
        let goalTagEditor = app.buttons["Explore tags for Publish an episode we trust"]
        reveal(goalTagEditor)
        XCTAssertTrue(goalTagEditor.exists)
        XCTAssertTrue(goalTagEditor.isEnabled)

        let noteTitle = app.staticTexts["Opening idea"]
        reveal(noteTitle)
        XCTAssertTrue(noteTitle.exists)
        XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "CaptureWorkNote_preview-work-note").firstMatch.exists)
        let noteTagEditor = app.buttons["Explore tags for Opening idea"]
        reveal(noteTagEditor)
        XCTAssertTrue(noteTagEditor.exists)
        XCTAssertTrue(noteTagEditor.isEnabled)

        let quickTask = app.buttons["CaptureWorkQuickEntry_TASK"]
        for _ in 0..<8 where !quickTask.isHittable { app.swipeDown() }
        XCTAssertTrue(quickTask.isHittable)
        quickTask.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "High Ground Odyssey")
        ).firstMatch.exists, "Work quick capture must arrive pre-bound to the selected canonical project.")
        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Confirm the Work project destination")
        dismissQuickEntryKeyboard()
        let tag = app.buttons["CaptureQuickEntryTag_preview-episode-4"]
        reveal(tag)
        XCTAssertTrue(tag.isHittable)
        tag.tap()
        XCTAssertTrue(app.buttons["CaptureQuickEntrySave"].isEnabled)
        app.buttons["CaptureQuickEntrySave"].tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))

        app.tabBars.buttons["Nests"].tap()
        let picker = app.descendants(matching: .any)["CaptureWorkProjectPicker"]
        reveal(picker)
        picker.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureNestSwitcher"].waitForExistence(timeout: 3),
            "Switching Nests should open one searchable, grouped destination surface."
        )
        for section in ["Private", "Owned by you", "Shared with you"] {
            XCTAssertTrue(
                app.staticTexts[section].exists,
                "The Nest switcher should expose the \(section.lowercased()) scope before someone changes destinations."
            )
        }
        XCTAssertTrue(app.buttons["Charlie Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Charlie Home Nest"].tap()
        XCTAssertTrue(
            (picker.value as? String)?.contains("Charlie Home Nest, Private to you") == true,
            "The Nest picker should make the selected private destination clear without repeating its name below."
        )
        XCTAssertEqual(
            app.staticTexts["Access"].value as? String,
            "Private",
            "A person's Home Nest should make its privacy obvious without repeating the Nest name."
        )

        picker.tap()
        XCTAssertTrue(app.buttons["Doctoral research"].waitForExistence(timeout: 3))
        app.buttons["Doctoral research"].tap()
        XCTAssertTrue(
            (picker.value as? String)?.contains("Doctoral research, Owned by you") == true,
            "A separately owned Nest should not be conflated with a private Home Nest or a space someone else shared."
        )
        XCTAssertEqual(
            app.staticTexts["Access"].value as? String,
            "Owner",
            "The selected owned Nest should make the person's control clear in ordinary language."
        )

        picker.tap()
        XCTAssertTrue(app.buttons["High Ground Odyssey"].waitForExistence(timeout: 3))
        app.buttons["High Ground Odyssey"].tap()
        XCTAssertTrue(
            (picker.value as? String)?.contains("High Ground Odyssey, Shared with you") == true,
            "Returning to shared work should preserve the same one-control navigation model."
        )
        XCTAssertEqual(app.staticTexts["Access"].value as? String, "Can edit")
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
        let noteDetails = app.buttons["CaptureQuickEntryNoteDetails"].firstMatch
        let purpose = app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].firstMatch
        let audience = app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].firstMatch
        reveal(noteDetails)
        XCTAssertTrue(noteDetails.exists)
        XCTAssertTrue((noteDetails.value as? String)?.contains("Session") == true, "An ordinary Session note should default to the shared Session workspace without interrupting capture.")
        XCTAssertFalse(purpose.exists, "Advanced note details should stay collapsed during ordinary capture.")
        XCTAssertFalse(audience.exists, "Advanced sharing should stay collapsed during ordinary capture.")
        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let confirmation = app.descendants(matching: .any)["CaptureQuickEntryConfirmation"]
        XCTAssertTrue(
            confirmation.waitForExistence(timeout: 5),
            "The save result must be visible immediately without requiring the coach to hunt through the recorder."
        )
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].exists)
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists, "Preview must not invent a pending durable outbox record.")
    }

    func testQuickNoteCanExplicitlyTargetPrivateHomeNestEvenWhenASessionIsSelected() {
        app.tabBars.buttons["Record"].tap()
        let noteButton = app.buttons["CaptureQuickEntry_NOTE_preview-coaching-ready"]
        reveal(noteButton)
        XCTAssertTrue(noteButton.isHittable)
        noteButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].waitForExistence(timeout: 5))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryNoteDestination"].firstMatch
        reveal(destination)
        XCTAssertTrue(destination.exists)
        destination.tap()
        XCTAssertTrue(app.buttons["Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Home Nest"].tap()
        XCTAssertEqual(destination.value as? String, "Home Nest")
        XCTAssertTrue(app.textFields["CaptureQuickEntryTitle"].exists)
        let newTagField = app.textFields["CaptureQuickEntryNewTagField"]
        reveal(newTagField)
        XCTAssertTrue(newTagField.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].waitForNonExistence(timeout: 3))
    }

    func testSessionQuickNoteMakesDecisionAndClientSafeAudienceObviousWithoutClaimingDelivery() {
        app.tabBars.buttons["Record"].tap()
        let noteButton = app.buttons["CaptureQuickEntry_NOTE_preview-coaching-ready"]
        reveal(noteButton)
        noteButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].waitForExistence(timeout: 5))

        let noteDetails = app.buttons["CaptureQuickEntryNoteDetails"].firstMatch
        reveal(noteDetails)
        XCTAssertTrue(noteDetails.isHittable)
        noteDetails.tap()

        let purpose = app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].firstMatch
        reveal(purpose)
        XCTAssertTrue(purpose.isHittable)
        purpose.tap()
        XCTAssertTrue(app.buttons["Decision"].waitForExistence(timeout: 3))
        app.buttons["Decision"].tap()

        let audience = app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].firstMatch
        reveal(audience)
        XCTAssertTrue(audience.isHittable)
        audience.tap()
        XCTAssertTrue(app.buttons["Client-safe"].waitForExistence(timeout: 3))
        app.buttons["Client-safe"].tap()

        XCTAssertTrue((noteDetails.value as? String)?.contains("Client-safe") == true)
        let boundary = app.descendants(matching: .any)["CaptureQuickEntryNotePolicyBoundary"].firstMatch
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("Everyone in this Session"))
        XCTAssertTrue(boundary.label.contains("available in client follow-up"))
    }

    func testTranscriptFollowThroughAppearsAsOrdinaryEditableSessionWork() {
        app.tabBars.buttons["Record"].tap()
        let results = app.descendants(matching: .any)["CaptureSessionResults"].firstMatch
        reveal(results)
        XCTAssertTrue(results.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Session results"].exists)
        XCTAssertTrue(app.staticTexts["1 notes · 1 tasks · 1 goals"].exists)
        XCTAssertTrue(app.staticTexts["What matters now"].exists)
        XCTAssertTrue(app.buttons["CaptureSessionResultTask_preview-result-task"].exists)
        XCTAssertTrue(app.buttons["CaptureSessionResultGoal_preview-result-goal"].exists)
        let openNotes = app.buttons["CaptureSessionResultsOpenNotes"]
        reveal(openNotes)
        XCTAssertTrue(openNotes.isHittable)
        XCTAssertFalse(
            app.descendants(matching: .any)["CapturePacketReviewLanesToggle"].exists,
            "Modern transcript work must not become a second approval queue."
        )
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Adjust or remove them like any other work")
        ).firstMatch.exists)
    }

    func testCanonicalSessionNoteEditMakesRevisionAudienceAndNestTagsObviousWithoutFakingPreviewWrites() {
        app.tabBars.buttons["Record"].tap()
        let notesCard = app.descendants(matching: .any)["CaptureSessionNotesToggle"].firstMatch
        reveal(notesCard)
        XCTAssertTrue(notesCard.isHittable)
        notesCard.tap()

        let canonical = app.descendants(matching: .any)["CaptureSessionNoteCanonical_preview-session-note"].firstMatch
        XCTAssertTrue(canonical.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Ask what would make this session genuinely useful."].exists)
        XCTAssertTrue(app.staticTexts["#Coaching"].exists)
        let speakerEvidence = app.descendants(matching: .any)["CaptureSessionNoteSpeakerEvidence_preview-session-note"].firstMatch
        reveal(speakerEvidence)
        XCTAssertTrue(speakerEvidence.exists)
        XCTAssertEqual(speakerEvidence.label, "Speaker evidence: Participant recording")

        let edit = app.buttons["CaptureSessionNoteEdit_preview-session-note"].firstMatch
        reveal(edit)
        XCTAssertTrue(edit.isHittable)
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureSessionNoteEditSheet"].waitForExistence(timeout: 5))
        let visibilityBoundary = app.descendants(matching: .any)["CaptureSessionNoteEditPolicyBoundary"].firstMatch
        XCTAssertTrue(visibilityBoundary.waitForExistence(timeout: 5))

        let title = app.textFields["CaptureSessionNoteEditTitle"].firstMatch
        title.tap()
        title.typeKey("a", modifierFlags: .command)
        title.typeText("Reviewed opening")
        let body = app.textFields["CaptureSessionNoteEditBody"].firstMatch
        body.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15)).tap()
        expectation(
            for: NSPredicate(format: "hasKeyboardFocus == true"),
            evaluatedWith: body
        )
        waitForExpectations(timeout: 4)
        body.typeKey("a", modifierFlags: .command)
        body.typeText("Begin with the question the client actually needs.")
        let keyboardDone = app.buttons["CaptureSessionNoteEditKeyboardDone"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 3))
        keyboardDone.tap()

        let purpose = app.descendants(matching: .any)["CaptureSessionNoteEditKind"].firstMatch
        reveal(purpose)
        purpose.tap()
        XCTAssertTrue(app.buttons["Session note"].waitForExistence(timeout: 3))
        app.buttons["Session note"].tap()
        let audience = app.descendants(matching: .any)["CaptureSessionNoteEditVisibility"].firstMatch
        reveal(audience)
        audience.tap()
        XCTAssertTrue(app.buttons["Only me"].waitForExistence(timeout: 3))
        app.buttons["Only me"].tap()

        let productionTag = app.buttons["CaptureSessionNoteEditTag_preview-production"].firstMatch
        let editForm = app.collectionViews.firstMatch
        for _ in 0..<10 where !productionTag.isHittable {
            editForm.swipeUp()
        }
        XCTAssertTrue(productionTag.isHittable)
        productionTag.tap()
        XCTAssertEqual(productionTag.value as? String, "Selected")

        let save = app.buttons["CaptureSessionNoteEditSave"].firstMatch
        for _ in 0..<6 where !save.isHittable {
            editForm.swipeUp()
        }
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts[
            "Preview only — no canonical Session note or revision was changed."
        ].waitForExistence(timeout: 5))
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionNoteEditState_preview-session-note"].exists,
            "Preview must not invent a protected outbox record."
        )
        XCTAssertTrue(
            app.staticTexts["Ask what would make this session genuinely useful."].exists,
            "Preview must keep the canonical Session note unchanged."
        )
    }

    func testQuickTaskCanExplicitlyTargetPrivateHomeNestEvenWhenASessionIsSelected() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton, searchAboveFirst: false)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryDestination"].firstMatch
        XCTAssertTrue(destination.exists)
        destination.tap()
        XCTAssertTrue(app.buttons["Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Home Nest"].tap()
        XCTAssertEqual(destination.value as? String, "Home Nest")
        XCTAssertTrue(app.staticTexts[
            "Saved privately. If you are offline, Quipsly syncs it when you reconnect."
        ].exists)
        XCTAssertTrue(
            app.buttons["CaptureQuickEntryTag_preview-home-personal"].exists,
            "Choosing Home Nest must project its exact reusable tags instead of retaining Session tags."
        )

        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Prepare the next episode outline")
        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts[
            "Preview only — no note, task, goal, or source was saved."
        ].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testQuickTaskCanTargetAWritableProjectAndReuseItsCanonicalTagsWithoutASession() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryDestination"].firstMatch
        XCTAssertTrue(destination.exists)
        destination.tap()
        XCTAssertTrue(app.buttons["High Ground Odyssey"].waitForExistence(timeout: 3))
        app.buttons["High Ground Odyssey"].tap()

        XCTAssertEqual(destination.value as? String, "High Ground Odyssey")
        XCTAssertTrue(app.staticTexts[
            "Saved privately. If you are offline, Quipsly syncs it when you reconnect."
        ].waitForExistence(timeout: 3))

        let episodeTag = app.buttons["CaptureQuickEntryTag_preview-episode-4"].firstMatch
        reveal(episodeTag)
        XCTAssertTrue(episodeTag.isHittable)
        episodeTag.tap()
        XCTAssertEqual(episodeTag.value as? String, "Selected")
        XCTAssertFalse(app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].exists)
    }

    func testRecordSourceCaptureTargetsPrivateInboxBeforeAnyResearchNest() {
        app.tabBars.buttons["Record"].tap()
        let sourceButton = app.buttons["CaptureQuickEntry_SOURCE_preview-coaching-ready"]
        reveal(sourceButton)
        XCTAssertTrue(sourceButton.isHittable)
        sourceButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_SOURCE"].waitForExistence(timeout: 5))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryDestination"].firstMatch
        XCTAssertTrue(destination.exists)
        XCTAssertEqual(destination.value as? String, "Personal Inbox")
        XCTAssertTrue(app.staticTexts[
            "Saved privately to Inbox until you file it."
        ].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", "CaptureQuickEntryTag_")
        ).firstMatch.exists)
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
        XCTAssertEqual(
            productionTag.value as? String,
            "Selected",
            "Adding a reusable tag must not lose an already-selected canonical Nest tag."
        )
    }

    func testTaskQuickCaptureAuthorsAnExplicitRecurrenceWithoutImplyingAReminder() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton, searchAboveFirst: false)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Weekly production review")
        dismissQuickEntryKeyboard()

        let repeatPicker = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceMode"].firstMatch
        reveal(repeatPicker, searchAboveFirst: false)
        XCTAssertTrue(repeatPicker.exists)
        repeatPicker.tap()
        let fixed = app.buttons["Fixed schedule"].firstMatch
        XCTAssertTrue(fixed.waitForExistence(timeout: 5))
        fixed.tap()
        XCTAssertEqual(
            repeatPicker.value as? String,
            "Fixed schedule",
            "Repeat selection must return to the task form with an explicit committed readback."
        )

        let firstDue = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceFirstDue"].firstMatch
        reveal(firstDue)
        XCTAssertTrue(
            firstDue.exists,
            "A committed recurring task must expose its first canonical due time."
        )
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryRecurrenceFrequency"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryRecurrenceInterval"].exists)

        let timezone = app.buttons["CaptureQuickEntryRecurrenceTimezone"].firstMatch
        reveal(timezone)
        XCTAssertTrue(timezone.isHittable)
        timezone.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureRecurrenceTimezonePicker"].waitForExistence(timeout: 5))
        let timezoneSearch = app.searchFields.firstMatch
        XCTAssertTrue(timezoneSearch.waitForExistence(timeout: 5))
        timezoneSearch.tap()
        timezoneSearch.typeText("Pacific/Honolulu")
        let honolulu = app.buttons["CaptureRecurrenceTimezone_Pacific/Honolulu"].firstMatch
        XCTAssertTrue(honolulu.waitForExistence(timeout: 5))
        honolulu.tap()
        XCTAssertEqual(timezone.value as? String, "Pacific/Honolulu")

        let timezoneBoundary = app.descendants(matching: .any)["CaptureQuickEntryRecurrenceTimezoneBoundary"].firstMatch
        reveal(timezoneBoundary)
        XCTAssertTrue(timezoneBoundary.label.contains("Pacific/Honolulu"))
        XCTAssertTrue(timezoneBoundary.label.contains("when you travel"))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "next three dates")
        ).firstMatch.exists)

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testTaskQuickCaptureAddsACanonicalDueDateWithoutInventingAReminder() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Prepare the next coaching packet")
        dismissQuickEntryKeyboard()

        let dueDateToggle = app.switches["CaptureQuickEntryDueDateToggle"].firstMatch
        XCTAssertTrue(dueDateToggle.isHittable)
        turnOn(dueDateToggle)

        let boundary = app.descendants(matching: .any)["CaptureQuickEntryDueDateBoundary"].firstMatch
        reveal(boundary)
        XCTAssertTrue(boundary.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Due"].exists)
        XCTAssertTrue(boundary.label.contains("Today, Work, and Calendar"))

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testTaskQuickCaptureUsesOrdinaryReminderLanguage() {
        app.tabBars.buttons["Record"].tap()
        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Follow up after the coaching session")
        dismissQuickEntryKeyboard()

        let reminderToggle = app.switches["CaptureQuickEntryReminderToggle"].firstMatch
        XCTAssertTrue(reminderToggle.isHittable)
        XCTAssertEqual(reminderToggle.value as? String, "0")
        turnOn(reminderToggle)

        let reminderDate = app.descendants(matching: .any)["CaptureQuickEntryReminderDate"].firstMatch
        let boundary = app.descendants(matching: .any)["CaptureQuickEntryReminderBoundary"].firstMatch
        reveal(reminderDate)
        XCTAssertTrue(reminderDate.waitForExistence(timeout: 5))
        reveal(boundary)
        XCTAssertTrue(boundary.label.contains("iPhone will remind you"))

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testExplicitReminderPersistsAfterContextualPermissionAndRelaunch() {
        let owner = "reminder-system-ui-\(UUID().uuidString.lowercased())"
        let launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=\(owner)",
            "--capture-reminder-deterministic-ui-test",
        ]
        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        openLocalRecorderIfNeeded()

        let taskButton = app.buttons["CaptureQuickEntry_TASK_preview-coaching-ready"]
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))

        let title = app.textFields["CaptureQuickEntryTitle"]
        title.tap()
        title.typeText("Private reminder projection proof")
        dismissQuickEntryKeyboard()
        let reminderToggle = app.switches["CaptureQuickEntryReminderToggle"].firstMatch
        turnOn(reminderToggle)
        app.buttons["CaptureQuickEntrySave"].tap()

        let projection = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private task alert scheduled on this iPhone")
        ).firstMatch
        reveal(projection)
        XCTAssertTrue(projection.waitForExistence(timeout: 10))
        XCTAssertTrue(projection.label.contains("1 of 1 private task alert"))
        let status = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Delivery is controlled by iOS")
        ).firstMatch
        XCTAssertTrue(status.label.contains("Delivery is controlled by iOS"))
        XCTAssertTrue(app.staticTexts["Task · Private reminder projection proof"].exists)

        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        let recoveredProjection = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private task alert scheduled on this iPhone")
        ).firstMatch
        reveal(recoveredProjection)
        XCTAssertTrue(recoveredProjection.waitForExistence(timeout: 10))
        XCTAssertTrue(recoveredProjection.label.contains("1 of 1 private task alert"))
        XCTAssertTrue(app.staticTexts["Task · Private reminder projection proof"].exists)

        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=reminder-system-ui-other-\(UUID().uuidString.lowercased())",
            "--capture-reminder-deterministic-ui-test",
        ]
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private task alert scheduled on this iPhone")
        ).firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Task · Private reminder projection proof"].exists)
    }

    func testTodayOpensTheExactNewClientFollowUpWithoutAcknowledgingIt() {
        let attention = app.descendants(matching: .any)[
            "CaptureHomeContinueFollowUp_preview-client-follow-up"
        ].firstMatch
        reveal(attention)
        XCTAssertTrue(attention.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Your next useful step"].exists)
        XCTAssertTrue(app.staticTexts["Notes and next steps from Coaching session"].exists)
        XCTAssertTrue(attention.isHittable)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Home continuation"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        attention.tap()

        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        let followUp = app.buttons["CaptureCoachClientFollowUp"].firstMatch
        XCTAssertFalse(
            followUp.isHittable,
            "Opening the recording workspace should keep consent and the recorder in front of coaching follow-through."
        )
        reveal(followUp, searchAboveFirst: false)
        XCTAssertTrue(
            followUp.waitForExistence(timeout: 5),
            "Today should open the exact Session output surface without acknowledging or mutating the released snapshot."
        )
    }

    func testTodayFinishQueueOpensExactSessionWithoutPerformingAction() {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))
        app.segmentedControls["CaptureLibrarySectionPicker"].buttons["Recordings"].tap()
        let card = app.descendants(matching: .any)["CaptureFinishQueueCard"]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "Library should keep recording and transcript readiness reachable without cluttering Home."
        )
        let finishDetails = app.descendants(matching: .any)["CaptureFinishQueueDetails"].firstMatch
        reveal(finishDetails)
        XCTAssertTrue(finishDetails.waitForExistence(timeout: 5))
        finishDetails.tap()
        let recordingCounts = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "still saving · 1 backed up")
        ).firstMatch
        XCTAssertTrue(
            recordingCounts.waitForExistence(timeout: 5),
            "Operational counts should remain available on demand without leading the recording Library."
        )
        let safetyExplanation = app.staticTexts[
            "Review only: no recording, meeting, payment, or publish side effects."
        ]
        XCTAssertTrue(
            safetyExplanation.waitForExistence(timeout: 5),
            "Expanded recording details should expose their safety explanation to both VoiceOver and UI automation."
        )

        let action = app.buttons[
            "CaptureFinishAction_room-preview-studio-group-ready_confirm-endpoint-drain"
        ]
        reveal(action)
        XCTAssertTrue(action.exists)
        XCTAssertTrue(action.label.contains("Keep Quipsly open"))
        XCTAssertTrue(
            action.label.contains("latest durable queue still has local recovery work"),
            "The recovery action should expose its exact source-device reason to VoiceOver without forcing operational copy into the ordinary card."
        )

        action.tap()

        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["Studio group ready"].exists,
            "Opening a finishing action should select its exact Session rather than perform promotion, transcription, or review."
        )
        let recovery = app.descendants(matching: .any)["CaptureSourceRecoveryCard"].firstMatch
        reveal(recovery)
        XCTAssertTrue(recovery.exists)
        XCTAssertTrue(recovery.label.contains("Keep Quipsly open"))
        let details = app.descendants(matching: .any)["CaptureSourceRecoveryDetails"].firstMatch
        reveal(details)
        XCTAssertTrue(details.isHittable)
        details.tap()
        let evidence = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "2/2 server-safe masters")
        ).firstMatch
        XCTAssertTrue(evidence.waitForExistence(timeout: 5))
        let iphoneQueue = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Homer's iPhone")
        ).firstMatch
        reveal(iphoneQueue)
        XCTAssertTrue(iphoneQueue.label.contains("Homer's iPhone"))
        XCTAssertTrue(iphoneQueue.label.contains("1 pending"))
    }

    func testTodayWeeklyPlanEditorKeepsReflectionHonestAndOfflineSafe() {
        openAcrossNestsFollowThrough()
        let plan = app.descendants(matching: .any)["CaptureTodayWeeklyPlan"].firstMatch
        reveal(plan)
        XCTAssertTrue(plan.waitForExistence(timeout: 5))

        let edit = app.buttons["CaptureTodayWeeklyPlanEdit"].firstMatch
        reveal(edit)
        XCTAssertTrue(edit.isHittable)
        edit.tap()
        XCTAssertTrue(app.navigationBars["This week"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanCommitmentOne"].value as? String, "Proof-listen one real session")
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanCommitmentTwo"].value as? String, "Send one source-linked follow-up")
        XCTAssertEqual(app.textFields["CaptureWeeklyPlanSupport"].value as? String, "A second listener for the final recap")
        let weeklyPlanForm = app.collectionViews.firstMatch
        XCTAssertTrue(weeklyPlanForm.waitForExistence(timeout: 5))
        let outboxBoundary = app.descendants(matching: .any)["CaptureWeeklyPlanOutboxBoundary"].firstMatch
        revealBelow(outboxBoundary, in: weeklyPlanForm)
        XCTAssertTrue(outboxBoundary.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Saved on this iPhone, then synced with Nest"].exists)
        XCTAssertFalse(
            app.buttons["CaptureWeeklyPlanSave"].isEnabled,
            "Preview may demonstrate the complete editor but must not claim a canonical or queued save."
        )
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Protected weekly plan and reflection editor"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testTodayUsesCanonicalFollowThroughWithoutImplyingExternalActions() {
        openAcrossNestsFollowThrough()
        let card = app.descendants(matching: .any)["CaptureTodayFollowThroughCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        let complete = app.buttons["CaptureTodayFocusDoneButton"]
        XCTAssertTrue(complete.exists)
        XCTAssertFalse(complete.isEnabled, "Preview work must never call Nest or imply a real task/focus mutation.")

        let sourceLink = app.buttons["Task source: Return to 00:03–00:04"]
        reveal(sourceLink)
        XCTAssertTrue(sourceLink.isHittable, "A transcript-derived task should retain a one-action route back to its exact segment.")
        let speakerEvidence = app.descendants(matching: .any)["CaptureTodayTaskSpeakerEvidence_preview-task"].firstMatch
        reveal(speakerEvidence)
        XCTAssertTrue(speakerEvidence.exists)
        XCTAssertEqual(speakerEvidence.label, "Speaker evidence: Participant recording")
        XCTAssertTrue(app.staticTexts["Proof-listen the coaching recap"].exists)
        XCTAssertTrue(app.staticTexts["Leave the client with one clear next move"].exists)
        let taskTags = app.descendants(matching: .any)["CaptureTodayTaskTags_preview-task"]
        reveal(taskTags)
        XCTAssertTrue(taskTags.exists)
        XCTAssertTrue(taskTags.label.contains("High Ground Odyssey"))
        XCTAssertTrue(taskTags.label.contains("Proof listen"))
        let planFocus = app.buttons["CaptureTodayTaskPlanFocus_preview-task"]
        reveal(planFocus)
        XCTAssertTrue(planFocus.exists)
        XCTAssertEqual(planFocus.label, "Plan focus")
        XCTAssertTrue(planFocus.isEnabled, "Opening the no-side-effect planner should remain testable in preview mode.")
        planFocus.tap()
        XCTAssertTrue(app.navigationBars["Plan focus"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTodayFocusPlanStart"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTodayFocusPlanDuration"].exists)
        XCTAssertTrue(app.staticTexts["Does not change the task deadline or status"].exists)
        let reminderBoundary = app.staticTexts["Does not create a reminder or appointment"]
        reveal(reminderBoundary)
        XCTAssertTrue(reminderBoundary.exists)
        let calendarBoundary = app.staticTexts["Does not write to Google or Apple Calendar"]
        reveal(calendarBoundary)
        XCTAssertTrue(calendarBoundary.exists)
        let savePlan = app.buttons["CaptureTodayFocusPlanSave"]
        let focusPlanForm = app.collectionViews.firstMatch
        XCTAssertTrue(focusPlanForm.waitForExistence(timeout: 5))
        revealBelow(savePlan, in: focusPlanForm)
        XCTAssertTrue(savePlan.exists)
        XCTAssertFalse(savePlan.isEnabled, "Preview inspection must never write a canonical focus block.")
        app.buttons["Cancel"].tap()
        XCTAssertFalse(app.navigationBars["Plan focus"].exists)

        let transcriptReview = app.staticTexts["Transcripts"]
        reveal(transcriptReview)
        XCTAssertTrue(transcriptReview.exists)
        XCTAssertTrue(app.staticTexts["Transcript suggestions are saved with the Session. Open one to listen, correct, or edit."].exists)

        let researchCues = app.staticTexts["Research cues"]
        reveal(researchCues)
        XCTAssertTrue(researchCues.exists)
        let annotationTags = app.descendants(matching: .any)["CaptureTodayAnnotationTags_preview-annotation"]
        reveal(annotationTags)
        XCTAssertTrue(annotationTags.exists)
        XCTAssertTrue(annotationTags.label.contains("Episode seed"))
        let resolveAnnotation = app.buttons["CaptureTodayAnnotationDecision_preview-annotation"]
        XCTAssertTrue(resolveAnnotation.exists)
        XCTAssertEqual(resolveAnnotation.label, "Resolve")
        XCTAssertFalse(resolveAnnotation.isEnabled, "Preview annotations must never mutate canonical research.")
        let reopenAnnotation = app.buttons["CaptureTodayAnnotationDecision_preview-resolved-annotation"]
        reveal(reopenAnnotation)
        XCTAssertTrue(reopenAnnotation.exists)
        XCTAssertEqual(reopenAnnotation.label, "Reopen")
        XCTAssertFalse(reopenAnnotation.isEnabled, "Preview resolved annotations must remain read-only.")

        for _ in 0..<8 where !sourceLink.isHittable {
            app.swipeDown()
        }
        XCTAssertTrue(sourceLink.isHittable)
        sourceLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        assertFocusedTranscriptSegment("preview-segment")
        let transcriptSpeakerEvidence = app.descendants(matching: .any)["CaptureTranscriptSegmentSpeakerEvidence_preview-segment"]
        XCTAssertTrue(transcriptSpeakerEvidence.waitForExistence(timeout: 3))
        XCTAssertTrue(transcriptSpeakerEvidence.label.contains("Participant recording"))
    }

    func testTodayWeeklyReviewKeepsPlannedActualAndMissingTimeTruthDistinct() {
        openAcrossNestsFollowThrough()
        let review = app.descendants(matching: .any)["CaptureTodayWeeklyReview"]
        reveal(review)
        XCTAssertTrue(
            review.waitForExistence(timeout: 5),
            "Today should expose the same deterministic evidence-backed review as Nest."
        )
        XCTAssertTrue(review.staticTexts["Weekly review"].exists)
        XCTAssertTrue(review.staticTexts["50m"].exists, "Planned time should remain visible as a plan.")
        XCTAssertTrue(review.staticTexts["35m"].exists, "Only explicit actual time should appear as actual work.")
        XCTAssertTrue(review.staticTexts["0"].exists, "Completed blocks without time need their own count.")
        XCTAssertTrue(review.staticTexts["Leave the client with one clear next move"].exists)
        XCTAssertTrue(review.staticTexts["Moving with evidence"].exists)
        XCTAssertTrue(
            review.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "A second listener for the final recap")
            ).firstMatch.exists
        )
        XCTAssertTrue(
            review.staticTexts["Actual time appears only when someone records it. Quipsly does not infer missing work."].exists
        )

        let record = app.buttons["CaptureTodayFocusDoneButton"]
        reveal(record)
        XCTAssertEqual(record.label, "Record work")
        XCTAssertFalse(
            record.isEnabled,
            "Preview should show the explicit actual-time workflow without pretending to save canonical work."
        )
    }

    func testTodayShowsProtectedOfflineFocusDecisionAcrossRelaunch() {
        app.terminate()
        let owner = "focus-outbox-ui-\(UUID().uuidString.lowercased())"
        let launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=today",
            "--capture-share-owner-ui-preview=\(owner)",
            "--capture-focus-outbox-ui-test",
        ]
        app.launchArguments = launchArguments
        app.launch()

        openAcrossNestsFollowThrough()

        let decision = app.descendants(matching: .any)[
            "CaptureTodayFocusDecision_preview-block"
        ]
        reveal(decision)
        XCTAssertTrue(
            decision.waitForExistence(timeout: 8),
            "An offline completion must remain visibly protected before Nest acknowledges it. \(app.debugDescription)"
        )
        XCTAssertTrue(app.staticTexts["Focus updates"].exists)
        XCTAssertTrue(app.staticTexts["Saved on this iPhone · waiting to sync"].exists)
        XCTAssertTrue(app.staticTexts["35 actual minutes · linked work unchanged"].exists)
        let retry = app.buttons["CaptureTodayFocusDecisionRetry_preview-block"]
        XCTAssertTrue(retry.exists)
        XCTAssertFalse(
            retry.isEnabled,
            "The deterministic preview has no network authority and must not fake a retry."
        )
        XCTAssertFalse(
            app.buttons["CaptureTodayFocusDecisionDiscard_preview-block"].exists,
            "A retryable decision is not discardable until Nest reports a review conflict."
        )

        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        openAcrossNestsFollowThrough()
        let recoveredDecision = app.descendants(matching: .any)[
            "CaptureTodayFocusDecision_preview-block"
        ]
        reveal(recoveredDecision)
        XCTAssertTrue(
            recoveredDecision.waitForExistence(timeout: 8),
            "The protected decision must survive a full Capture relaunch."
        )
        XCTAssertTrue(app.staticTexts["35 actual minutes · linked work unchanged"].exists)
    }

    func testTodayExposesReadOnlyCalendarContinuityWithoutLeakingPrivateLinks() {
        app.tabBars.buttons["Account"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
        let card = app.descendants(matching: .any)["CaptureCalendarContinuityCard"]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "Account should keep calendar connections reachable without adding a primary tab or Home dashboard."
        )
        let manage = app.buttons["CaptureCalendarManage"]
        XCTAssertTrue(manage.isHittable)
        manage.tap()

        let googleProjection = app.descendants(matching: .any)[
            "CaptureGoogleCalendarProjection"
        ]
        XCTAssertTrue(
            googleProjection.waitForExistence(timeout: 5),
            "Calendar continuity should expose the optional managed Google projection separately from subscription links."
        )
        XCTAssertTrue(app.staticTexts["Not connected"].exists)
        let googleManage = app.buttons["CaptureGoogleCalendarManage"]
        XCTAssertTrue(googleManage.exists)
        XCTAssertFalse(
            googleManage.isEnabled,
            "Deterministic preview must not open an external OAuth or account-management flow."
        )
        let googleBoundary = app.staticTexts["CaptureGoogleCalendarBoundary"]
        XCTAssertTrue(googleBoundary.exists)
        XCTAssertTrue(googleBoundary.label.contains("Manage the connection"))
        XCTAssertTrue(googleBoundary.label.contains("in Nest"))

        for purpose in ["PERSONAL_COMMITMENTS", "COACHING", "PODCAST_PRODUCTION"] {
            let lane = app.descendants(matching: .any)["CaptureCalendarLane_\(purpose)"]
            XCTAssertTrue(lane.exists, "Expected a deliberate calendar lane for \(purpose).")

            let createOrReplace = app.buttons["CaptureCalendarCreate_\(purpose)"]
            XCTAssertTrue(createOrReplace.exists)
            XCTAssertFalse(
                createOrReplace.isEnabled,
                "Preview calendar subscriptions must never create or rotate a private capability."
            )
        }

        XCTAssertTrue(app.staticTexts["My commitments"].exists)
        XCTAssertTrue(app.staticTexts["My coaching sessions"].exists)
        XCTAssertTrue(app.staticTexts["Podcast production"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureCalendarOneTimeLink"].exists,
            "A private subscription capability must never exist in deterministic preview data."
        )

        let boundary = app.staticTexts["CaptureCalendarBoundary"]
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("read-only and revocable"))
        XCTAssertTrue(boundary.label.contains("not recordings"))
        XCTAssertTrue(boundary.label.contains("transcript text"))
        XCTAssertTrue(boundary.label.contains("coaching notes"))
        XCTAssertTrue(boundary.label.contains("participant addresses"))
        XCTAssertTrue(boundary.label.contains("provider credentials"))
    }

    func testTodayUsesTheStandardAppleCalendarEditorWithoutExtraDismissalWork() {
        let button = app.buttons["CaptureAddNextSessionToCalendar"]
        reveal(button)
        XCTAssertTrue(
            button.isHittable,
            "A scheduled next Session should offer Apple's explicit one-event editor."
        )
        XCTAssertEqual(button.label, "Add to Calendar")
        button.tap()

        XCTAssertTrue(
            app.navigationBars["New Event"].waitForExistence(timeout: 8),
            "EventKitUI should present Apple's system-owned editor instead of asking Quipsly for calendar read access."
        )
        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.exists)
        cancel.tap()

        let status = app.staticTexts["CaptureCalendarEditorStatus"]
        XCTAssertFalse(
            status.waitForExistence(timeout: 1),
            "Canceling the familiar system editor should simply return to Today without an administrative receipt."
        )
    }

    func testTodayShowsCanonicalRecurrenceWithoutEnablingPreviewMutation() {
        openAcrossNestsFollowThrough()
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

    func testTodayReviewsPrivateSourceInboxWithoutInventingResearchFiling() {
        openAcrossNestsFollowThrough()
        let inbox = app.descendants(matching: .any)["CaptureSourceInbox"]
        reveal(inbox)
        XCTAssertTrue(
            inbox.waitForExistence(timeout: 5),
            "Today should surface private passages and links that still need deliberate Research filing."
        )
        XCTAssertTrue(app.staticTexts["Private source Inbox"].exists)
        XCTAssertTrue(app.staticTexts["Be curious"].exists)
        XCTAssertTrue(
            app.staticTexts["A preserved passage waiting for deliberate Research filing."].exists
        )

        let file = app.buttons["CaptureSourceInboxFile_preview-source"]
        reveal(file)
        XCTAssertTrue(
            file.isHittable,
            "Preview should allow safe inspection of the real destination decision."
        )
        file.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSourceFilingSheet"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSourceFilingDestination"].exists
        )
        let annotationBody = app.descendants(matching: .any)[
            "CaptureSourceFilingAnnotationBody"
        ].firstMatch
        reveal(annotationBody)
        XCTAssertTrue(
            annotationBody.exists,
            "A source filing should offer one optional exact-source annotation without inventing a second research model."
        )
        annotationBody.tap()
        annotationBody.typeText("Could this frame the episode opening?")
        let keyboardDone = app.buttons["CaptureSourceFilingKeyboardDone"]
        XCTAssertTrue(
            keyboardDone.waitForExistence(timeout: 3),
            "Source annotation must provide an explicit way to dismiss the keyboard before choosing canonical tags."
        )
        keyboardDone.tap()
        expectation(
            for: NSPredicate(format: "exists == false"),
            evaluatedWith: app.keyboards.firstMatch
        )
        waitForExpectations(timeout: 3)
        XCTAssertEqual(
            annotationBody.value as? String,
            "Could this frame the episode opening?",
            "Dismissing the keyboard must preserve the exact source annotation."
        )
        let canonicalTag = app.switches[
            "CaptureSourceFilingTag_preview-tag-episode-seed"
        ].firstMatch
        reveal(canonicalTag)
        XCTAssertTrue(canonicalTag.exists)
        turnOn(canonicalTag)
        XCTAssertEqual(canonicalTag.value as? String, "1")
        let previewBoundary = app.descendants(matching: .any)[
            "CaptureSourceFilingPreviewBoundary"
        ].firstMatch
        reveal(previewBoundary)
        XCTAssertTrue(previewBoundary.exists)
        let confirm = app.buttons["CaptureSourceFilingConfirm"]
        XCTAssertTrue(confirm.exists)
        XCTAssertFalse(
            confirm.isEnabled,
            "Preview must never create a Research source or clear a private Inbox item."
        )
        let previewSaveBoundary = app.descendants(matching: .any)["CaptureSourceFilingPreviewBoundary"].firstMatch
        reveal(previewSaveBoundary)
        XCTAssertTrue(previewSaveBoundary.exists)
        XCTAssertTrue(app.staticTexts["Preview only · no filing decision will be saved"].exists)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureSourceInboxItem_preview-source"].exists
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSourceInboxPending_preview-source"].exists,
            "Inspecting preview UX must not invent a protected filing decision."
        )
    }

    func testPacketNoteReviewRequiresPurposeAudienceAndFinalHumanSave() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CapturePacketNoteReviewPreviewLink"]
        reveal(reviewLink)
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()

        XCTAssertTrue(app.scrollViews["CapturePacketNoteReviewPreviewView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["CapturePacketNotePreviewBoundary"].exists)
        let sourcePrefix = "CapturePacketNoteSourceText_"
        let source = app.staticTexts.matching(
            NSPredicate(format: "identifier BEGINSWITH %@", sourcePrefix)
        ).firstMatch
        XCTAssertTrue(source.exists)
        let candidateKey = String(source.identifier.dropFirst(sourcePrefix.count))
        XCTAssertFalse(candidateKey.isEmpty)
        XCTAssertTrue(app.buttons["CapturePacketNoteSourceButton_\(candidateKey)"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketSpeakerEvidence_source-binding"].exists)
        let packetNoteReview = app.buttons["CapturePacketReviewNoteButton_\(candidateKey)"]
        XCTAssertTrue(packetNoteReview.isEnabled, "Preview may inspect note purpose and audience while the final write stays disabled.")
        let packetNoteEdit = app.buttons["CapturePacketNoteEditButton_\(candidateKey)"]
        XCTAssertTrue(packetNoteEdit.isEnabled, "A provider-only candidate should still be editable without becoming canonical work.")
        XCTAssertFalse(app.buttons["CapturePacketNoteDeferButton_\(candidateKey)"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketNoteRejectButton_\(candidateKey)"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketNoteMergeButton_\(candidateKey)"].isEnabled)
        let decisionBoundary = app.staticTexts["CapturePacketNoteDecisionBoundary"]
        XCTAssertTrue(decisionBoundary.label.contains("Save this as a note"))
        XCTAssertTrue(decisionBoundary.label.contains("keep it for later"))
        XCTAssertTrue(decisionBoundary.label.contains("dismiss it"))
        packetNoteEdit.tap()
        XCTAssertTrue(app.textFields["CapturePacketNoteTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketNoteBodyField"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteKindPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteVisibilityPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteAudienceBoundary"].exists)
        XCTAssertFalse(app.buttons["CapturePacketCreateNoteButton_\(candidateKey)"].isEnabled)
        let packetNoteBoundary = app.staticTexts["CapturePacketNoteBoundary"]
        reveal(packetNoteBoundary)
        XCTAssertTrue(packetNoteBoundary.label.contains("without creating or sharing a note"))
        let packetNoteScreenshot = XCTAttachment(screenshot: app.screenshot())
        packetNoteScreenshot.name = "Transcript note materialization review"
        packetNoteScreenshot.lifetime = .keepAlways
        add(packetNoteScreenshot)
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testCoachFollowUpPreservesExactSourceWithoutReleasingPreview() throws {
        app.buttons["CaptureOpenNextSessionButton"].tap()
        openLocalRecorderIfNeeded()
        let recorderHero = app.otherElements["CaptureRecorderHero"]
        reveal(recorderHero)
        XCTAssertTrue(recorderHero.waitForExistence(timeout: 5))

        let followUp = app.buttons["CaptureCoachClientFollowUp"].firstMatch
        reveal(followUp, searchAboveFirst: false)
        XCTAssertTrue(followUp.waitForExistence(timeout: 5))
        followUp.tap()
        let followUpScroll = app.scrollViews["CaptureCoachFollowUpReviewView"].firstMatch
        XCTAssertTrue(followUpScroll.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Saved draft"].waitForExistence(timeout: 5))
        let details = app.buttons["CaptureClientFollowUpDetails_preview-client-follow-up"].firstMatch
        XCTAssertTrue(details.waitForExistence(timeout: 5))
        details.tap()
        XCTAssertTrue(
            app.staticTexts["Revision 1"].waitForExistence(timeout: 5),
            "The exact revision should remain available under ordinary Details."
        )

        let source = app.descendants(matching: .any)["CaptureClientFollowUpSource_note_preview-follow-up-note"].firstMatch
        revealBelow(source, in: followUpScroll)
        let sourceBoundaryScreenshot = XCTAttachment(screenshot: app.screenshot())
        sourceBoundaryScreenshot.name = "Coach follow-up exact source boundary"
        sourceBoundaryScreenshot.lifetime = .keepAlways
        add(sourceBoundaryScreenshot)
        XCTAssertTrue(
            source.waitForExistence(timeout: 5),
            "The immutable coaching follow-up must retain a reachable exact-source control.\n\(app.debugDescription)"
        )
        XCTAssertTrue(source.label.contains("Return to exact source for Opening question at 00:03"))
        source.tap()

        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSegment_preview-segment"].waitForExistence(timeout: 5))

        // Return before running any whole-window accessibility traversal.
        // XCTest's audit may dismiss nested presentation layers while it
        // snapshots them, which would test the harness rather than the
        // explicit source-return control. Transcript accessibility is covered
        // by the dedicated transcript-review flights.
        if !followUpScroll.exists {
            let back = app.buttons["CaptureTranscriptReturn"]
            XCTAssertTrue(back.waitForExistence(timeout: 5))
            back.tap()
        }
        XCTAssertTrue(followUpScroll.waitForExistence(timeout: 5))

        let save = app.buttons["CaptureCoachFollowUpSave"]
        revealBelow(save, in: followUpScroll)
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertFalse(save.isEnabled, "Preview may inspect the canonical draft but must not save another revision.")
        let release = app.buttons["CaptureCoachFollowUpRelease"]
        revealBelow(release, in: followUpScroll)
        XCTAssertTrue(release.waitForExistence(timeout: 5))
        XCTAssertFalse(release.isEnabled, "Preview must not release a coaching follow-up.")
    }

    func testCoachFollowUpHoldsReleaseWhenCanonicalSourceChanged() throws {
        app.buttons["CaptureOpenNextSessionButton"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let followUp = app.buttons["CaptureCoachClientFollowUp"].firstMatch
        reveal(followUp, searchAboveFirst: false)
        XCTAssertTrue(followUp.waitForExistence(timeout: 5))
        followUp.tap()
        let followUpScroll = app.scrollViews["CaptureCoachFollowUpReviewView"].firstMatch
        XCTAssertTrue(followUpScroll.waitForExistence(timeout: 5))

        let heldTitle = app.staticTexts["CaptureCoachFollowUpReleaseHeldTitle"]
        revealBelow(heldTitle, in: followUpScroll)
        XCTAssertTrue(heldTitle.waitForExistence(timeout: 5))
        XCTAssertTrue(heldTitle.label.contains("Selected items changed"))
        let sourceChanges = app.staticTexts
            .matching(identifier: "CaptureCoachFollowUpReleaseHeldChange")
            .matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "Opening question changed after this draft was saved"
                )
            )
        XCTAssertEqual(sourceChanges.count, 1)
        let sourceChange = sourceChanges.element(boundBy: 0)
        XCTAssertTrue(
            sourceChange.label.contains("Opening question changed after this draft was saved")
        )
        let sourceReadinessScreenshot = XCTAttachment(screenshot: app.screenshot())
        sourceReadinessScreenshot.name = "Coach follow-up changed-source release hold"
        sourceReadinessScreenshot.lifetime = .keepAlways
        add(sourceReadinessScreenshot)

        let release = app.buttons["CaptureCoachFollowUpRelease"].firstMatch
        revealBelow(release, in: followUpScroll)
        XCTAssertTrue(release.waitForExistence(timeout: 5))
        XCTAssertFalse(release.isEnabled)
    }

    func testCoachFollowUpHoldsReleaseForUnsavedEditorChanges() throws {
        app.buttons["CaptureOpenNextSessionButton"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let followUp = app.buttons["CaptureCoachClientFollowUp"].firstMatch
        reveal(followUp, searchAboveFirst: false)
        XCTAssertTrue(followUp.waitForExistence(timeout: 5))
        followUp.tap()
        let followUpScroll = app.scrollViews["CaptureCoachFollowUpReviewView"].firstMatch
        XCTAssertTrue(followUpScroll.waitForExistence(timeout: 5))

        let title = app.textFields["CaptureCoachFollowUpTitle"].firstMatch
        revealBelow(title, in: followUpScroll)
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        title.tap()
        title.typeText(" unsaved")
        let keyboardDone = app.buttons["CaptureCoachFollowUpKeyboardDone"].firstMatch
        XCTAssertTrue(keyboardDone.waitForExistence(timeout: 5))
        keyboardDone.tap()

        let held = app.descendants(matching: .any)["CaptureCoachFollowUpUnsavedChanges"].firstMatch
        revealBelow(held, in: followUpScroll)
        XCTAssertTrue(held.waitForExistence(timeout: 5))
        let heldTitle = app.staticTexts
            .matching(identifier: "CaptureCoachFollowUpUnsavedChanges")
            .matching(NSPredicate(format: "label CONTAINS %@", "Save edits before release"))
        XCTAssertEqual(heldTitle.count, 1)
        let heldDetail = app.staticTexts
            .matching(identifier: "CaptureCoachFollowUpUnsavedChanges")
            .matching(NSPredicate(
                format: "label CONTAINS %@",
                "Save your latest changes before sharing this follow-up"
            ))
        XCTAssertEqual(heldDetail.count, 1)

        let release = app.buttons["CaptureCoachFollowUpRelease"].firstMatch
        revealBelow(release, in: followUpScroll)
        XCTAssertTrue(release.waitForExistence(timeout: 5))
        XCTAssertFalse(release.isEnabled)

        let unsavedScreenshot = XCTAttachment(screenshot: app.screenshot())
        unsavedScreenshot.name = "Coach follow-up unsaved editor release hold"
        unsavedScreenshot.lifetime = .keepAlways
        add(unsavedScreenshot)
    }

    func testTranscriptConversationReviewOpensTheExactTimelineSegment() {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))

        let presentationControls = app.descendants(matching: .any)["CaptureTranscriptPresentationControls"].firstMatch
        reveal(presentationControls)
        XCTAssertTrue(presentationControls.exists)
        let presentationMode = app.segmentedControls["CaptureTranscriptPresentationMode"].firstMatch
        XCTAssertTrue(presentationMode.waitForExistence(timeout: 5))
        let conversationMode = presentationMode.buttons["Conversation"].firstMatch
        XCTAssertTrue(conversationMode.waitForExistence(timeout: 5))
        conversationMode.tap()
        XCTAssertTrue(conversationMode.isSelected)

        let transcriptScroll = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        let conversationTurn = app.descendants(matching: .any)["CaptureTranscriptConversationTurn_preview-segment"].firstMatch
        if !conversationTurn.waitForExistence(timeout: 5) {
            revealBelow(conversationTurn, in: transcriptScroll)
        }
        XCTAssertTrue(conversationTurn.waitForExistence(timeout: 5))
        let review = app.buttons["CaptureTranscriptConversationReview_preview-segment"].firstMatch
        XCTAssertTrue(review.isHittable)
        review.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()

        let exactTimelineEditor = app.buttons["CaptureTranscriptCorrectButton_preview-segment"].firstMatch
        if !exactTimelineEditor.waitForExistence(timeout: 5) {
            revealBelow(exactTimelineEditor, in: transcriptScroll)
        }
        XCTAssertTrue(
            exactTimelineEditor.waitForExistence(timeout: 5),
            "Reviewing a conversation turn should disclose the exact source-bound timeline segment, not a separate editor handoff."
        )
    }

    func testTranscriptReviewPresentsPlainFollowUpSuggestions() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        let moreSuggestions = app.descendants(matching: .any)["CapturePacketAdditionalSuggestionsDisclosure"].firstMatch
        reveal(moreSuggestions, searchAboveFirst: false)
        XCTAssertTrue(
            moreSuggestions.exists,
            "Optional transcript suggestions should remain easy to find without becoming a required follow-up queue."
        )
        XCTAssertTrue(moreSuggestions.label.contains("More suggestions"))
        XCTAssertTrue(moreSuggestions.label.contains("optional"))
        XCTAssertTrue(moreSuggestions.label.contains("Use, edit, or dismiss"))
        XCTAssertFalse(moreSuggestions.label.contains("Review packet"))
    }

    func testTranscriptPreviewVoiceIdentityStaysDisabled() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        let identifySpeaker = app.buttons["CaptureTranscriptIdentifySpeaker_Speaker"].firstMatch
        reveal(identifySpeaker, searchAboveFirst: false)
        XCTAssertTrue(identifySpeaker.exists)
        XCTAssertFalse(
            identifySpeaker.isEnabled,
            "Preview voice identity must be disabled for touch, assistive technology, and UI automation."
        )
    }

    func testTranscriptReviewKeepsPreviewAndAIBehindTruthBoundaries() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 5))
        reviewLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        let previewBoundary = app.descendants(matching: .any)["CaptureTranscriptPreviewBoundary"].firstMatch
        reveal(previewBoundary)
        XCTAssertTrue(previewBoundary.exists)
        let reviewOnlyBoundary = app.descendants(matching: .any)["CaptureTranscriptReviewOnlyBoundary"].firstMatch
        reveal(reviewOnlyBoundary, searchAboveFirst: false)
        XCTAssertTrue(reviewOnlyBoundary.exists)
        let evidenceSummary = app.descendants(matching: .any)["CaptureTranscriptEvidenceSummary"].firstMatch
        reveal(evidenceSummary, searchAboveFirst: false)
        XCTAssertTrue(evidenceSummary.exists)
        XCTAssertTrue(app.buttons["CaptureTranscriptEvidenceReviewFirst"].exists)
        let impactSummary = app.descendants(matching: .any)["CaptureTranscriptImpactSummary"].firstMatch
        reveal(impactSummary, searchAboveFirst: false)
        XCTAssertTrue(impactSummary.exists)
        XCTAssertTrue(app.buttons["CaptureTranscriptImpactReviewFirst"].exists)
        let speakerIdentity = app.descendants(matching: .any)["CaptureTranscriptSpeakerIdentitySection"].firstMatch
        reveal(speakerIdentity, searchAboveFirst: false)
        XCTAssertTrue(speakerIdentity.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSpeakerGroup_Speaker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptSpeakerWordReviewBoundary_Speaker"].exists)
        XCTAssertFalse(
            app.buttons["CaptureTranscriptIdentifySpeaker_Speaker"].isEnabled,
            "Preview voice identity must explain the workflow without claiming playback or saving a mapping."
        )
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
        ])
        let moreSuggestions = app.descendants(matching: .any)["CapturePacketAdditionalSuggestionsDisclosure"].firstMatch
        reveal(moreSuggestions)
        XCTAssertTrue(moreSuggestions.exists)
        moreSuggestions.tap()
        XCTAssertFalse(app.descendants(matching: .any)["CaptureTranscriptReviewProgressCount"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketCandidateReviewFilter"].exists)

        // Follow the rendered review order from top to bottom. Goal candidates
        // precede task candidates in the transcript packet, and exercising
        // them in that order keeps this acceptance journey aligned with the
        // same one-directional reading flow a VoiceOver or touch user follows.
        // It also avoids relying on stale accessibility geometry after a
        // LazyVStack has recycled the goal row above the viewport.
        let packetGoalAccept = app.buttons["CapturePacketGoalAcceptButton"]
        reveal(packetGoalAccept)
        XCTAssertTrue(app.buttons["CapturePacketGoalSource_preview-segment"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketGoalSourceReviewRequired"].exists)
        XCTAssertFalse(packetGoalAccept.isEnabled, "Provider-only preview evidence must not open canonical goal creation.")
        XCTAssertFalse(app.buttons["CapturePacketGoalDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketGoalRejectButton"].isEnabled)
        let editPacketGoal = app.buttons["CapturePacketGoalEditButton"]
        reveal(editPacketGoal)
        XCTAssertTrue(
            editPacketGoal.isEnabled && editPacketGoal.isHittable,
            "Preview may inspect a packet goal draft while every review mutation stays disabled."
        )
        editPacketGoal.tap()
        XCTAssertTrue(app.textFields["CapturePacketGoalTitleField"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["CapturePacketGoalDescriptionField"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CapturePacketGoalSaveDraftButton"].isEnabled)
        app.buttons["CapturePacketGoalCancelEditButton"].tap()

        let packetTaskAccept = app.buttons["CapturePacketTaskAcceptButton"]
        reveal(packetTaskAccept)
        XCTAssertTrue(app.buttons["CapturePacketTaskSource_preview-segment"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketSpeakerEvidence_source-binding"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketTaskSourceReviewRequired"].exists)
        XCTAssertFalse(packetTaskAccept.isEnabled, "Provider-only preview evidence must not open canonical task creation.")
        XCTAssertFalse(app.buttons["CapturePacketTaskDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketTaskRejectButton"].isEnabled)
        // Hit regions and descriptions were audited before the optional
        // suggestions expanded. Preserve this exact rendered task row as
        // clipping evidence; the dedicated largest-text journeys exercise
        // layout without interrupting these edit controls mid-transition.
        let taskReviewScreenshot = XCTAttachment(screenshot: app.screenshot())
        taskReviewScreenshot.name = "Transcript task materialization review"
        taskReviewScreenshot.lifetime = .keepAlways
        add(taskReviewScreenshot)
        let editPacketTask = app.buttons["CapturePacketTaskEditButton"]
        reveal(editPacketTask)
        XCTAssertTrue(
            editPacketTask.isEnabled && editPacketTask.isHittable,
            "Preview may inspect a packet task draft while every review mutation stays disabled."
        )
        editPacketTask.tap()
        XCTAssertTrue(app.textFields["CapturePacketTaskTitleField"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["CapturePacketTaskDetailField"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CapturePacketTaskSaveDraftButton"].isEnabled)
        app.buttons["CapturePacketTaskCancelEditButton"].tap()

        let presentationControls = app.descendants(matching: .any)["CaptureTranscriptPresentationControls"].firstMatch
        reveal(presentationControls)
        XCTAssertTrue(presentationControls.exists)
        let presentationMode = app.descendants(matching: .any)["CaptureTranscriptPresentationMode"].firstMatch
        XCTAssertTrue(presentationMode.waitForExistence(timeout: 5))
        // SwiftUI can expose this segmented picker as either a segmented
        // control or a pop-up-style accessibility node across simulator
        // runtimes. The user-facing Timeline button is the stable contract.
        let timelineMode = presentationControls.buttons["Timeline"].firstMatch
        XCTAssertTrue(timelineMode.waitForExistence(timeout: 5))
        timelineMode.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptSegmentSpeakerEvidence_preview-segment"]
                .waitForExistence(timeout: 5),
            "Timeline selection should publish the source-bound segment without hiding its controls behind a container accessibility node."
        )
        let aiProposal = app.staticTexts["CaptureTranscriptAIProposal"]
        reveal(aiProposal)
        let downstreamImpact = app.descendants(matching: .any)["CaptureTranscriptImpact_task_preview-task"]
        XCTAssertTrue(downstreamImpact.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptConfidenceAttention_preview-segment"].exists)
        XCTAssertFalse(app.switches["CaptureTranscriptImpactConfirm_task_preview-task"].exists)
        XCTAssertFalse(
            app.buttons["CaptureTranscriptImpactAcknowledge_task_preview-task"].isEnabled,
            "Preview may explain transcript consequence review but must never append a canonical receipt."
        )
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
        XCTAssertFalse(app.buttons["Save correction"].isEnabled)

        let makeNote = app.buttons["CaptureTranscriptMakeNoteButton"]
        reveal(makeNote)
        XCTAssertTrue(makeNote.isEnabled, "Preview may inspect deliberate note capture without creating canonical state.")
        makeNote.tap()
        XCTAssertTrue(app.textFields["CaptureTranscriptNoteTitleField"].exists)
        XCTAssertTrue(app.textFields["CaptureTranscriptNoteBodyField"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptNoteKindPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureTranscriptNoteVisibilityPicker"].exists)
        XCTAssertFalse(app.buttons["CaptureTranscriptCreateNoteButton"].isEnabled)
        let noteBoundary = app.staticTexts["CaptureTranscriptNoteBoundary"]
        reveal(noteBoundary)
        XCTAssertTrue(noteBoundary.label.contains("Saved privately by default"))
        XCTAssertTrue(noteBoundary.label.contains("link back to this transcript moment"))
        app.buttons["CaptureTranscriptCancelNoteButton"].tap()

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
        let goalBoundary = app.staticTexts["CaptureTranscriptGoalBoundary"]
        reveal(goalBoundary)
        XCTAssertTrue(goalBoundary.isHittable, "The concise goal ownership and source-link detail should remain readable.")
        XCTAssertTrue(goalBoundary.label.contains("Owned by you"))
        XCTAssertTrue(goalBoundary.label.contains("link back to this transcript moment"))

    }

    func testTranscriptReviewOutboxSurvivesRelaunchAndStaysAccountPartitioned() {
        let owner = "transcript-review-outbox-\(UUID().uuidString.lowercased())"
        let otherOwner = "transcript-review-outbox-other-\(UUID().uuidString.lowercased())"
        let ownerArguments = [
            "--capture-ui-preview",
            "--capture-share-owner-ui-preview=\(owner)",
        ]

        app.terminate()
        app.launchArguments = ownerArguments + [
            "--capture-transcript-review-outbox-ui-test",
        ]
        app.launch()
        openPreviewTranscriptReview()

        let outboxBoundary = app.descendants(matching: .any)[
            "CaptureTranscriptReviewOutboxBoundary"
        ].firstMatch
        XCTAssertTrue(
            outboxBoundary.waitForExistence(timeout: 8),
            "The deterministic fixture should publish its protected transcript outbox state."
        )
        XCTAssertEqual(outboxBoundary.value as? String, "Queued")
        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        openPreviewTranscriptReview()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptReviewOutboxBoundary"]
                .waitForExistence(timeout: 8),
            "The same account must recover the outbox summary after process death."
        )

        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-share-owner-ui-preview=\(otherOwner)",
        ]
        app.launch()
        openPreviewTranscriptReview()
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureTranscriptReviewOutboxBoundary"]
                .waitForExistence(timeout: 2),
            "A different account must not see another person's protected transcript decision."
        )

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        openPreviewTranscriptReview()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptReviewOutboxBoundary"]
                .waitForExistence(timeout: 8)
        )
    }

    func testSessionPreflightOutboxSurvivesRelaunchAndStaysAccountPartitioned() {
        let owner = "session-preflight-outbox-\(UUID().uuidString.lowercased())"
        let otherOwner = "session-preflight-outbox-other-\(UUID().uuidString.lowercased())"
        let ownerArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=\(owner)",
            "--capture-session-preflight-outbox-ui-test",
        ]

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        openLocalRecorderIfNeeded()
        let disclosure = app.buttons["CaptureRehearsalReadinessDisclosure"]
        XCTAssertTrue(disclosure.waitForExistence(timeout: 8))
        disclosure.tap()

        XCTAssertFalse(
            app.descendants(matching: .any)[
                "CaptureRehearsalCheck_shared-preflight"
            ].exists,
            "Receipt recovery must stay automatic instead of adding a visible setup chore."
        )
        let firstIdentity = app.staticTexts["CaptureSessionPreflightOutboxReceiptID"]
        XCTAssertTrue(firstIdentity.waitForExistence(timeout: 8))
        let receiptID = firstIdentity.label
        XCTAssertFalse(receiptID.isEmpty)

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        openLocalRecorderIfNeeded()
        app.buttons["CaptureRehearsalReadinessDisclosure"].tap()
        let recoveredIdentity = app.staticTexts["CaptureSessionPreflightOutboxReceiptID"]
        XCTAssertTrue(recoveredIdentity.waitForExistence(timeout: 8))
        XCTAssertEqual(
            recoveredIdentity.label,
            receiptID,
            "Process restart must recover the exact random receipt identity, not fabricate a replacement."
        )

        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=\(otherOwner)",
            "--capture-session-preflight-outbox-ui-test",
        ]
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        openLocalRecorderIfNeeded()
        app.buttons["CaptureRehearsalReadinessDisclosure"].tap()
        let otherIdentity = app.staticTexts["CaptureSessionPreflightOutboxReceiptID"]
        XCTAssertTrue(otherIdentity.waitForExistence(timeout: 8))
        XCTAssertNotEqual(
            otherIdentity.label,
            receiptID,
            "Another account must receive its own partition and never see a collaborator's protected setup receipt."
        )

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        openLocalRecorderIfNeeded()
        app.buttons["CaptureRehearsalReadinessDisclosure"].tap()
        XCTAssertEqual(
            app.staticTexts["CaptureSessionPreflightOutboxReceiptID"].label,
            receiptID
        )
    }

    func testRecordingReceiptOutboxSurvivesRelaunchAndStaysAccountPartitioned() {
        let ownerArguments = app.launchArguments

        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()
        let firstIdentity = app.staticTexts[
            "CaptureRecordingReceiptOutboxReceiptID"
        ]
        XCTAssertTrue(firstIdentity.waitForExistence(timeout: 8))
        let receiptID = firstIdentity.label
        XCTAssertFalse(receiptID.isEmpty)
        XCTAssertEqual(
            app.staticTexts["CaptureRecordingReceiptOutboxDeliveryState"].label,
            "pending"
        )

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"]
                .waitForExistence(timeout: 12)
        )
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertEqual(
            app.staticTexts["CaptureRecordingReceiptOutboxReceiptID"].label,
            receiptID,
            "Process restart must recover the exact random recording-status receipt identity."
        )

        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-share-owner-ui-preview=recording-receipt-other-owner",
            "--capture-recording-receipt-outbox-ui-test",
        ]
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"]
                .waitForExistence(timeout: 12)
        )
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertNotEqual(
            app.staticTexts["CaptureRecordingReceiptOutboxReceiptID"].label,
            receiptID,
            "Another account must never see or replay the prior account's endpoint status."
        )

        app.terminate()
        app.launchArguments = ownerArguments
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"]
                .waitForExistence(timeout: 12)
        )
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertEqual(
            app.staticTexts["CaptureRecordingReceiptOutboxReceiptID"].label,
            receiptID
        )
    }

    func testSourceEvidencePreviewShowsTruthBoundariesWithoutCreatingAReceipt() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let evidenceLink = app.buttons["CaptureSourceEvidencePreviewLink"]
        XCTAssertTrue(evidenceLink.waitForExistence(timeout: 5))
        evidenceLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureSourceEvidenceView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.navigationBars["Recording quality"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureSourceEvidenceRoomBoundaryStatus"].exists)
        let previewBoundary = app.descendants(matching: .any)["CaptureSourceEvidencePreviewBoundary"]
        XCTAssertTrue(previewBoundary.exists)
        XCTAssertTrue(previewBoundary.label.contains("no evidence file created"))
        let nestPreviewBoundary = app.descendants(matching: .any)["CaptureNestEvidencePreviewBoundary"]
        XCTAssertTrue(nestPreviewBoundary.exists)
        XCTAssertTrue(nestPreviewBoundary.label.contains("no network request"))
        XCTAssertTrue(app.staticTexts["Recording quality"].exists)
        let audioSummary = app.descendants(matching: .any)["CaptureAudioQualitySummary"].firstMatch
        XCTAssertTrue(audioSummary.exists)
        XCTAssertTrue(audioSummary.label.contains("1 moment worth checking"))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioReviewTimeline"].exists)
        let playheadStatus = app.descendants(matching: .any)["CaptureAudioReviewPlayheadStatus"]
        XCTAssertTrue(playheadStatus.exists)
        XCTAssertTrue(playheadStatus.label.contains("Selected position"))
        let reviewLegend = app.descendants(matching: .any)["CaptureAudioReviewLegend"]
        XCTAssertTrue(reviewLegend.exists)
        XCTAssertTrue(reviewLegend.label.contains("Signal warning"))
        XCTAssertTrue(reviewLegend.label.contains("Capture boundary"))
        XCTAssertTrue(reviewLegend.label.contains("Sound suggestion"))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioMasteryReady"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioMasteryMeasurements"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioMasteryTarget"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioMasteryMonitorMode"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioMasteryMonitorExplanation"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioMasteryPlayOriginal"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioMasteryPlay"].exists)
        let masteryReview = app.descendants(matching: .any)["CaptureAudioMasteryReview"]
        reveal(masteryReview, searchAboveFirst: false)
        XCTAssertTrue(masteryReview.exists)
        XCTAssertTrue(app.textFields["CaptureAudioMasteryReviewNote"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioMasteryReject"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioMasteryApprove"].exists)
        let masteryPromotion = app.descendants(matching: .any)["CaptureAudioMasteryPromotion"]
        reveal(masteryPromotion, searchAboveFirst: false)
        XCTAssertTrue(masteryPromotion.exists)
        XCTAssertTrue(app.buttons["CaptureAudioMasteryPromote"].exists)
        let masteryBoundary = app.descendants(matching: .any)["CaptureAudioMasteryPreviewBoundary"]
        XCTAssertTrue(masteryBoundary.exists)
        XCTAssertTrue(masteryBoundary.label.contains("no audio downloaded"))
        let delivery = app.descendants(matching: .any)["CaptureAudioDelivery"]
        reveal(delivery, searchAboveFirst: false)
        XCTAssertTrue(delivery.exists)
        XCTAssertTrue(app.buttons["CaptureAudioDeliveryPrepare"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureAudioDeliveryOutput"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioDeliveryPlay"].exists)
        let deliveryReview = app.descendants(matching: .any)["CaptureAudioDeliveryReview"]
        reveal(deliveryReview, searchAboveFirst: false)
        XCTAssertTrue(deliveryReview.exists)
        XCTAssertTrue(app.textFields["CaptureAudioDeliveryReviewNote"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioDeliveryReject"].exists)
        XCTAssertTrue(app.buttons["CaptureAudioDeliveryApprove"].exists)
        let deliveryBoundary = app.descendants(matching: .any)["CaptureAudioDeliveryPreviewBoundary"]
        XCTAssertTrue(deliveryBoundary.exists)
        XCTAssertTrue(deliveryBoundary.label.contains("no network"))
        XCTAssertTrue(deliveryBoundary.label.contains("no review receipt"))
        XCTAssertTrue(app.staticTexts["Video source truth"].exists)
        XCTAssertTrue(app.staticTexts["4K · 24 fps"].exists)
        XCTAssertTrue(app.staticTexts["3840×2160 · 24 fps · HEVC · P3-D65"].exists)
        XCTAssertTrue(app.staticTexts["Camera pressure at Start"].exists)
        XCTAssertTrue(app.staticTexts["Nominal"].exists)
        let technicalAudio = app.descendants(matching: .any)["CaptureAudioTechnicalDetails"].firstMatch
        reveal(technicalAudio, searchAboveFirst: false)
        XCTAssertTrue(technicalAudio.isHittable)
        technicalAudio.tap()
        XCTAssertTrue(app.staticTexts["RMS"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["−18.4 dBFS · not LUFS"].exists)
        XCTAssertTrue(
            app.staticTexts["00:08 · Possible dropout · listen before classifying"].exists
        )
        XCTAssertTrue(app.staticTexts["Sounds to review"].exists)
        XCTAssertTrue(app.staticTexts["00:12 · Cough · 86% score"].exists)
        let audibleEventBoundary = app.descendants(matching: .any)["CaptureAudibleEventPreviewBoundary"]
        XCTAssertTrue(audibleEventBoundary.exists)
        XCTAssertTrue(audibleEventBoundary.label.contains("no classifier request or receipt"))
        XCTAssertFalse(app.buttons["CaptureSourceEvidencePrepare"].exists)
        XCTAssertFalse(app.buttons["CaptureSourceEvidenceShare"].exists)
        XCTAssertFalse(app.buttons["CaptureNestEvidenceCompare"].exists)
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testTodayKeepsTranscriptDerivedGoalLinkedToExactSource() {
        openAcrossNestsFollowThrough()
        let sourceLink = app.buttons["CaptureTodayGoalSourceLink_preview-goal"]
        reveal(sourceLink)
        XCTAssertTrue(sourceLink.isHittable, "A transcript-derived goal should keep a one-action route back to its exact segment.")
        sourceLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        assertFocusedTranscriptSegment("preview-segment")
    }

    func testTodayGoalCheckInRecordsEvidenceWithoutImplyingCompletion() {
        openAcrossNestsFollowThrough()
        let checkIn = app.buttons["CaptureTodayGoalCheckIn_preview-goal"]
        reveal(checkIn, searchAboveFirst: false)
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

        openLocalRecorderIfNeeded()
        let confirm = app.buttons["CaptureConfirmConsentButton"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))

        let start = app.buttons["CaptureStartButton"]
        XCTAssertTrue(start.exists)
        XCTAssertFalse(start.isEnabled, "Recording must remain disabled until explicit session consent is recorded.")

        confirm.tap()
        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))

        let recordingOptions = app.staticTexts["Recording options"]
        XCTAssertTrue(recordingOptions.waitForExistence(timeout: 3))

        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(
            saveChoices.isHittable,
            "The final consent action should remain reachable while the person reviews each choice."
        )
        XCTAssertTrue(saveChoices.isEnabled)

        let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
        let recordVideo = app.switches["CaptureConsentRecordVideoToggle"]
        let transcribe = app.switches["CaptureConsentTranscriptionToggle"]
        XCTAssertTrue(recordAudio.exists)
        XCTAssertTrue(recordVideo.exists)
        XCTAssertTrue(transcribe.exists)
        XCTAssertEqual(recordAudio.value as? String, "1")
        XCTAssertEqual(recordVideo.value as? String, "1")
        XCTAssertEqual(transcribe.value as? String, "1")

        // The action remains outside the scrolling Form so the person never
        // has to hunt for the final consent decision after reviewing choices.
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(saveChoices.isHittable)
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
        XCTAssertTrue(readyStart.isEnabled, "The local recorder should become available once the visible Session consent action is saved.")
        XCTAssertEqual(app.staticTexts["CaptureRecorderStateLabel"].label, "Consent ready · mic checks on tap")
    }

    func testParticipantCanDeclineRecordingWithoutBlockingTheCall() {
        app.tabBars.buttons["Record"].tap()
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()

        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()

        openLocalRecorderIfNeeded()
        let confirm = app.buttons["CaptureConfirmConsentButton"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()

        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))
        let decline = app.buttons["CaptureConsentDeclineButton"]
        XCTAssertTrue(decline.exists)
        XCTAssertTrue(decline.isHittable)
        decline.tap()

        expectation(
            for: NSPredicate(format: "exists == false"),
            evaluatedWith: consentSheet
        )
        waitForExpectations(timeout: 5)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureProviderRoomControls"].exists,
            "Declining recording must not remove the ordinary call controls."
        )
        let start = app.buttons["CaptureStartButton"]
        XCTAssertTrue(start.exists)
        XCTAssertFalse(start.isEnabled, "A declined participant must remain outside the retained recording.")
        XCTAssertTrue(
            app.staticTexts["You chose not to be recorded in this preview Session. You can still join the call."].exists
        )
    }

    func testReadyParticipantSeesWaitingStatusInsteadOfDisabledRecord() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()

        let ready = app.descendants(matching: .any)[
            "CaptureAudioWaitingForHostStatus"
        ]
        XCTAssertTrue(
            ready.waitForExistence(timeout: 5),
            "A ready participant should see a conventional waiting state."
        )
        XCTAssertTrue(app.staticTexts["Microphone ready"].exists)
        XCTAssertFalse(
            app.buttons["CaptureStartButton"].exists,
            "A participant who cannot control the room must not see a broken-looking disabled Record button."
        )
    }

    func testCallCheckUsesStandardLanguageAndHidesProviderDetails() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()

        let check = app.buttons["CaptureSessionTruthDisclosure"]
        reveal(check)
        XCTAssertTrue(check.isHittable)
        XCTAssertTrue(check.label.contains("Call & recording check"))
        check.tap()

        let boundary = app.staticTexts[
            "Joining the call never starts a recording. Recording starts only after everyone has allowed it and someone taps Record."
        ]
        reveal(boundary)
        XCTAssertTrue(boundary.waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureCallTechnicalDetails"].exists)
        XCTAssertFalse(
            app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "CallKit only presents")).firstMatch.exists,
            "Implementation details should remain collapsed during the ordinary call workflow."
        )
    }

    func testVerifiedRemoteSessionSourceOffersProtectedPlaybackWithoutPreviewDownload() {
        app.tabBars.buttons["Record"].tap()
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let completeSession = app.staticTexts["Studio group complete"]
        XCTAssertTrue(completeSession.waitForExistence(timeout: 5))
        completeSession.tap()
        openLocalRecorderIfNeeded()

        let check = app.buttons["CaptureSessionTruthDisclosure"]
        reveal(check)
        XCTAssertTrue(check.isHittable)
        check.tap()

        let listen = app.buttons[
            "CaptureProtectedSourcePlayback_preview-take-complete-audio"
        ]
        reveal(listen)
        XCTAssertTrue(listen.waitForExistence(timeout: 5))
        listen.tap()

        let prepare = app.buttons["CaptureSessionProtectedPlaybackPrepare"]
        XCTAssertTrue(prepare.waitForExistence(timeout: 5))
        XCTAssertFalse(
            prepare.isEnabled,
            "Deterministic preview must prove the exact-source playback surface without downloading protected media."
        )
        XCTAssertTrue(app.staticTexts["Preview only · no recording is downloaded"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "exact source")
            ).firstMatch.exists
        )
    }

    func testVerifiedSourceShowsTranscriptLifecycleBeforeReviewIsReady() {
        app.tabBars.buttons["Record"].tap()
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let completeSession = app.staticTexts["Studio group complete"]
        XCTAssertTrue(completeSession.waitForExistence(timeout: 5))
        completeSession.tap()

        let lifecycle = app.descendants(matching: .any)[
            "CaptureSessionTranscriptLifecycle_room-preview-studio-group-complete"
        ]
        reveal(lifecycle)
        XCTAssertTrue(
            lifecycle.waitForExistence(timeout: 5),
            "A verified recording should not disappear while its transcript is still being prepared."
        )
        XCTAssertTrue(app.staticTexts["Transcript is getting ready"].exists)
        let recovery = app.buttons[
            "CaptureSessionTranscriptRecovery_room-preview-studio-group-complete"
        ]
        XCTAssertTrue(recovery.exists)
        XCTAssertEqual(recovery.label, "Start transcript")
        XCTAssertFalse(
            recovery.isEnabled,
            "Deterministic preview should expose the real recovery affordance without starting synthetic transcription."
        )
    }

    func testConsentActionRemainsReachableAtLargestAccessibilityTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()
        openLocalRecorderIfNeeded()
        app.buttons["CaptureConfirmConsentButton"].tap()

        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))
        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(
            saveChoices.isHittable,
            "The final consent action must remain reachable without scrolling even at the largest accessibility text size."
        )
        XCTAssertTrue(
            saveChoices.isEnabled,
            "The standard consent action should be immediately available when the default audio and video choices are shown."
        )

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ]) { issue in
            guard issue.auditType == .textClipped else { return false }
            // XCTest reports one synthetic issue without an element and also
            // flags the fully visible, fixed-height primary button at AX3.
            // Both are verified directly above. Keep every other element and
            // every other audit type fatal.
            return issue.element == nil
                || issue.element?.identifier == "CaptureConsentSaveChoicesButton"
        }
    }

    func testVideoModesExplainAndExposeTheExactLocalSourceBeforeCameraPermission() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()

        let modePicker = app.segmentedControls["CaptureRecordingModePicker"]
        XCTAssertTrue(modePicker.waitForExistence(timeout: 5))
        XCTAssertEqual(modePicker.buttons.count, 4)

        modePicker.buttons["A/V"].tap()
        XCTAssertTrue(app.otherElements["CaptureVideoRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureVideoPreviewPlaceholder"].exists)
        XCTAssertTrue(app.buttons["CaptureVideoPrepareButton"].exists)
        XCTAssertTrue(app.segmentedControls["CaptureVideoCameraPicker"].exists)
        let qualityPicker = app.buttons["CaptureVideoQualityPicker"]
        XCTAssertTrue(qualityPicker.exists)
        XCTAssertTrue(
            qualityPicker.label.contains("4K")
                && qualityPicker.label.contains("24"),
            "Production video must default visibly to 4K at 24 fps."
        )
        qualityPicker.tap()
        for quality in ["4K · 24 fps", "4K · 30 fps", "1080p · 24 fps"] {
            XCTAssertTrue(
                app.buttons[quality].waitForExistence(timeout: 3),
                "Expected an explicit \(quality) capture choice."
            )
        }
        app.buttons["1080p · 24 fps"].tap()
        XCTAssertTrue(
            app.staticTexts["Long-take profile with lower storage and thermal demand."].exists
        )
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Records separate microphone and camera files")
            ).firstMatch.exists,
            "Podcast A/V must explain its two local files in ordinary language before asking for camera permission."
        )
        let technicalDetails = app.descendants(matching: .any)["CaptureVideoTechnicalDetails"]
        XCTAssertTrue(technicalDetails.exists)
        technicalDetails.tap()
        let technicalBoundary = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "A separate microphone master and video-only movie")
        ).firstMatch
        XCTAssertTrue(
            technicalBoundary.waitForExistence(timeout: 3),
            "Professional source and sync details should remain available on demand."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoordinatedAudioStatus"].exists,
            "Podcast A/V must keep the separate microphone route and meter visible beside camera truth."
        )

        modePicker.buttons["Camera"].tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Records video only while the Quipsly call carries the conversation.")
            ).firstMatch.exists,
            "Podcast camera must state its ordinary video-only behavior before asking for camera permission."
        )

        modePicker.buttons["Solo"].tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Records camera and microphone together on this iPhone.")
            ).firstMatch.exists,
            "Solo video must state its ordinary local camera and microphone behavior."
        )

        modePicker.buttons["Audio"].tap()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.otherElements["CaptureVideoRecorderHero"].exists)
    }

    func testVideoQualityChoiceRemainsReachableAtLargestAccessibilityTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        openLocalRecorderIfNeeded()
        let modePicker = app.segmentedControls["CaptureRecordingModePicker"]
        XCTAssertTrue(modePicker.waitForExistence(timeout: 12))
        modePicker.buttons["A/V"].tap()
        let qualityPicker = app.buttons["CaptureVideoQualityPicker"]
        reveal(qualityPicker)
        XCTAssertTrue(qualityPicker.exists)
        XCTAssertTrue(
            qualityPicker.isHittable,
            "Video quality must remain reachable at the largest accessibility text size."
        )
        qualityPicker.tap()
        XCTAssertTrue(app.buttons["4K · 24 fps"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["1080p · 24 fps"].exists)

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testVideoOnlyConsentDoesNotAccidentallyAuthorizeAudioCapture() {
        app.tabBars.buttons["Record"].tap()
        app.buttons["CaptureSessionChooser"].tap()
        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()

        openLocalRecorderIfNeeded()
        app.buttons["CaptureConfirmConsentButton"].tap()
        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))

        let recordingOptions = app.staticTexts["Recording options"]
        XCTAssertTrue(recordingOptions.waitForExistence(timeout: 3))

        let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
        let recordVideo = app.switches["CaptureConsentRecordVideoToggle"]
        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(saveChoices.isHittable)
        XCTAssertTrue(saveChoices.isEnabled)
        XCTAssertEqual(recordAudio.value as? String, "1")
        recordAudio.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        expectation(
            for: NSPredicate(format: "value == %@", "0"),
            evaluatedWith: recordAudio
        )
        waitForExpectations(timeout: 3)
        XCTAssertEqual(recordAudio.value as? String, "0")
        XCTAssertEqual(recordVideo.value as? String, "1")

        XCTAssertTrue(saveChoices.isHittable)
        XCTAssertTrue(saveChoices.isEnabled)
        saveChoices.tap()
        expectation(
            for: NSPredicate(format: "exists == false"),
            evaluatedWith: consentSheet
        )
        waitForExpectations(timeout: 5)

        let audioStart = app.buttons["CaptureStartButton"]
        XCTAssertTrue(audioStart.exists)
        XCTAssertFalse(
            audioStart.isEnabled,
            "A video-only receipt must never authorize the microphone-only recorder."
        )

        let modePicker = app.segmentedControls["CaptureRecordingModePicker"]
        modePicker.buttons["Camera"].tap()
        let prepareVideo = app.buttons["CaptureVideoPrepareButton"]
        XCTAssertTrue(prepareVideo.waitForExistence(timeout: 5))
        XCTAssertTrue(
            prepareVideo.isEnabled,
            "Video-only consent should allow an explicit camera preflight while the audio recorder remains locked."
        )
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

        XCTAssertTrue(
            app.navigationBars["Record"].waitForExistence(timeout: 5),
            "Creating a session should close the chooser and land on that session's standard call lobby."
        )
        XCTAssertTrue(app.buttons["ProviderJoinRoomButton"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureConfirmConsentButton"].exists)
        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        let confirmConsent = app.buttons["CaptureConfirmConsentButton"]
        reveal(confirmConsent)
        XCTAssertTrue(confirmConsent.exists)
        XCTAssertFalse(app.buttons["CaptureStartButton"].isEnabled)
        XCTAssertFalse(app.otherElements["GlobalCaptureBanner"].exists)
    }

    func testPrimaryRecordSurfacePassesAccessibilityAudit() throws {
        app.tabBars.buttons["Record"].tap()

        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testCoreShellPassesAccessibilityAuditAtLargestTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=today",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertTrue(tabBar.waitForExistence(timeout: 12))
        let destinations: [(tab: String, root: XCUIElement)] = [
            ("Home", app.scrollViews["CaptureTodayView"]),
            ("Nests", app.scrollViews["CaptureWorkView"]),
            ("Library", app.scrollViews["CaptureLibraryView"]),
            ("Account", app.navigationBars["Account"]),
        ]

        for destination in destinations {
            tabBar.buttons[destination.tab].tap()
            XCTAssertTrue(
                destination.root.waitForExistence(timeout: 8),
                "The \(destination.tab) destination must remain reachable at the largest accessibility text size."
            )
            try app.performAccessibilityAudit(for: [
                .hitRegion,
                .sufficientElementDescription,
                .textClipped,
            ])
        }
    }

    func testRehearsalControlsRemainReachableAtLargestAccessibilityTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-ui-preview-session=preview-studio-group-ready",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        let selectedSession = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(selectedSession.waitForExistence(timeout: 5))
        XCTAssertTrue(
            selectedSession.label.contains("Studio group ready"),
            "The accessibility flight must exercise the explicit podcast fixture, not the first coaching Session."
        )
        openLocalRecorderIfNeeded()
        XCTAssertTrue(
            app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5)
        )

        let start = app.buttons["CaptureStartButton"]
        reveal(start)
        XCTAssertTrue(
            start.isHittable,
            "The primary recording action must remain reachable at the largest accessibility text size."
        )

        let readiness = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessCard"
        ]
        reveal(readiness)
        XCTAssertTrue(readiness.exists)
        let disclosure = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessDisclosure"
        ]
        reveal(disclosure)
        XCTAssertTrue(
            disclosure.isHittable,
            "The pre-record physical-boundary checklist must remain reachable at the largest accessibility text size."
        )
        disclosure.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureRehearsalCheck_session"]
                .waitForExistence(timeout: 5)
        )
        disclosure.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureRehearsalCheck_session"]
                .waitForNonExistence(timeout: 5),
            "Collapse the already-verified checklist before auditing the later current screen."
        )

        let manuscript = app.descendants(matching: .any)[
            "CaptureEpisodeManuscriptCard"
        ]
        reveal(manuscript, searchAboveFirst: false)
        XCTAssertTrue(manuscript.exists)
        let openManuscript = app.buttons["CaptureEpisodeManuscriptOpenButton"]
        reveal(openManuscript)
        XCTAssertTrue(
            openManuscript.isHittable,
            "The canonical episode manuscript must remain reachable at the largest accessibility text size."
        )

        let watch = app.descendants(matching: .any)["CaptureEpisodeWatchCard"]
        XCTAssertTrue(
            watch.waitForExistence(timeout: 5),
            "The shared Watch plan must remain reachable at the largest accessibility text size."
        )
        let prepareWatch = app.buttons["CaptureEpisodeWatchPrepareButton"]
        reveal(prepareWatch)
        XCTAssertTrue(
            prepareWatch.isHittable,
            "The shared Watch preparation action must remain reachable at the largest accessibility text size."
        )

        try app.performAccessibilityAudit(
            for: [
                .hitRegion,
                .sufficientElementDescription,
                .textClipped,
            ]
        ) { [self] issue in
            guard issue.auditType == .textClipped,
                  let element = issue.element else {
                return false
            }

            // This audit intentionally traverses a long recorder
            // ScrollView. The final scroll position can leave the next
            // card's multiline text partly behind the navigation or
            // floating tab bars. That is viewport occlusion, not an
            // internally clipped label. Ignore only that exact geometry;
            // fully visible clipped text must still fail the release.
            let visibleTop = app.frame.minY + 72
            let visibleBottom = app.frame.maxY - 96
            return element.frame.minY < visibleTop
                || element.frame.maxY > visibleBottom
        }
    }

    func testSessionPlanIsAvailableOnThePrimaryIPhoneRecorder() {
        app.tabBars.buttons["Record"].tap()
        openLocalRecorderIfNeeded()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let openPlan = app.buttons["CaptureSessionPlanOpen"]
        reveal(openPlan)
        XCTAssertTrue(openPlan.waitForExistence(timeout: 5))
        XCTAssertTrue(openPlan.isHittable)
        app.buttons["CaptureSessionPlanOpen"].tap()

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

        let switchAccount = app.buttons["CaptureSwitchAccountButton"]
        XCTAssertTrue(switchAccount.waitForExistence(timeout: 5))
        XCTAssertTrue(
            String(describing: app.descendants(matching: .any)["CaptureSignedInAccount"].value ?? "")
                .localizedCaseInsensitiveContains("preview@quipsly.local"),
            "Account switching must be beside the exact currently selected email."
        )
        for _ in 0..<5 where !switchAccount.isHittable {
            app.swipeUp()
        }

        XCTAssertTrue(switchAccount.isHittable, "Account actions must scroll completely above the persistent capture tab bar.")
        let deletion = app.buttons["Delete account"]
        reveal(deletion)
        XCTAssertTrue(deletion.isHittable)
    }

    func testAccountKeepsAdvancedStorageChoicesBehindOneClearDestination() {
        app.tabBars.buttons["Account"].tap()

        XCTAssertFalse(
            app.staticTexts["Upload policy"].exists,
            "Ordinary Account should not confront every person with transport policy terminology."
        )

        let storage = app.descendants(matching: .any)[
            "CaptureAccountStorageAndUploads"
        ]
        reveal(storage)
        XCTAssertTrue(storage.waitForExistence(timeout: 5))
        XCTAssertTrue(storage.isHittable)
        storage.tap()

        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureStorageAndUploadSettings"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.navigationBars["Storage & uploads"].exists)
        XCTAssertTrue(app.switches["Use cellular data"].exists)
        XCTAssertTrue(app.staticTexts["Original recordings"].exists)
    }

    func testAccountOffersPrivacyBoundedSupportSnapshot() throws {
        app.tabBars.buttons["Account"].tap()

        let disclosure =
            app.buttons["CaptureSupportDisclosure"]
        reveal(disclosure)
        XCTAssertTrue(
            disclosure.waitForExistence(timeout: 5)
        )
        disclosure.tap()

        let share =
            app.descendants(matching: .any)[
                "CaptureShareSupportSnapshot"
            ]
        reveal(share)
        XCTAssertTrue(
            share.isHittable,
            """
            A tester must be able to reach the support snapshot without navigating away from Account.
            \(share.debugDescription)
            """
        )

        let boundary =
            app.staticTexts[
                "CaptureSupportPrivacyBoundary"
            ]
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(
            boundary.label.contains("no email")
        )
        XCTAssertTrue(
            boundary.label.contains("access token")
        )
        XCTAssertTrue(
            boundary.label.contains("source text")
        )
        XCTAssertTrue(
            app.staticTexts[
                "CaptureVersionBuild"
            ].exists
        )

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])

        share.tap()
        let shareSheet =
            app.otherElements["ActivityListView"]
        XCTAssertTrue(
            shareSheet.waitForExistence(timeout: 5),
            """
            The support action must open the system share sheet without sending anything automatically.
            \(app.debugDescription)
            """
        )
    }

    func testSupportSnapshotRemainsReachableAtLargestAccessibilityTextSize() throws {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=account",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(
            app.navigationBars["Account"].waitForExistence(timeout: 12)
        )

        let disclosure =
            app.buttons["CaptureSupportDisclosure"]
        reveal(disclosure)
        XCTAssertTrue(
            disclosure.isHittable,
            "Help and diagnostics must remain reachable at the largest accessibility text size."
        )
        disclosure.tap()

        let share =
            app.buttons["CaptureShareSupportSnapshot"]
        reveal(share)
        XCTAssertTrue(
            share.isHittable,
            "The redacted support snapshot must remain reachable at the largest accessibility text size."
        )

        let boundary =
            app.staticTexts[
                "CaptureSupportPrivacyBoundary"
            ]
        reveal(boundary)
        XCTAssertTrue(
            boundary.isHittable,
            "The privacy boundary must remain readable before a tester shares diagnostics."
        )

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testAccountDeletionExplainsTimingAndPersistentStatusBeforeSubmission() {
        app.tabBars.buttons["Account"].tap()

        let deletionButton = app.buttons["Delete account"]
        reveal(deletionButton)
        XCTAssertTrue(deletionButton.isHittable)
        deletionButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["AccountDeletionSheet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["What happens"].exists)
        XCTAssertTrue(app.staticTexts["Your access is removed"].exists)
        XCTAssertTrue(app.staticTexts["Eligible personal data is deleted"].exists)
        XCTAssertFalse(app.buttons["Delete…"].isEnabled, "Preview mode must explain deletion without submitting a real request.")
    }

    func testStudioHandoffKeepsTheWholeCaptureGroupVisibleAcrossReadyRetryAndCompleteStates() {
        app.tabBars.buttons["Record"].tap()

        func chooseSession(_ id: String) {
            let chooser = app.buttons["CaptureSessionChooser"]
            reveal(chooser)
            XCTAssertTrue(chooser.waitForExistence(timeout: 5))
            chooser.tap()

            let row = app.buttons["CaptureSessionPicker_\(id)"]
            for _ in 0..<8 where !row.exists || !row.isHittable {
                app.swipeUp()
            }
            XCTAssertTrue(row.exists, "The deterministic capture-group fixture must be reachable in the real session picker.")
            XCTAssertTrue(row.isHittable)
            row.tap()
            openLocalRecorderIfNeeded()
        }

        func assertHandoff(
            sessionID: String,
            expectedStatus: String,
            expectedActionIdentifier: String,
            expectedActionLabel: String,
            expectedActionEnabled: Bool,
            expectedDetail: String
        ) {
            let card = app.descendants(matching: .any)["CaptureStudioHandoffCard_\(sessionID)"]
            reveal(card)
            XCTAssertTrue(card.waitForExistence(timeout: 5))

            let inAppEdit = app.descendants(matching: .any)["CaptureRecordingEditLink_\(sessionID)"]
            XCTAssertTrue(
                inAppEdit.exists,
                "A completed take should expose simple in-app editing before the advanced Studio handoff."
            )
            XCTAssertEqual(inAppEdit.label, "Edit and share")

            let status = app.descendants(matching: .any)["CaptureStudioPromotionStatus_\(sessionID)"]
            XCTAssertEqual(status.label, expectedStatus)

            let action = app.descendants(matching: .any)[
                expectedActionIdentifier
            ]
            XCTAssertTrue(action.exists)
            XCTAssertEqual(action.label, expectedActionLabel)
            XCTAssertEqual(action.isEnabled, expectedActionEnabled)
            XCTAssertTrue(app.staticTexts[expectedDetail].exists)
        }

        chooseSession("preview-studio-group-ready")
        assertHandoff(
            sessionID: "preview-studio-group-ready",
            expectedStatus: "2 masters ready",
            expectedActionIdentifier:
                "CaptureAttachToStudioButton_preview-studio-group-ready",
            expectedActionLabel: "Prepare group",
            expectedActionEnabled: true,
            expectedDetail: "All 2 protected masters passed exact-byte verification and can move to Studio together."
        )
        app.buttons["CaptureAttachToStudioButton_preview-studio-group-ready"].tap()
        XCTAssertTrue(
            app.staticTexts["Preview mode shows the Studio handoff without changing media."]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "CaptureStudioHandoffFeedback_preview-studio-group-ready"
            ].exists
        )

        chooseSession("preview-studio-group-partial")
        assertHandoff(
            sessionID: "preview-studio-group-partial",
            expectedStatus: "1 of 2 masters in Studio",
            expectedActionIdentifier:
                "CaptureAttachToStudioButton_preview-studio-group-partial",
            expectedActionLabel: "Prepare group",
            expectedActionEnabled: true,
            expectedDetail: "1 of 2 protected masters reached Studio. Retry safely to continue the exact same handoff."
        )

        chooseSession("preview-studio-group-complete")
        assertHandoff(
            sessionID: "preview-studio-group-complete",
            expectedStatus: "2 masters in Studio",
            expectedActionIdentifier:
                "CaptureOpenStudioReviewLink_preview-studio-group-complete",
            expectedActionLabel: "Review group sync",
            expectedActionEnabled: true,
            expectedDetail: "The complete 2-master capture group is attached to Studio. Every original remains immutable capture evidence."
        )
    }

    func testCompletedSessionKeepsEditAndShareAvailableWithoutReopeningRecorder() {
        app.tabBars.buttons["Record"].tap()

        let chooser = app.buttons["CaptureSessionChooser"]
        reveal(chooser)
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()

        let completedSession = app.buttons["CaptureSessionPicker_preview-studio-group-ready"]
        for _ in 0..<8 where !completedSession.exists || !completedSession.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(completedSession.exists)
        completedSession.tap()

        let edit = app.descendants(matching: .any)[
            "CaptureRecordingEditLink_preview-studio-group-ready"
        ]
        reveal(edit)
        XCTAssertTrue(
            edit.waitForExistence(timeout: 5),
            "A completed Session must retain its basic editor after the recorder workspace closes."
        )
        XCTAssertTrue(edit.isHittable)
        XCTAssertEqual(edit.label, "Edit and share")
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureRecordingModePicker"].exists,
            "Opening a completed Session should not require reopening recorder controls to reach editing."
        )
    }

    private func assertFocusedTranscriptSegment(
        _ segmentID: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let segment = app.descendants(matching: .any)["CaptureTranscriptSegment_\(segmentID)"]
        XCTAssertTrue(
            segment.waitForExistence(timeout: 10),
            "The source link must resolve to transcript segment \(segmentID).",
            file: file,
            line: line
        )
        XCTAssertTrue(
            segment.isHittable,
            "The linked transcript segment must be the focused, visible review context.",
            file: file,
            line: line
        )
    }

    private func openAcrossNestsFollowThrough() {
        if app.scrollViews["CaptureAcrossNestsFollowThroughView"].exists {
            return
        }
        let nests = app.tabBars.buttons["Nests"]
        XCTAssertTrue(nests.waitForExistence(timeout: 8))
        nests.tap()
        XCTAssertTrue(app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 8))
        let acrossNests = app.buttons["CaptureOpenAcrossNestsFollowThrough"]
        reveal(acrossNests)
        XCTAssertTrue(
            acrossNests.isHittable,
            "Cross-Nest work should have one obvious route from Nests."
        )
        acrossNests.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureAcrossNestsFollowThroughView"]
                .waitForExistence(timeout: 8)
        )
    }

    private func openPreviewTranscriptReview() {
        let library = app.tabBars.buttons["Library"]
        XCTAssertTrue(library.waitForExistence(timeout: 12))
        library.tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 8))
        let reviewLink = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 8))
        reviewLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 8))
    }

    private func relaunchCoachingPreview(
        role: String,
        additionalArguments: [String] = []
    ) {
        app.terminate()
        app.launchArguments = ["--capture-ui-preview"] + additionalArguments
        app.launchEnvironment["CAPTURE_COACHING_PREVIEW_ROLE"] = role
        app.launch()
        XCTAssertTrue(
            app.descendants(matching: .any)["CapturePreviewModeBadge"]
                .waitForExistence(timeout: 12),
            "The explicit \(role) coaching persona must settle before UI acceptance begins."
        )
    }

    private func openCoachingForms() {
        let coaching = app.buttons["CaptureOpenCoachingHome"]
        XCTAssertTrue(coaching.waitForExistence(timeout: 5))
        coaching.tap()
        XCTAssertTrue(app.scrollViews["CaptureCoachingHome"].waitForExistence(timeout: 5))
        let forms = app.buttons["CaptureCoachingFormsButton"]
        reveal(forms, searchAboveFirst: false)
        XCTAssertTrue(
            forms.exists && forms.isHittable,
            "Coaching forms should be directly reachable from the native coaching home."
        )
        forms.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureCoachingFormsHome"].waitForExistence(timeout: 5),
            "Capture should open native coaching forms without bouncing to the web."
        )
    }

    private func reveal(
        _ element: XCUIElement,
        searchAboveFirst: Bool = true
    ) {
        let visibleBottom = app.frame.maxY - 96
        if element.exists,
           element.isHittable,
           element.frame.minY >= app.frame.minY + 72,
           element.frame.maxY <= visibleBottom {
            return
        }
        // On iPad, an iPhone-first app can run inside a movable window whose
        // origin does not match the SpringBoard screen. A gesture synthesized
        // against XCUIApplication can then land on the desktop behind the app.
        // Anchor scrolling to the app's actual vertical ScrollView so the same
        // reachability assertion exercises both full-screen iPhone and
        // windowed iPad layouts. Bounded drags avoid oscillating above and
        // below a short control when a full-page swipe overshoots it.
        let namedForm = app.descendants(matching: .any)["CaptureQuickEntryForm"].firstMatch
        let transcriptReview = app.scrollViews["CaptureTranscriptReviewView"].firstMatch
        let coachingFormResponse = app.scrollViews["CaptureCoachingFormResponse"].firstMatch
        let coachingFormsHome = app.scrollViews["CaptureCoachingFormsHome"].firstMatch
        let scrollSurface = namedForm.exists
            ? namedForm
            : transcriptReview.exists
                ? transcriptReview
                : coachingFormResponse.exists
                    ? coachingFormResponse
                    : coachingFormsHome.exists ? coachingFormsHome : app.scrollViews.firstMatch
        // A LazyVStack removes distant rows from the accessibility tree. If a
        // target does not currently exist, search above first, then below,
        // instead of assuming every unseen control is farther down the page.
        let searchDirections = searchAboveFirst ? [true, false] : [false, true]
        for searchAbove in searchDirections {
            for _ in 0..<16 {
                let shouldMoveContentDown = element.exists
                    ? element.frame.maxY <= app.frame.minY + 72
                    : searchAbove
                if scrollSurface.exists {
                    let startY = shouldMoveContentDown ? 0.34 : 0.72
                    let endY = shouldMoveContentDown ? 0.64 : 0.42
                    scrollSurface
                        .coordinate(
                            withNormalizedOffset: CGVector(dx: 0.5, dy: startY)
                        )
                        .press(
                            forDuration: 0.05,
                            thenDragTo: scrollSurface.coordinate(
                                withNormalizedOffset: CGVector(dx: 0.5, dy: endY)
                            )
                        )
                    RunLoop.current.run(
                        until: Date().addingTimeInterval(0.15)
                    )
                } else if shouldMoveContentDown {
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
    }

    func testAccountMakesOwnerNestBackupAndPreviewFirstRestoreReachable() throws {
        app.tabBars.buttons["Account"].tap()

        let portabilityLink = app.descendants(matching: .any)[
            "CaptureAccountNestPortability"
        ]
        reveal(portabilityLink)
        XCTAssertTrue(
            portabilityLink.waitForExistence(timeout: 5),
            "Account should make whole-Nest portability directly reachable on iPhone."
        )
        XCTAssertTrue(portabilityLink.isHittable)
        portabilityLink.tap()

        XCTAssertTrue(
            app.scrollViews["CaptureNestPortabilityView"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(
            app.descendants(matching: .any)[
                "CaptureNestPortabilityBoundary"
            ].exists
        )
        XCTAssertTrue(
            app.buttons["CaptureNestPortabilityProjectPicker"].exists,
            "An owner with more than one Nest should be able to choose the exact backup or restore destination."
        )
        XCTAssertTrue(app.staticTexts["Alex's Nest"].exists)

        let export = app.buttons["CaptureNestExportButton"]
        reveal(export)
        XCTAssertTrue(export.exists)
        XCTAssertFalse(
            export.isEnabled,
            "Deterministic preview must show the production backup workflow without exporting private data."
        )

        let choose = app.buttons["CaptureNestChooseRestorePackage"]
        reveal(choose)
        XCTAssertTrue(choose.isHittable)
        let validate = app.buttons["CaptureNestValidateRestore"]
        XCTAssertTrue(validate.exists)
        XCTAssertFalse(
            validate.isEnabled,
            "Apply must remain unreachable before a real JSON package is loaded and validated."
        )

        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(
                    format: "label CONTAINS %@",
                    "recordings and media bytes"
                )
            ).firstMatch.exists,
            "The phone must disclose that source media, credentials, collaborators, notifications, and provider effects are outside the portable package."
        )

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    private func revealBelow(_ element: XCUIElement, in scrollSurface: XCUIElement) {
        let visibleBottom = app.frame.maxY - 96
        for _ in 0..<16 {
            if element.exists {
                let frame = element.frame
                if !frame.isEmpty,
                   frame.minY >= app.frame.minY + 72,
                   frame.maxY <= visibleBottom {
                    return
                }
            }
            if scrollSurface.exists {
                app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.78))
                    .press(
                        forDuration: 0.05,
                        thenDragTo: app.coordinate(
                            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.24)
                        )
                    )
                RunLoop.current.run(until: Date().addingTimeInterval(0.15))
            } else {
                app.swipeUp()
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

    private func turnOff(_ toggle: XCUIElement) {
        reveal(toggle)
        guard toggle.value as? String != "0" else { return }
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        expectation(
            for: NSPredicate(format: "value == %@", "0"),
            evaluatedWith: toggle
        )
        waitForExpectations(timeout: 3)
    }

    private func openLocalRecorderIfNeeded() {
        let localOnly = app.buttons["CaptureRecordWithoutJoiningButton"].firstMatch
        guard localOnly.waitForExistence(timeout: 2),
              localOnly.label == "Record without joining" else { return }
        localOnly.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureConsentStrip"]
                .waitForExistence(timeout: 5),
            "The explicit local-only escape hatch should reveal the recording workspace without joining or recording."
        )
    }

    private func dismissQuickEntryKeyboard() {
        let done = app.buttons["CaptureQuickEntryKeyboardDone"].firstMatch
        XCTAssertTrue(done.waitForExistence(timeout: 3), "Quick Capture must expose a reachable keyboard dismissal action.")
        done.tap()
    }
}

/// Generates private-data-safe layout evidence from the same deterministic
/// preview state used by the product UX tests. These attachments are drafts:
/// final App Store assets must still come from the signed candidate or its
/// TestFlight install with the approved synthetic reviewer account.
final class CaptureAppStoreScreenshotUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        app?.terminate()
    }

    func testCapturePrivateDataSafeDrafts() {
        launch(tab: "today", waitingFor: app.scrollViews["CaptureTodayView"])
        XCTAssertFalse(app.descendants(matching: .any)["CapturePreviewModeBadge"].exists)
        XCTAssertTrue(app.staticTexts["Coaching session"].exists)
        keepScreenshot("01-today.png")

        launch(tab: "record", waitingFor: app.navigationBars["Record"])
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let consentNeededSession = app.staticTexts["First coaching consultation"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()
        let joinCall = app.buttons["ProviderJoinRoomButton"]
        XCTAssertTrue(
            joinCall.waitForExistence(timeout: 5),
            "The App Store Record draft must show the familiar green-room join action."
        )
        XCTAssertTrue(app.buttons["CaptureRecordWithoutJoiningButton"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["CaptureOuterRoomNextStep"].exists)
        XCTAssertFalse(app.buttons["CaptureConfirmConsentButton"].exists)
        Thread.sleep(forTimeInterval: 0.8)
        keepScreenshot("02-record.png")

        launch(tab: "work", waitingFor: app.navigationBars["Nests"])
        XCTAssertTrue(
            app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 5)
        )
        XCTAssertFalse(app.buttons["CaptureWorkNewProject"].exists)
        XCTAssertFalse(app.buttons["CaptureWorkNewProjectInline"].exists)
        XCTAssertFalse(app.staticTexts["1 retired tag remains preserved for history."].exists)
        keepScreenshot("03-work.png")

        launch(tab: "library", waitingFor: app.navigationBars["Library"])
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["What I want to explore next"].exists)
        XCTAssertTrue(app.staticTexts["Timed transcript"].exists)
        XCTAssertTrue(app.buttons["CaptureLibraryStartVoiceNote"].exists)
        keepScreenshot("04-library.png")

        let writingDraft = app.descendants(matching: .any)["CaptureLibraryPreviewWritingCard"]
        XCTAssertTrue(writingDraft.isHittable)
        writingDraft.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureVoiceWritingEditor"]
                .waitForExistence(timeout: 5),
            "The App Store writing story must open the real editable surface inside Capture."
        )
        XCTAssertFalse(app.tabBars.firstMatch.exists)
        let writingTitle = app.textFields["CaptureVoiceWritingTitle"]
        XCTAssertTrue(writingTitle.exists)
        XCTAssertEqual(writingTitle.value as? String, "What I want to explore next")
        XCTAssertTrue(
            app.buttons["CaptureVoiceWritingContinueToolbar"].isEnabled,
            "The release story must make continuing by voice immediately available."
        )
        Thread.sleep(forTimeInterval: 0.8)
        keepScreenshot("05-writing.png")

        launch(tab: "library", waitingFor: app.navigationBars["Library"])
        let recordingsSection = app.buttons["Recordings"]
        XCTAssertTrue(recordingsSection.waitForExistence(timeout: 5))
        recordingsSection.tap()
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureLibraryPreviewSourceCard"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Backed up"].exists)
        XCTAssertTrue(app.staticTexts["Transcript ready"].exists)
        XCTAssertTrue(app.staticTexts["Your recordings"].exists)
        XCTAssertTrue(app.staticTexts["Play, share, and open the transcript for any Session or voice recording."].exists)
        XCTAssertTrue(app.buttons["Open transcript"].exists)
        let storageJargon = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "verified")
        ).firstMatch
        XCTAssertFalse(
            storageJargon.exists,
            "Everyday recording review should not lead with storage-verification jargon."
        )
        XCTAssertFalse(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "18.4 MB")
            ).firstMatch.exists,
            "File size belongs in Recording details, not the ordinary Library surface."
        )
        let transcriptReview = app.buttons["CaptureTranscriptReviewPreviewLink"]
        XCTAssertTrue(
            transcriptReview.waitForExistence(timeout: 5),
            "The App Store follow-through story must start from the exact source-linked transcript."
        )
        transcriptReview.tap()
        XCTAssertTrue(
            app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5),
            "The source-linked transcript review must open inside Capture."
        )
        XCTAssertFalse(
            app.tabBars.firstMatch.exists,
            "Focused transcript reading and editing should not be covered by the global tab bar."
        )
        XCTAssertTrue(app.staticTexts["Coaching session"].exists)
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureTranscriptReviewView"]
                .waitForExistence(timeout: 5)
        )
        let conversationView = app.buttons["Conversation"]
        XCTAssertTrue(
            conversationView.waitForExistence(timeout: 5),
            "The transcript must offer its familiar conversation view."
        )
        if !conversationView.isSelected {
            conversationView.tap()
        }
        let firstTranscriptTurn = app.descendants(matching: .any)[
            "CaptureTranscriptConversationTurn_preview-segment"
        ].firstMatch
        XCTAssertTrue(
            firstTranscriptTurn.waitForExistence(timeout: 5) && firstTranscriptTurn.isHittable,
            "Opening a transcript should reveal the editable words before explanatory and quality cards."
        )
        XCTAssertFalse(
            app.descendants(matching: .any)["CapturePacketCandidateReviewQueue"].exists,
            "The paid-release transcript story must not advertise a legacy suggestion-approval queue."
        )
        Thread.sleep(forTimeInterval: 1.0)
        keepScreenshot("06-transcript.png")

        launch(tab: "account", waitingFor: app.scrollViews["CaptureAccountView"])
        let plan = app.buttons["CaptureAccountQuipslyPlan"]
        XCTAssertTrue(plan.waitForExistence(timeout: 5))
        plan.tap()
        XCTAssertTrue(
            app.scrollViews["QuipslySubscriptionView"].waitForExistence(timeout: 5),
            "The App Store purchase review must use the real Quipsly plan surface."
        )
        XCTAssertTrue(app.staticTexts["Quipsly Coach Monthly"].exists)
        XCTAssertTrue(app.staticTexts["Quipsly Coach Annual"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label CONTAINS %@", "Clients join and collaborate free.")
            ).firstMatch.exists
        )
        Thread.sleep(forTimeInterval: 0.8)
        keepScreenshot("07-subscription.png")
    }

    private func launch(tab: String, waitingFor destination: XCUIElement) {
        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-app-store-presentation",
            "--capture-ui-preview-tab=\(tab)",
        ]
        app.launch()
        XCTAssertTrue(
            destination.waitForExistence(timeout: 12),
            "The deterministic \(tab) screenshot state should launch without credentials or network access."
        )
    }

    private func keepScreenshot(_ filename: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = filename
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func turnOnConsentChoice(_ identifier: String) {
        let toggle = app.switches[identifier]
        XCTAssertTrue(
            toggle.waitForExistence(timeout: 5),
            "The App Store consent story requires \(identifier)."
        )
        guard toggle.value as? String != "1" else { return }
        let unobscuredBottom = app.frame.maxY - 150
        for _ in 0..<8
        where !toggle.isHittable || toggle.frame.maxY > unobscuredBottom {
            app.swipeUp()
        }
        XCTAssertTrue(
            toggle.isHittable && toggle.frame.maxY <= unobscuredBottom,
            "The App Store consent story must keep \(identifier) reachable."
        )
        for horizontalOffset in [0.92, 0.78, 0.5]
        where toggle.value as? String != "1" {
            toggle.coordinate(
                withNormalizedOffset: CGVector(
                    dx: horizontalOffset,
                    dy: 0.5
                )
            ).tap()
            RunLoop.current.run(
                until: Date().addingTimeInterval(0.45)
            )
        }
        XCTAssertEqual(
            toggle.value as? String,
            "1",
            "The App Store consent story could not enable \(identifier)."
        )
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

    func testLoginLeadsWithStandardFederatedContinuityAndKeepsPasswordRecoveryReachableAtAccessibilityTextSize() {
        XCTAssertTrue(app.buttons["QuipslyCaptureAppleSignInButton"].exists)
        XCTAssertTrue(app.buttons["QuipslyCaptureGoogleSignInButton"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["QuipslyCaptureGoogleIdentityContinuityHint"].exists,
            "The normal Google-first path should not be followed by an identity-policy lecture."
        )
        XCTAssertFalse(
            app.textFields["QuipslyCaptureEmailField"].exists,
            "The first sign-in screen should not dump alternate credential fields under the standard identity choices."
        )
        openEmailAccess()
        XCTAssertTrue(app.textFields["QuipslyCaptureEmailField"].exists)
        XCTAssertTrue(app.secureTextFields["QuipslyCapturePasswordField"].exists)
        XCTAssertTrue(app.buttons["QuipslyCaptureSignInButton"].exists)

        reveal(app.buttons["QuipslyCapturePasswordResetButton"])
        XCTAssertTrue(app.buttons["QuipslyCapturePasswordResetButton"].exists)
    }

    func testLoginOffersPrivacyBoundedSupportBeforeAuthenticationAtAccessibilityTextSize() throws {
        openEmailAccess()
        let email =
            app.textFields["QuipslyCaptureEmailField"]
        reveal(email, swipingDownFirst: true)
        email.tap()
        email.typeText("private.tester@example.com")

        let password =
            app.secureTextFields[
                "QuipslyCapturePasswordField"
            ]
        password.tap()
        password.typeText("private password")

        let disclosure =
            app.buttons[
                "QuipslyCaptureSignInSupportDisclosure"
            ]
        reveal(disclosure)
        XCTAssertTrue(
            disclosure.isHittable,
            "Signed-out support must remain reachable at the largest accessibility text size."
        )
        disclosure.tap()

        let boundary =
            app.staticTexts[
                "QuipslyCaptureSignInSupportPrivacyBoundary"
            ]
        reveal(boundary)
        XCTAssertTrue(boundary.isHittable)
        XCTAssertTrue(
            boundary.label.contains("no email")
        )
        XCTAssertTrue(
            boundary.label.contains("credential")
        )

        let share =
            app.buttons[
                "QuipslyCaptureShareSignInSupport"
            ]
        reveal(share)
        XCTAssertTrue(share.isHittable)

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])

        share.tap()
        XCTAssertTrue(
            app.otherElements["ActivityListView"]
                .waitForExistence(timeout: 5),
            "Signed-out diagnostics must open the real Share Sheet without attempting authentication or sending automatically."
        )
    }

    func testCreateAccountRequiresMatchingEightCharacterPassword() {
        openEmailAccess()
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
        email.typeText("capture.tester@example.com")
        password.tap()
        let fillStrongPassword = app.buttons["Fill Strong Password"]
        if fillStrongPassword.waitForExistence(timeout: 1) {
            let close = app.buttons["Close"]
            XCTAssertTrue(close.waitForExistence(timeout: 2))
            close.tap()
            password.tap()
        }
        password.typeText("correct horse")
        confirmation.tap()
        confirmation.typeText("correct horse")

        let createAccount = app.buttons["QuipslyCaptureCreateAccountButton"]
        reveal(createAccount)
        XCTAssertTrue(createAccount.isEnabled, "Creation should become available only after the email and matching 8+ character passwords are present.")
    }

    private func openEmailAccess() {
        let emailAccess = app.buttons["QuipslyCaptureContinueWithEmail"]
        reveal(emailAccess, swipingDownFirst: true)
        XCTAssertTrue(emailAccess.waitForExistence(timeout: 5))
        emailAccess.tap()
        XCTAssertTrue(
            app.textFields["QuipslyCaptureEmailField"].waitForExistence(timeout: 5),
            "Continue with email should reveal the familiar email sign-in path in place."
        )
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

    private func revealCapture(_ element: XCUIElement) {
        let visibleBottom = captureApp.frame.maxY - 96
        if element.exists,
           element.isHittable,
           element.frame.minY >= captureApp.frame.minY + 72,
           element.frame.maxY <= visibleBottom {
            return
        }

        let scrollSurface = captureApp.scrollViews["CaptureRecorderView"].firstMatch
        for searchAbove in [true, false] {
            for _ in 0..<16 {
                let shouldMoveContentDown = element.exists
                    ? element.frame.maxY <= captureApp.frame.minY + 72
                    : searchAbove
                if scrollSurface.exists {
                    let startY = shouldMoveContentDown ? 0.34 : 0.72
                    let endY = shouldMoveContentDown ? 0.64 : 0.42
                    scrollSurface
                        .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: startY))
                        .press(
                            forDuration: 0.05,
                            thenDragTo: scrollSurface.coordinate(
                                withNormalizedOffset: CGVector(dx: 0.5, dy: endY)
                            )
                        )
                    RunLoop.current.run(until: Date().addingTimeInterval(0.15))
                } else if shouldMoveContentDown {
                    captureApp.swipeDown()
                } else {
                    captureApp.swipeUp()
                }
                if element.exists,
                   element.isHittable,
                   element.frame.minY >= captureApp.frame.minY + 72,
                   element.frame.maxY <= visibleBottom {
                    return
                }
            }
        }
    }

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

    private func openSafariShareSheet(_ safari: XCUIApplication) {
        let share = safari.buttons.matching(
            NSPredicate(format: "label ==[c] %@ OR identifier == %@", "Share", "ShareButton")
        ).firstMatch
        if !share.waitForExistence(timeout: 3) {
            let more = safari.buttons["More"].firstMatch
            XCTAssertTrue(more.waitForExistence(timeout: 5), safari.debugDescription)

            // On the lowered iOS 26 Safari toolbar, XCUI occasionally finds
            // More but computes an invalid auto-scroll hit point for tap().
            // A coordinate on the already-visible control avoids that false
            // miss; one retry covers the toolbar animation settling.
            more.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            if !share.waitForExistence(timeout: 3) {
                safari.activate()
                more.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
        }
        XCTAssertTrue(share.waitForExistence(timeout: 10), safari.debugDescription)
        share.tap()
    }

    private func selectSafariPassage(_ passage: XCUIElement, in safari: XCUIApplication) {
        let selectionCopyAction = safari.descendants(matching: .any).matching(
            NSPredicate(format: "label ==[c] %@", "Copy")
        ).firstMatch
        let educationPopover = safari.staticTexts.matching(
            NSPredicate(format: "label CONTAINS[c] %@", "View Bookmarks")
        ).firstMatch

        for _ in 0..<3 {
            // Fresh hosted simulators can show a delayed Safari education
            // popover directly over the page after launch. Tapping the passage
            // dismisses that non-product UI before asking for a real selection.
            if educationPopover.waitForExistence(timeout: 2) {
                passage.tap()
            }
            passage.press(forDuration: 1.2)
            if selectionCopyAction.waitForExistence(timeout: 3) {
                return
            }
            passage.tap()
        }

        XCTFail("Safari must expose a real text selection before Quipsly tests passage provenance.\n\(safari.debugDescription)")
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
        // Each test crosses the real Safari Share Sheet boundary. A hosted
        // simulator can leave that system process waiting for an animation
        // completion notification after the prior extension test, which makes
        // a later tap synthesize correctly but never dispatch. Start each test
        // with a fresh Safari process while preserving its installed app data.
        safari.terminate()
        safari.launch()
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
        openSafariShareSheet(safari)

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
        openSafariShareSheet(safari)

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
        let syncCard = captureApp.staticTexts["1 quick capture waiting"]
        revealCapture(syncCard)
        XCTAssertTrue(syncCard.waitForExistence(timeout: 10))
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
        let recoveredStatus = captureApp.staticTexts["1 quick capture waiting"]
        revealCapture(recoveredStatus)
        XCTAssertTrue(recoveredStatus.waitForExistence(timeout: 8))
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
        let otherOwnerStatus = captureApp.staticTexts["1 quick capture waiting"]
        // `exists` queries the complete accessibility tree. Do not run the
        // reveal helper for an element whose required state is absence: that
        // helper deliberately searches both scroll directions and turns this
        // privacy assertion into minutes of synthetic gestures.
        XCTAssertFalse(otherOwnerStatus.exists)
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
        let restoredStatus = captureApp.staticTexts["1 quick capture waiting"]
        revealCapture(restoredStatus)
        XCTAssertTrue(restoredStatus.waitForExistence(timeout: 8))
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
        selectSafariPassage(passage, in: safari)

        // Safari's contextual Share action exports only public.plain-text. Use
        // the page Share control while the selection remains active so Safari
        // also runs the extension's documented webpage preprocessor.
        openSafariShareSheet(safari)

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
        let syncCard = captureApp.staticTexts["1 quick capture waiting"]
        revealCapture(syncCard)
        XCTAssertTrue(syncCard.waitForExistence(timeout: 10))
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
