import XCTest

final class CaptureExperienceUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--capture-ui-preview"]
        let launchesWatchPreview: Bool
        if name.contains(
            "testEpisodeWatchKeepsExactCurrentPassVisibleWithoutALocalClip"
        ) {
            launchesWatchPreview = true
            app.launchArguments += [
                "--capture-ui-preview-tab=record",
                "--capture-watch-preview-state=current-pass",
            ]
        } else if name.contains(
            "testEpisodeWatchKeepsPreviousPassClearActionVisibleWithoutALocalClip"
        ) {
            launchesWatchPreview = true
            app.launchArguments += [
                "--capture-ui-preview-tab=record",
                "--capture-watch-preview-state=previous-pass",
            ]
        } else {
            launchesWatchPreview = false
        }
        app.launch()
        if launchesWatchPreview {
            XCTAssertTrue(
                app.otherElements["CaptureRecorderHero"]
                    .waitForExistence(timeout: 12),
                "The deterministic Watch preview should launch directly in the recorder without credentials or network access."
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

        for tab in ["Today", "Record", "Work", "Library", "Account"] {
            XCTAssertTrue(tabBar.buttons[tab].exists, "Expected the \(tab) capture destination.")
        }

        XCTAssertEqual(tabBar.buttons.count, 5, "Capture should expose project work without exposing editor, publishing, or diagnostics as primary iPhone destinations.")

        XCTAssertTrue(app.descendants(matching: .any)["CaptureNextSessionCard"].exists)
        XCTAssertFalse(
            app.descendants(matching: .any)["CaptureSessionListRow_preview-coaching-ready"].exists,
            "Today should not repeat the same next session in the Later session list."
        )
        XCTAssertTrue(app.buttons["New session"].exists)

        app.buttons["CaptureOpenNextSessionButton"].tap()
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

    func testEpisodeWatchStagesLeadClipWithoutInventingRecordingOrSharedMutation() {
        app.tabBars.buttons["Record"].tap()

        let card = app.descendants(matching: .any)["CaptureEpisodeWatchCard"]
        reveal(card)
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
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "An episode-bound Capture session should expose its canonical manuscript before the shared Watch controls."
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

    func testRehearsalReadinessMakesEveryPhysicalBoundaryVisibleBeforeRecord() {
        app.tabBars.buttons["Record"].tap()

        let card = app.descendants(matching: .any)[
            "CaptureRehearsalReadinessCard"
        ]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "The selected Session should expose one consolidated pre-record checklist."
        )
        XCTAssertTrue(app.staticTexts["Physical proof needed"].exists)
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
        XCTAssertTrue(manuscript.exists)
        XCTAssertTrue(manuscript.label.contains("The Swear Jar"))
        XCTAssertTrue(manuscript.label.contains("34 protected blocks"))

        let watch = app.descendants(matching: .any)[
            "CaptureRehearsalCheck_watch"
        ]
        XCTAssertTrue(watch.exists)
        XCTAssertTrue(watch.label.contains("Ted Lasso · Be Curious"))
        XCTAssertTrue(
            watch.label.contains("does not fake a protected download")
        )

        let runCheck = app.buttons["CaptureRehearsalRunCheck"]
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

    func testWorkKeepsProjectsTasksGoalsNotesAndTagsTogether() {
        app.tabBars.buttons["Work"].tap()
        let workScroll = app.scrollViews["CaptureWorkView"]
        XCTAssertTrue(workScroll.waitForExistence(timeout: 5))
        let newProject = app.buttons["CaptureWorkNewProjectInline"]
        XCTAssertTrue(
            newProject.exists,
            "Work must keep canonical project creation directly reachable beside the project list."
        )
        XCTAssertFalse(
            newProject.isEnabled,
            "Deterministic preview must expose New Project without pretending to create a canonical Nest."
        )
        XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkProjectPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureWorkProjectSummary"].exists)
        XCTAssertTrue(app.staticTexts["High Ground Odyssey"].exists)

        let searchField = app.descendants(matching: .any)["CaptureWorkSearchField"]
        XCTAssertTrue(searchField.waitForExistence(timeout: 3))
        XCTAssertTrue(searchField.isHittable, "Project Work search must be directly usable on iPhone.")
        searchField.tap()
        searchField.typeText("Proof-listen")
        XCTAssertTrue(
            app.staticTexts["Proof-listen the episode opening"].waitForExistence(timeout: 3),
            "Work search must filter the retained project corpus through the visible shipping control."
        )
        let clearSearch = app.buttons["Clear work search"]
        XCTAssertTrue(clearSearch.isHittable)
        clearSearch.tap()
        XCTAssertEqual(searchField.value as? String, "Find work or a tag")
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

        app.tabBars.buttons["Work"].tap()
        let picker = app.descendants(matching: .any)["CaptureWorkProjectPicker"]
        reveal(picker)
        picker.tap()
        XCTAssertTrue(app.buttons["Charlie Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Charlie Home Nest"].tap()
        XCTAssertTrue(app.staticTexts["Private Home Nest"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Charlie Home Nest"].exists)
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
        let purpose = app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].firstMatch
        let audience = app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].firstMatch
        reveal(purpose)
        XCTAssertTrue(purpose.exists, "A Session note should make its purpose explicit before save.")
        XCTAssertTrue(audience.exists, "A Session note should make its audience explicit before save.")
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryNoteVisibilityReadback"].exists)
        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()

        let syncCard = app.descendants(matching: .any)["CaptureQuickEntrySyncCard"]
        XCTAssertTrue(syncCard.waitForExistence(timeout: 5))
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
        let purpose = app.descendants(matching: .any)["CaptureQuickEntryNoteKind"].firstMatch
        reveal(purpose)
        XCTAssertTrue(purpose.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].exists)
        let destination = app.descendants(matching: .any)["CaptureQuickEntryNoteDestination"].firstMatch
        reveal(destination)
        XCTAssertTrue(destination.exists)
        destination.tap()
        XCTAssertTrue(app.buttons["Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Home Nest"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Home Nest")
        ).firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Session, None")
        ).firstMatch.exists)
        XCTAssertTrue(app.textFields["CaptureQuickEntryTitle"].exists)
        let newTagField = app.textFields["CaptureQuickEntryNewTagField"]
        reveal(newTagField)
        XCTAssertTrue(newTagField.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "does not invent a Session")
        ).firstMatch.exists)
        XCTAssertTrue(purpose.waitForNonExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntryNoteVisibility"].waitForNonExistence(timeout: 3))
    }

    func testSessionQuickNoteMakesDecisionAndClientSafeAudienceObviousWithoutClaimingDelivery() {
        app.tabBars.buttons["Record"].tap()
        let noteButton = app.buttons["CaptureQuickEntry_NOTE_preview-coaching-ready"]
        reveal(noteButton)
        noteButton.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_NOTE"].waitForExistence(timeout: 5))

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

        let readback = app.descendants(matching: .any)["CaptureQuickEntryNoteVisibilityReadback"].firstMatch
        XCTAssertTrue(readback.exists)
        XCTAssertTrue(readback.label.contains("Client-safe"))
        let boundary = app.descendants(matching: .any)["CaptureQuickEntryNotePolicyBoundary"].firstMatch
        XCTAssertTrue(boundary.exists)
        XCTAssertTrue(boundary.label.contains("not sent"))
        XCTAssertTrue(boundary.label.contains("never sends a message"))
    }

    func testPacketNoteLanesExposeSourceTruthAndKeepPreviewReviewReadOnly() {
        app.tabBars.buttons["Record"].tap()
        let lanesToggle = app.descendants(matching: .any)["CapturePacketReviewLanesToggle"].firstMatch
        reveal(lanesToggle)
        XCTAssertTrue(lanesToggle.isHittable)
        lanesToggle.tap()

        let clientLane = app.descendants(matching: .any)["CapturePacketReviewLane_client-follow-up"].firstMatch
        reveal(clientLane)
        XCTAssertTrue(clientLane.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "no note, task, goal, client delivery")
        ).firstMatch.exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketReviewEmptyLaneSummary"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["CapturePacketReviewLane_empty-quotes"].exists)
        clientLane.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketLaneReviewSheet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Derived from transcript packet summary evidence only")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "creates no canonical note")
        ).firstMatch.exists)
        let approve = app.buttons["CapturePacketLaneApprove"].firstMatch
        reveal(approve)
        XCTAssertTrue(approve.exists)
        XCTAssertFalse(approve.isEnabled, "Preview must demonstrate lane review without mutating saved packet state.")
        XCTAssertTrue(app.staticTexts["Preview shows the production review workflow without changing saved packet state."].exists)
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

        let edit = app.buttons["CaptureSessionNoteEdit_preview-session-note"].firstMatch
        reveal(edit)
        XCTAssertTrue(edit.isHittable)
        edit.tap()
        XCTAssertTrue(app.descendants(matching: .any)["CaptureSessionNoteEditSheet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Editing never sends a message")
        ).firstMatch.exists)

        let title = app.textFields["CaptureSessionNoteEditTitle"].firstMatch
        title.tap()
        title.typeKey("a", modifierFlags: .command)
        title.typeText("Reviewed opening")
        let body = app.textFields["CaptureSessionNoteEditBody"].firstMatch
        body.tap()
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
        reveal(taskButton)
        XCTAssertTrue(taskButton.isHittable)
        taskButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["CaptureQuickEntrySheet_TASK"].waitForExistence(timeout: 5))
        let destination = app.descendants(matching: .any)["CaptureQuickEntryDestination"].firstMatch
        XCTAssertTrue(destination.exists)
        destination.tap()
        XCTAssertTrue(app.buttons["Home Nest"].waitForExistence(timeout: 3))
        app.buttons["Home Nest"].tap()
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Home Nest")
        ).firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Session, None")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private Home Nest work assigned to you")
        ).firstMatch.exists)

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

        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Destination, High Ground Odyssey")
        ).firstMatch.waitForExistence(timeout: 3))
        XCTAssertTrue(app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Project capture, No Session invented")
        ).firstMatch.exists)

        let episodeTag = app.buttons["CaptureQuickEntryTag_preview-episode-4"].firstMatch
        reveal(episodeTag)
        XCTAssertTrue(episodeTag.isHittable)
        episodeTag.tap()
        XCTAssertEqual(episodeTag.value as? String, "Selected")
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "New names stay protected on this iPhone")
        ).firstMatch.exists)
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
        XCTAssertTrue(timezoneBoundary.label.contains("even if this iPhone travels"))
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
        XCTAssertTrue(boundary.label.contains("does not schedule an alert or provider calendar event"))

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testTaskQuickCaptureKeepsReminderIntentSeparateAndExplainsPermissionBoundary() {
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
        XCTAssertTrue(boundary.label.contains("intent syncs to Nest"))
        XCTAssertTrue(boundary.label.contains("privately schedules the alert"))
        XCTAssertTrue(boundary.label.contains("only when you save"))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Due dates organize Quipsly")
        ).firstMatch.exists)

        let save = app.buttons["CaptureQuickEntrySave"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Preview only — no note, task, goal, or source was saved."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["CaptureQuickEntryRetry"].exists)
    }

    func testExplicitReminderUsesSystemPermissionAndRecoversAfterRelaunch() {
        let owner = "reminder-system-ui-\(UUID().uuidString.lowercased())"
        let launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=\(owner)",
            "--capture-reminder-system-ui-test",
        ]
        app.terminate()
        app.launchArguments = launchArguments
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))

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

        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow"].firstMatch
        if allow.waitForExistence(timeout: 5) {
            allow.tap()
            app.activate()
        }

        let projection = app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private task alert scheduled on this iPhone")
        ).firstMatch
        XCTAssertTrue(projection.waitForExistence(timeout: 10), app.debugDescription)
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
        XCTAssertTrue(recoveredProjection.waitForExistence(timeout: 10))
        XCTAssertTrue(recoveredProjection.label.contains("1 of 1 private task alert"))
        XCTAssertTrue(app.staticTexts["Task · Private reminder projection proof"].exists)

        app.terminate()
        app.launchArguments = [
            "--capture-ui-preview",
            "--capture-ui-preview-tab=record",
            "--capture-share-owner-ui-preview=reminder-system-ui-other-\(UUID().uuidString.lowercased())",
            "--capture-reminder-system-ui-test",
        ]
        app.launch()
        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
        XCTAssertFalse(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "private task alert scheduled on this iPhone")
        ).firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Task · Private reminder projection proof"].exists)
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
        assertFocusedTranscriptSegment("preview-segment")
    }

    func testTodayWeeklyReviewKeepsPlannedActualAndMissingTimeTruthDistinct() {
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

        let decision = app.descendants(matching: .any)[
            "CaptureTodayFocusDecision_preview-block"
        ]
        reveal(decision)
        XCTAssertTrue(
            decision.waitForExistence(timeout: 8),
            "An offline completion must remain visibly protected before Nest acknowledges it. \(app.debugDescription)"
        )
        XCTAssertTrue(app.staticTexts["Protected focus outbox"].exists)
        XCTAssertTrue(app.staticTexts["Saved on this iPhone · waiting for Nest"].exists)
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
        let card = app.descendants(matching: .any)["CaptureCalendarContinuityCard"]
        reveal(card)
        XCTAssertTrue(
            card.waitForExistence(timeout: 5),
            "Today should make calendar continuity reachable without adding a sixth primary tab."
        )
        let manage = app.buttons["CaptureCalendarManage"]
        XCTAssertTrue(manage.isHittable)
        manage.tap()

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

    func testTodayPreparesOneScheduledSessionInAppleCalendarEditorWithoutBroadAccess() {
        let button = app.buttons["CaptureAddNextSessionToCalendar"]
        reveal(button)
        XCTAssertTrue(
            button.isHittable,
            "A scheduled next Session should offer Apple's explicit one-event editor."
        )
        XCTAssertTrue(button.label.contains("Add to Apple Calendar"))
        button.tap()

        XCTAssertTrue(
            app.navigationBars["New Event"].waitForExistence(timeout: 8),
            "EventKitUI should present Apple's system-owned editor instead of asking Quipsly for calendar read access."
        )
        let cancel = app.buttons["Cancel"]
        XCTAssertTrue(cancel.exists)
        cancel.tap()

        let status = app.staticTexts["CaptureCalendarEditorStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertTrue(status.label.contains("will not read"))
        XCTAssertTrue(status.label.contains("verify the result"))
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

    func testTodayReviewsPrivateSourceInboxWithoutInventingResearchFiling() {
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
        let noSideEffects = app.staticTexts.matching(
            NSPredicate(
                format: "label CONTAINS %@",
                "No task, calendar event, message, delivery, provider request, or publication"
            )
        ).firstMatch
        reveal(noSideEffects)
        XCTAssertTrue(noSideEffects.exists)
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
        XCTAssertTrue(app.buttons["CapturePacketNoteSourceButton_packet-note-preview-build-coaching-insights-preview-segment"].exists)
        let packetNoteReview = app.buttons["CapturePacketReviewNoteButton"]
        XCTAssertTrue(packetNoteReview.isEnabled, "Preview may inspect note purpose and audience while the final write stays disabled.")
        packetNoteReview.tap()
        XCTAssertTrue(app.textFields["CapturePacketNoteTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketNoteBodyField"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteKindPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteVisibilityPicker"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketNoteAudienceBoundary"].exists)
        XCTAssertFalse(app.buttons["CapturePacketCreateNoteButton"].isEnabled)
        let packetNoteBoundary = app.staticTexts["CapturePacketNoteBoundary"]
        reveal(packetNoteBoundary)
        XCTAssertTrue(packetNoteBoundary.label.contains("no task, goal, reminder, calendar event, message, client delivery, Studio edit, or publication"))
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
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let followUp = app.buttons["CaptureCoachClientFollowUp"].firstMatch
        reveal(followUp)
        XCTAssertTrue(followUp.waitForExistence(timeout: 5))
        XCTAssertTrue(
            app.staticTexts["Private revision 1"].waitForExistence(timeout: 5),
            "The coach must see the exact private revision before reviewing or releasing it."
        )

        let recorderScroll = app.scrollViews["CaptureRecorderView"].firstMatch
        let source = app.descendants(matching: .any)["CaptureClientFollowUpSource_note_preview-follow-up-note"].firstMatch
        revealBelow(source, in: recorderScroll)
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
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])

        let back = app.navigationBars["Transcript review"].buttons.firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))

        let save = app.buttons["CaptureCoachFollowUpSave"]
        revealBelow(save, in: recorderScroll)
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertFalse(save.isEnabled, "Preview may inspect the canonical draft but must not save another revision.")
        let release = app.buttons["CaptureCoachFollowUpRelease"]
        revealBelow(release, in: recorderScroll)
        XCTAssertTrue(release.waitForExistence(timeout: 5))
        XCTAssertFalse(release.isEnabled, "Preview must not release a coaching follow-up.")
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
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
        let packetTaskAccept = app.buttons["CapturePacketTaskAcceptButton"]
        reveal(packetTaskAccept)
        XCTAssertTrue(app.descendants(matching: .any)["CapturePacketTaskReviewSection"].exists)
        XCTAssertTrue(app.buttons["CapturePacketTaskSource_preview-segment"].exists)
        XCTAssertTrue(packetTaskAccept.isEnabled, "Preview may inspect task materialization choices while the final write stays disabled.")
        XCTAssertFalse(app.buttons["CapturePacketTaskDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketTaskRejectButton"].isEnabled)
        packetTaskAccept.tap()
        XCTAssertTrue(app.textFields["CapturePacketTaskCreateTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketTaskCreateDetailField"].exists)
        XCTAssertTrue(app.segmentedControls["CapturePacketTaskOwnerPicker"].exists)
        XCTAssertTrue(app.switches["CapturePacketTaskDueDateToggle"].exists)
        XCTAssertTrue(app.buttons["CapturePacketTaskTag_preview-follow-through"].exists)
        XCTAssertTrue(app.buttons["CapturePacketTaskTag_preview-coaching"].exists)
        XCTAssertFalse(app.buttons["CapturePacketTaskCreateButton"].isEnabled)
        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
        let taskReviewScreenshot = XCTAttachment(screenshot: app.screenshot())
        taskReviewScreenshot.name = "Transcript task materialization review"
        taskReviewScreenshot.lifetime = .keepAlways
        add(taskReviewScreenshot)
        app.buttons["CapturePacketTaskCancelCreateButton"].tap()
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
        XCTAssertTrue(packetGoalAccept.isEnabled, "Preview may inspect every goal field while the final mutation remains disabled.")
        XCTAssertFalse(app.buttons["CapturePacketGoalDeferButton"].isEnabled)
        XCTAssertFalse(app.buttons["CapturePacketGoalRejectButton"].isEnabled)
        packetGoalAccept.tap()
        XCTAssertTrue(app.textFields["CapturePacketGoalCreateTitleField"].exists)
        XCTAssertTrue(app.textFields["CapturePacketGoalCreateDescriptionField"].exists)
        XCTAssertTrue(app.switches["CapturePacketGoalTargetDateToggle"].exists)
        XCTAssertTrue(app.buttons["CapturePacketGoalTag_preview-follow-through"].exists)
        XCTAssertTrue(app.buttons["CapturePacketGoalTag_preview-coaching"].exists)
        XCTAssertFalse(app.buttons["CapturePacketGoalCreateButton"].isEnabled)
        app.buttons["CapturePacketGoalCancelCreateButton"].tap()
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
        XCTAssertTrue(noteBoundary.label.contains("does not correct the transcript, create work, send, deliver, schedule, or publish anything"))
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
        XCTAssertTrue(goalBoundary.isHittable, "The complete no-side-effects boundary should be readable before goal creation.")
        XCTAssertTrue(goalBoundary.label.contains("creates no task, target date, reminder, calendar event, message, or publication"))
    }

    func testSourceEvidencePreviewShowsTruthBoundariesWithoutCreatingAReceipt() throws {
        app.tabBars.buttons["Library"].tap()
        XCTAssertTrue(app.scrollViews["CaptureLibraryView"].waitForExistence(timeout: 5))

        let evidenceLink = app.buttons["CaptureSourceEvidencePreviewLink"]
        XCTAssertTrue(evidenceLink.waitForExistence(timeout: 5))
        evidenceLink.tap()

        XCTAssertTrue(app.scrollViews["CaptureSourceEvidenceView"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureSourceEvidenceRoomBoundaryStatus"].exists)
        let previewBoundary = app.descendants(matching: .any)["CaptureSourceEvidencePreviewBoundary"]
        XCTAssertTrue(previewBoundary.exists)
        XCTAssertTrue(previewBoundary.label.contains("no evidence file created"))
        let nestPreviewBoundary = app.descendants(matching: .any)["CaptureNestEvidencePreviewBoundary"]
        XCTAssertTrue(nestPreviewBoundary.exists)
        XCTAssertTrue(nestPreviewBoundary.label.contains("no network request"))
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
        let sourceLink = app.buttons["CaptureTodayGoalSourceLink_preview-goal"]
        reveal(sourceLink)
        XCTAssertTrue(sourceLink.isHittable, "A transcript-derived goal should keep a one-action route back to its exact segment.")
        sourceLink.tap()
        XCTAssertTrue(app.scrollViews["CaptureTranscriptReviewView"].waitForExistence(timeout: 5))
        assertFocusedTranscriptSegment("preview-segment")
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

        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(
            saveChoices.isHittable,
            "The final consent action should remain reachable while the person reviews each choice."
        )
        XCTAssertFalse(saveChoices.isEnabled)

        let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
        let recordVideo = app.switches["CaptureConsentRecordVideoToggle"]
        let transcribe = app.switches["CaptureConsentTranscriptionToggle"]
        XCTAssertTrue(recordAudio.exists)
        XCTAssertTrue(recordVideo.exists)
        XCTAssertTrue(transcribe.exists)
        XCTAssertEqual(recordVideo.value as? String, "0", "Video must default off and require its own opt-in.")
        XCTAssertEqual(transcribe.value as? String, "0", "Transcription must default off and require its own opt-in.")

        turnOn(recordAudio)
        XCTAssertEqual(
            app.switches["CaptureConsentTranscriptionToggle"].value as? String,
            "0",
            "Recording must remain independently grantable with transcription off."
        )

        let nearbyPeopleChoice = app.switches["CaptureConsentAudibleParticipantsToggle"]
        reveal(nearbyPeopleChoice)
        XCTAssertTrue(nearbyPeopleChoice.exists)
        turnOn(nearbyPeopleChoice)

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
        XCTAssertTrue(readyStart.isEnabled, "The local recorder should become available once explicit choices and nearby-person agreement are saved.")
        XCTAssertEqual(app.staticTexts["CaptureRecorderStateLabel"].label, "Consent ready · mic checks on tap")
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
        app.buttons["CaptureConfirmConsentButton"].tap()

        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))
        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(
            saveChoices.isHittable,
            "The final consent action must remain reachable without scrolling even at the largest accessibility text size."
        )
        XCTAssertFalse(saveChoices.isEnabled)

        try app.performAccessibilityAudit(for: [
            .hitRegion,
            .sufficientElementDescription,
            .textClipped,
        ])
    }

    func testVideoModesExplainAndExposeTheExactLocalSourceBeforeCameraPermission() {
        app.tabBars.buttons["Record"].tap()

        let modePicker = app.segmentedControls["CaptureRecordingModePicker"]
        XCTAssertTrue(modePicker.waitForExistence(timeout: 5))
        XCTAssertEqual(modePicker.buttons.count, 4)

        modePicker.buttons["A/V"].tap()
        XCTAssertTrue(app.otherElements["CaptureVideoRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["CaptureVideoPreviewPlaceholder"].exists)
        XCTAssertTrue(app.buttons["CaptureVideoPrepareButton"].exists)
        XCTAssertTrue(app.segmentedControls["CaptureVideoCameraPicker"].exists)
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Two immutable sources: a separate microphone master")
            ).firstMatch.exists,
            "Podcast A/V must explain both immutable local masters and human-reviewed sync before asking for camera permission."
        )
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureCoordinatedAudioStatus"].exists,
            "Podcast A/V must keep the separate microphone route and meter visible beside camera truth."
        )

        modePicker.buttons["Camera"].tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Video only: LiveKit carries the audible conversation.")
            ).firstMatch.exists,
            "Podcast camera must state that it records an independent video-only source before asking for camera permission."
        )

        modePicker.buttons["Solo"].tap()
        XCTAssertTrue(
            app.staticTexts.matching(
                NSPredicate(format: "label BEGINSWITH %@", "Camera and microphone share this local movie.")
            ).firstMatch.exists,
            "Solo video must state that the camera movie also owns local microphone audio."
        )

        modePicker.buttons["Audio"].tap()
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.otherElements["CaptureVideoRecorderHero"].exists)
    }

    func testVideoOnlyConsentDoesNotAccidentallyAuthorizeAudioCapture() {
        app.tabBars.buttons["Record"].tap()
        app.buttons["CaptureSessionChooser"].tap()
        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()

        app.buttons["CaptureConfirmConsentButton"].tap()
        let consentSheet = app.otherElements["CaptureConsentConfirmationSheet"]
        XCTAssertTrue(consentSheet.waitForExistence(timeout: 5))

        let recordAudio = app.switches["CaptureConsentRecordAudioToggle"]
        let recordVideo = app.switches["CaptureConsentRecordVideoToggle"]
        let saveChoices = app.buttons["CaptureConsentSaveChoicesButton"]
        XCTAssertTrue(saveChoices.exists)
        XCTAssertTrue(saveChoices.isHittable)
        XCTAssertFalse(saveChoices.isEnabled)
        XCTAssertEqual(recordAudio.value as? String, "0")
        turnOn(recordVideo)

        let nearbyPeople = app.switches["CaptureConsentAudibleParticipantsToggle"]
        reveal(nearbyPeople)
        turnOn(nearbyPeople)

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
            "Creating a session should close the chooser and land on that session's recorder."
        )
        XCTAssertTrue(app.otherElements["CaptureRecorderHero"].waitForExistence(timeout: 5))
        let confirmConsent = app.buttons["CaptureConfirmConsentButton"]
        reveal(confirmConsent)
        XCTAssertTrue(confirmConsent.exists)
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
            ("Today", app.scrollViews["CaptureTodayView"]),
            ("Work", app.scrollViews["CaptureWorkView"]),
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
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityExtraExtraExtraLarge",
        ]
        app.launch()

        XCTAssertTrue(app.navigationBars["Record"].waitForExistence(timeout: 12))
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

        let manuscript = app.descendants(matching: .any)[
            "CaptureEpisodeManuscriptCard"
        ]
        reveal(manuscript)
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

        let deletionButton = app.buttons["Request account deletion"]
        reveal(deletionButton)
        XCTAssertTrue(deletionButton.isHittable)
        deletionButton.tap()

        XCTAssertTrue(app.descendants(matching: .any)["AccountDeletionSheet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Expected timing"].exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "targets completion within 30 days")
        ).firstMatch.exists)
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Reopen Account to follow progress")
        ).firstMatch.exists)
        XCTAssertFalse(app.buttons["Submit"].isEnabled, "Preview mode must explain deletion without submitting a real request.")
    }

    func testStudioHandoffKeepsTheWholeCaptureGroupVisibleAcrossReadyRetryAndCompleteStates() {
        app.tabBars.buttons["Record"].tap()

        func chooseSession(_ id: String) {
            let chooser = app.buttons["CaptureSessionChooser"]
            XCTAssertTrue(chooser.waitForExistence(timeout: 5))
            chooser.tap()

            let row = app.buttons["CaptureSessionPicker_\(id)"]
            for _ in 0..<8 where !row.exists || !row.isHittable {
                app.swipeUp()
            }
            XCTAssertTrue(row.exists, "The deterministic capture-group fixture must be reachable in the real session picker.")
            XCTAssertTrue(row.isHittable)
            row.tap()
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
            expectedStatus: "2 sources ready",
            expectedActionIdentifier:
                "CaptureAttachToStudioButton_preview-studio-group-ready",
            expectedActionLabel: "Attach group",
            expectedActionEnabled: true,
            expectedDetail: "All 2 sources in this capture group passed exact-byte verification and can move to Studio together."
        )
        app.buttons["CaptureAttachToStudioButton_preview-studio-group-ready"].tap()
        XCTAssertTrue(app.staticTexts["Preview mode shows the Studio handoff without changing media."].exists)

        chooseSession("preview-studio-group-partial")
        assertHandoff(
            sessionID: "preview-studio-group-partial",
            expectedStatus: "1 of 2 in Studio",
            expectedActionIdentifier:
                "CaptureAttachToStudioButton_preview-studio-group-partial",
            expectedActionLabel: "Attach group",
            expectedActionEnabled: true,
            expectedDetail: "1 of 2 capture-group sources reached Studio. Retry safely to continue the exact same handoff."
        )

        chooseSession("preview-studio-group-complete")
        assertHandoff(
            sessionID: "preview-studio-group-complete",
            expectedStatus: "2 sources in Studio",
            expectedActionIdentifier:
                "CaptureOpenStudioReviewLink_preview-studio-group-complete",
            expectedActionLabel: "Review group sync",
            expectedActionEnabled: true,
            expectedDetail: "The complete 2-source capture group is attached to Studio. Every original remains immutable capture evidence."
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

    private func reveal(_ element: XCUIElement) {
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
        let scrollSurface = namedForm.exists
            ? namedForm
            : transcriptReview.exists ? transcriptReview : app.scrollViews.firstMatch
        // A LazyVStack removes distant rows from the accessibility tree. If a
        // target does not currently exist, search above first, then below,
        // instead of assuming every unseen control is farther down the page.
        for searchAbove in [true, false] {
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

    private func revealBelow(_ element: XCUIElement, in scrollSurface: XCUIElement) {
        let visibleBottom = app.frame.maxY - 96
        for _ in 0..<16 {
            if element.exists,
               element.isHittable,
               element.frame.minY >= app.frame.minY + 72,
               element.frame.maxY <= visibleBottom {
                return
            }
            if scrollSurface.exists {
                scrollSurface
                    .coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.72))
                    .press(
                        forDuration: 0.05,
                        thenDragTo: scrollSurface.coordinate(
                            withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)
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
        XCTAssertTrue(app.staticTexts["Leadership coaching session"].exists)
        keepScreenshot("01-today.png")

        launch(tab: "record", waitingFor: app.navigationBars["Record"])
        let chooser = app.buttons["CaptureSessionChooser"]
        XCTAssertTrue(chooser.waitForExistence(timeout: 5))
        chooser.tap()
        let consentNeededSession = app.staticTexts["High Ground pre-show"]
        XCTAssertTrue(consentNeededSession.waitForExistence(timeout: 5))
        consentNeededSession.tap()
        let confirmConsent = app.buttons["CaptureConfirmConsentButton"]
        XCTAssertTrue(confirmConsent.waitForExistence(timeout: 5))
        confirmConsent.tap()
        XCTAssertTrue(
            app.otherElements["CaptureConsentConfirmationSheet"].waitForExistence(timeout: 5)
        )
        turnOnConsentChoice("CaptureConsentRecordAudioToggle")
        turnOnConsentChoice("CaptureConsentRecordVideoToggle")
        turnOnConsentChoice("CaptureConsentTranscriptionToggle")
        turnOnConsentChoice("CaptureConsentAudibleParticipantsToggle")
        let saveConsent = app.buttons["Save these choices"]
        XCTAssertTrue(saveConsent.waitForExistence(timeout: 5))
        XCTAssertTrue(saveConsent.isEnabled)
        Thread.sleep(forTimeInterval: 0.8)
        keepScreenshot("02-record.png")

        launch(tab: "work", waitingFor: app.navigationBars["Work"])
        XCTAssertTrue(
            app.scrollViews["CaptureWorkView"].waitForExistence(timeout: 5)
        )
        XCTAssertFalse(app.buttons["CaptureWorkNewProject"].exists)
        XCTAssertFalse(app.buttons["CaptureWorkNewProjectInline"].exists)
        keepScreenshot("03-work.png")

        launch(tab: "library", waitingFor: app.navigationBars["Library"])
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureLibraryPreviewSourceCard"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Local audio source · 18.4 MB"].exists)
        XCTAssertTrue(app.staticTexts["Verified in Nest"].exists)
        XCTAssertFalse(app.staticTexts["Synthetic local source · 18.4 MB"].exists)
        keepScreenshot("04-library.png")

        launch(tab: "account", waitingFor: app.navigationBars["Account"])
        XCTAssertTrue(
            app.descendants(matching: .any)["CaptureAccountControlCard"]
                .waitForExistence(timeout: 5)
        )
        XCTAssertTrue(app.staticTexts["Privacy policy"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Account deletion information"].exists)
        XCTAssertTrue(app.buttons["Request account deletion"].exists)
        XCTAssertTrue(app.staticTexts["Privacy policy"].isHittable)
        XCTAssertTrue(app.buttons["Request account deletion"].isHittable)
        XCTAssertTrue(app.staticTexts["Alex Morgan"].exists)
        XCTAssertTrue(app.staticTexts["alex@example.com"].exists)
        XCTAssertFalse(app.staticTexts["preview@quipsly.local"].exists)
        for _ in 0..<5 { app.swipeDown() }
        Thread.sleep(forTimeInterval: 2.0)
        keepScreenshot("05-account.png")
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

    func testLoginLeadsWithNativeGoogleContinuityAndKeepsPasswordRecoveryReachableAtAccessibilityTextSize() {
        XCTAssertTrue(app.buttons["QuipslyCaptureGoogleSignInButton"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["QuipslyCaptureGoogleIdentityContinuityHint"].exists)
        XCTAssertTrue(app.textFields["QuipslyCaptureEmailField"].exists)
        XCTAssertTrue(app.secureTextFields["QuipslyCapturePasswordField"].exists)
        XCTAssertTrue(app.buttons["QuipslyCaptureSignInButton"].exists)

        reveal(app.buttons["QuipslyCapturePasswordResetButton"])
        XCTAssertTrue(app.buttons["QuipslyCapturePasswordResetButton"].exists)
    }

    func testLoginOffersPrivacyBoundedSupportBeforeAuthenticationAtAccessibilityTextSize() throws {
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
