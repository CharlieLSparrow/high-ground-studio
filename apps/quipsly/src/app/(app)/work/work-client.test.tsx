import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

import { applyTagMerge, applyTagMergeRollback, changeWorkTagTaxonomy, createAndAssignWorkTag, createWorkGoal, createWorkTask, createWorkVocabularyTag, editTaskRecurrence, editWorkGoal, editWorkTask, previewTagMerge, previewTagMergeRollback, replaceWorkTags, reviewImportedWorkTag, saveWeeklyCommitment, setWorkTaskReminder, updateWorkTaskStatus } from "./actions";
import { WorkClient } from "./work-client";
import type { WorkSnapshot } from "./work-model";

const refresh = jest.fn();
const replace = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, replace }) }));
jest.mock("./actions", () => ({
  applyTagMerge: jest.fn(),
  applyTagMergeRollback: jest.fn(),
  changeWorkTagTaxonomy: jest.fn(),
  createAndAssignWorkTag: jest.fn(),
  createWorkVocabularyTag: jest.fn(),
  createWorkGoal: jest.fn(),
  createWorkTask: jest.fn(),
  editTaskRecurrence: jest.fn(),
  editWorkGoal: jest.fn(),
  editWorkTask: jest.fn(),
  linkWorkGoalTask: jest.fn(),
  previewTagMerge: jest.fn(),
  previewTagMergeRollback: jest.fn(),
  recordWorkGoalProgress: jest.fn(),
  replaceWorkTags: jest.fn(),
  reviewImportedWorkTag: jest.fn(),
  saveWeeklyCommitment: jest.fn(),
  setWorkTaskReminder: jest.fn(),
  unlinkWorkGoalTask: jest.fn(),
  updateWorkGoalStatus: jest.fn(),
  updateTaskRecurrenceStatus: jest.fn(),
  updateWorkTaskStatus: jest.fn(),
}));

const snapshot: WorkSnapshot = {
  tasks: [{
    id: "task-1", title: "Finish episode notes", detail: "Use transcript evidence", status: "OPEN", dueAt: null, reminderAt: "2026-07-19T12:00:00.000Z", reminderId: "reminder-1", reminderStatus: "ACTIVE", reminderUpdatedAt: "2026-07-18T18:00:00.000Z", completedAt: null,
    createdAt: "2026-07-18T18:00:00.000Z", updatedAt: "2026-07-18T18:00:00.000Z", isOverdue: false, assigneeLabel: null,
    provenance: "Reviewed transcript timestamp", attentionReason: "Reviewed transcript follow-through", roomId: "room-1", sessionTitle: "Episode review", sessionStatus: "ENDED", workspaceSlug: null, bookingStart: null,
    project: null, tags: [], canEdit: true, canManageTags: true, canManageReminder: true,
    sourceAnchor: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", speakerAuthority: "source-binding", sourceBoundParticipantId: "participant-charlie", acceptedCorrectionId: "correction-1", recordingAssetId: "asset-1", playbackSourceId: "source-1" },
    lastMergedTranscriptEvidence: null,
  }],
  goals: [], commitments: [], weeklyReviews: [],
  counts: { openTasks: 1, attentionTasks: 1, overdueTasks: 0, completedTasks: 0, activeGoals: 0, activeCommitments: 0 },
  boundaries: { taskLimit: 500, canonicalGoalModel: true, legacySessionGoalCompatibility: true, externalSideEffects: false },
};

describe("Work Queue interactions", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(["task", "goal"] as const)("keeps shared colors and retained archived tags when editing %s tags", async entityKind => {
    const user = userEvent.setup();
    const archived = { id: "earlier", label: "Earlier focus", slug: "earlier", category: "topic", projectId: "project-1",
      hexColor: "#506b46", isActive: false, archivedAt: "2026-09-08T00:00:00.000Z", updatedAt: "2026-09-08T00:00:00.000Z", aliases: [] };
    const active = { ...archived, id: "research", label: "Research", slug: "research", isActive: true, archivedAt: null, hexColor: "#805a3b" };
    const unusedArchived = { ...archived, id: "retired", label: "Retired elsewhere" };
    const project = { id: "project-1", name: "Shared coaching", slug: "shared-coaching", role: "EDITOR", canWrite: true, tags: [archived, active, unusedArchived] };
    const goal = { id: "goal-1", title: "Prepare together", description: null, status: "ACTIVE" as const,
      targetAt: null, achievedAt: null, progressPercent: null, progressNote: null, provenance: "Canonical goal" as const,
      updatedAt: "2026-09-09T00:00:00.000Z", roomId: null, sessionTitle: null, sessionStart: null,
      project, tags: [archived], canEdit: true, canManageTags: true, parent: null, childCount: 0, linkedTasks: [], sourceAnchor: null };
    let finish!: (value: never) => void;
    jest.mocked(replaceWorkTags).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<WorkClient initialSnapshot={{ ...snapshot, tasks: [{ ...snapshot.tasks[0]!, project, tags: [archived] }], goals: [goal] }}
      initialView={entityKind === "goal" ? "goals" : "tasks"} projectOptions={[project]} />);
    const card = document.getElementById(`work-${entityKind}-${entityKind}-1`)!;
    await user.click(within(card).getByText("Edit Shared coaching tags"));
    const retained = screen.getByRole("checkbox", { name: "Earlier focus (archived)" });
    const research = screen.getByRole("checkbox", { name: "Research" });
    expect(retained).toBeChecked();
    expect(retained.closest("label")).toHaveStyle({ backgroundColor: "#506b46" });
    expect(research.closest("label")).toHaveStyle({ backgroundColor: "#805a3b" });
    expect(screen.queryByRole("checkbox", { name: /Retired elsewhere/ })).not.toBeInTheDocument();
    await user.click(research);
    await user.click(screen.getByRole("button", { name: "Save tags" }));
    expect(replaceWorkTags).toHaveBeenCalledWith(expect.objectContaining({ entityKind, tagIds: ["earlier", "research"] }));
    expect(screen.getByRole("button", { name: "Create & apply" })).toBeDisabled();
    expect(retained).toBeDisabled();
    finish({ ok: true } as never);
    await screen.findByText("Tags saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("starts with tasks and preserves writing when switching optional work views", async () => {
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    expect(screen.getByRole("heading", { name: snapshot.tasks[0]!.title })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Weekly review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Goals" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Keep my next idea");
    await user.click(screen.getByRole("button", { name: "Goals" }));
    await user.type(screen.getByRole("textbox", { name: "Goal title" }), "Write the next chapter");
    expect(replace).toHaveBeenLastCalledWith("/work?view=goals", { scroll: false });
    await user.click(screen.getByRole("button", { name: "Tasks" }));
    expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("Keep my next idea");
    await user.click(screen.getByRole("button", { name: "Goals" }));
    expect(screen.getByRole("textbox", { name: "Goal title" })).toHaveValue("Write the next chapter");
    await user.click(screen.getByRole("button", { name: "Weekly planning" }));
    expect(screen.getByRole("region", { name: "Weekly commitments" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Weekly review" })).toBeVisible();
    expect(createWorkTask).not.toHaveBeenCalled();
    expect(createWorkGoal).not.toHaveBeenCalled();
    expect(saveWeeklyCommitment).not.toHaveBeenCalled();
  });

  it("keeps a task draft after a failed save and retries from the same form", async () => {
    const user = userEvent.setup();
    jest.mocked(createWorkTask).mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE", error: "Could not save. Try again." })
      .mockResolvedValueOnce({ ok: true, taskId: "recovered", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" })
      .mockResolvedValueOnce({ ok: true, taskId: "new", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "new-receipt" });
    render(<WorkClient initialSnapshot={snapshot} />);
    const title = screen.getByRole("textbox", { name: "Task title" });
    await user.type(title, "Capture this before I forget");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not save");
    expect(title).toHaveValue("Capture this before I forget");
    expect(title).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(createWorkTask).toHaveBeenCalledTimes(2));
    expect(createWorkTask).toHaveBeenNthCalledWith(2, jest.mocked(createWorkTask).mock.calls[0]![0]);
    await waitFor(() => expect(title).toHaveValue(""));
    expect(title).toBeEnabled();
    await user.type(title, "A deliberately new task");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(jest.mocked(createWorkTask).mock.calls[2]![0].clientRequestId).not.toBe(jest.mocked(createWorkTask).mock.calls[0]![0].clientRequestId);
  });

  it.each(["tasks", "goals"] as const)("recovers a thrown %s save using the identical command, even after switching views", async view => {
    const user = userEvent.setup();
    const action = view === "tasks" ? jest.mocked(createWorkTask) : jest.mocked(createWorkGoal);
    action.mockRejectedValueOnce(new Error("Connection dropped"));
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "recovered", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" });
    jest.mocked(createWorkGoal).mockResolvedValue({ ok: true, goalId: "recovered", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" });
    render(<WorkClient initialSnapshot={snapshot} initialView={view} />);
    const title = screen.getByRole("textbox", { name: view === "tasks" ? "Task title" : "Goal title" });
    await user.type(title, "Do not lose this idea");
    await user.click(screen.getByRole("button", { name: view === "tasks" ? "Add task" : "Add goal" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Retry to recover");
    expect(title).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Weekly planning" }));
    await user.click(screen.getByRole("button", { name: view === "tasks" ? "Tasks" : "Goals" }));
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1]![0]).toEqual(action.mock.calls[0]![0]);
    expect(action.mock.calls[0]![0].clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(title).toBeEnabled());
    expect(title).toHaveValue("");
  });

  it("allows a rejected input to be corrected without retaining a failed command", async () => {
    const user = userEvent.setup();
    jest.mocked(createWorkTask).mockResolvedValueOnce({ ok: false, code: "INVALID_INPUT", error: "Choose a different Nest." })
      .mockResolvedValueOnce({ ok: true, taskId: "corrected", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" });
    render(<WorkClient initialSnapshot={snapshot} />);
    const title = screen.getByRole("textbox", { name: "Task title" });
    await user.type(title, "First draft");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("different Nest");
    expect(title).toBeEnabled();
    await user.clear(title);
    await user.type(title, "Corrected draft");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(createWorkTask).toHaveBeenCalledTimes(2));
    expect(jest.mocked(createWorkTask).mock.calls[1]![0]).toMatchObject({ title: "Corrected draft" });
    expect(jest.mocked(createWorkTask).mock.calls[1]![0].clientRequestId).not.toBe(jest.mocked(createWorkTask).mock.calls[0]![0].clientRequestId);
  });

  it("does not forget an uncertain save when a later retry temporarily loses authorization", async () => {
    const user = userEvent.setup();
    jest.mocked(createWorkTask).mockRejectedValueOnce(new Error("Lost reply"))
      .mockResolvedValueOnce({ ok: false, code: "AUTH_REQUIRED", error: "Sign in again." })
      .mockResolvedValueOnce({ ok: true, taskId: "recovered", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" });
    render(<WorkClient initialSnapshot={snapshot} />);
    const title = screen.getByRole("textbox", { name: "Task title" });
    await user.type(title, "Keep the original request");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.click(await screen.findByRole("button", { name: "Retry save" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sign in again");
    expect(title).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    await waitFor(() => expect(createWorkTask).toHaveBeenCalledTimes(3));
    expect(jest.mocked(createWorkTask).mock.calls.map(call => call[0])).toEqual(Array(3).fill(jest.mocked(createWorkTask).mock.calls[0]![0]));
  });

  it.each(["goals", "weekly"] as const)("keeps the %s draft when saving fails", async view => {
    const user = userEvent.setup();
    jest.mocked(createWorkGoal).mockResolvedValue({ ok: false, code: "UNAVAILABLE", error: "Save failed. Try again." });
    jest.mocked(saveWeeklyCommitment).mockResolvedValue({ ok: false, code: "UNAVAILABLE", error: "Save failed. Try again." });
    render(<WorkClient initialSnapshot={snapshot} initialView={view} />);
    const input = screen.getByRole("textbox", { name: view === "goals" ? "Goal title" : "First commitment" });
    await user.type(input, "Keep this useful idea");
    await user.click(screen.getByRole("button", { name: view === "goals" ? "Add goal" : "Save weekly plan" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Save failed");
    expect(input).toHaveValue("Keep this useful idea");
    if (view === "weekly") expect(saveWeeklyCommitment).toHaveBeenCalledWith(expect.objectContaining({ clientReviewed: false }));
  });

  it("keeps the chosen Nest ready for the next task after saving", async () => {
    const user = userEvent.setup();
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "nest-task", updatedAt: "2026-09-09T04:00:00.000Z", receiptId: "receipt" });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[{ id: "writing", slug: "writing", name: "Writing", role: "OWNER", canWrite: true, tags: [] }]} />);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Keep working in this Nest");
    await user.click(screen.getByText("Details, date & repeat"));
    const nest = within(screen.getByRole("region", { name: "Add a personal task" })).getByRole("combobox", { name: "Nest (optional)" });
    await user.selectOptions(nest, "writing");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Task added.");
    expect(nest).toHaveValue("writing");
    expect(screen.getByRole("textbox", { name: "Task title" })).toHaveValue("");
    expect(createWorkTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: "writing" }));
  });

  it("server-renders task, goal, and commitment dates from deterministic UTC snapshots", () => {
    const instant = "2026-07-19T00:30:00.000Z";
    const html = renderToString(<WorkClient initialSnapshot={{
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0]!, dueAt: instant }],
      goals: [{
        id: "goal-date",
        title: "Keep dates stable through hydration",
        description: null,
        status: "ACTIVE",
        targetAt: instant,
        achievedAt: null,
        progressPercent: null,
        progressNote: null,
        provenance: "Canonical goal",
        updatedAt: instant,
        roomId: null,
        sessionTitle: null,
        sessionStart: null,
        project: null,
        tags: [],
        canEdit: true,
        canManageTags: true,
        parent: null,
        childCount: 0,
        linkedTasks: [],
        sourceAnchor: null,
      }],
      commitments: [{
        id: "commitment-date",
        weekStartsAt: instant,
        status: "ACTIVE",
        commitments: ["Verify the rendered boundary"],
        supportNeeded: null,
        progressNotes: null,
        clientReviewedAt: instant,
        coachNotes: null,
        clientLabel: "QA",
        reviewerLabel: null,
        updatedAt: instant,
        isOwnedByActor: true,
      }],
      counts: { ...snapshot.counts, activeGoals: 1, activeCommitments: 1 },
    }} />);

    expect(html).toContain("Jul 19, 2026, UTC");
    expect(html).toContain("Jul 19, 2026, 12:30 AM UTC");
    expect(html).not.toContain("Invalid date");
  });

  it("returns a reviewed transcript task to its exact segment", () => {
    render(<WorkClient initialSnapshot={snapshot} />);
    const link = screen.getByRole("link", { name: "Return to 0:03–0:04" });
    expect(link).toHaveAttribute("href", "/sessions/room-1?mode=transcript&source=asset-1&at=3.66#transcript-segment-segment-1");
    expect(screen.getByText(/Charlie: Welcome, everybody/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Participant recording\. This speaker comes from that participant's isolated recording\./i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === "SPAN"
      && element.textContent?.startsWith("Reminder ") === true
      && element.textContent.includes("2026")
    ))).toBeInTheDocument();
  });

  it("returns a source-backed task to the exact card, source set, and board", () => {
    render(<WorkClient initialSnapshot={{
      ...snapshot,
      tasks: [{
        ...snapshot.tasks[0],
        provenance: "Source-backed story action",
        sourceAnchor: null,
        project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        sourceCardAnchor: {
          schema: "quipsly-source-card-action-anchor-v1",
          projectSlug: "high-ground",
          storyCardId: "card-1",
          storyCardStableId: "source-card:lake-reveal",
          storyCardTitle: "Lake reveal",
          storyCardRevision: 3,
          sourceRangeId: "range-1",
          startSeconds: 12.25,
          endSeconds: 24.5,
          selectorSha256: "a".repeat(64),
          sourceRevisionId: "revision-1",
          sourceRevisionIdentitySha256: "b".repeat(64),
          sourceSetId: "set-1",
          captureKey: "VID_004",
          sourceDisplayName: "Episode 5 segment 4",
          boardId: "board-1",
          boardTitle: "Insta360 selects",
          boardSection: "episode-open",
          boardLane: "b-roll",
        },
      }],
    }} />);

    expect(screen.getByText("Exact source-card evidence")).toBeInTheDocument();
    expect(screen.getByText(/Card revision 3.*Episode 5 segment 4.*0:12–0:24/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open exact source select" })).toHaveAttribute(
      "href",
      "/nests/high-ground/story?set=set-1&board=board-1#story-card-card-1",
    );
  });

  it("moves canonical reminder intent without claiming device delivery", async () => {
    const user = userEvent.setup();
    jest.mocked(setWorkTaskReminder).mockResolvedValue({
      ok: true,
      taskId: "task-1",
      reminderId: "reminder-1",
      remindAt: "2026-07-19T12:00:00.000Z",
      status: "ACTIVE",
      updatedAt: "2026-07-18T18:00:01.000Z",
      operation: "RESCHEDULED",
      revisionId: "revision-1",
      idempotentReplay: false,
      deviceNotificationsReconciled: false,
      delivered: false,
    });
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.click(screen.getByText("Change reminder"));
    await user.clear(screen.getByLabelText("Remind me"));
    await user.type(screen.getByLabelText("Remind me"), "2026-07-24T10:30");
    await user.click(screen.getByRole("button", { name: "Move reminder" }));
    expect(setWorkTaskReminder).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      expectedTaskUpdatedAt: "2026-07-18T18:00:00.000Z",
      expectedReminderUpdatedAt: "2026-07-18T18:00:00.000Z",
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      remindAtLocal: "2026-07-24T10:30",
      timezone: expect.any(String),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("delivery is never promised");
    expect(refresh).toHaveBeenCalled();
  });

  it("edits a one-time task and due date without implying reminder or calendar changes", async () => {
    const user = userEvent.setup();
    jest.mocked(editWorkTask).mockResolvedValue({
      ok: true,
      taskId: "task-1",
      title: "Finish the Episode 5 outline",
      detail: "Use the saved opening note.",
      dueAt: "2026-07-25T15:00:00.000Z",
      updatedAt: "2026-07-18T19:00:00.000Z",
      receiptId: "edit-receipt",
    });
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.click(screen.getByText("Edit task"));
    const title = screen.getByRole("textbox", { name: "Edit task title" });
    await user.clear(title);
    await user.type(title, "Finish the Episode 5 outline");
    const detail = screen.getByRole("textbox", { name: "Edit task detail" });
    await user.clear(detail);
    await user.type(detail, "Use the saved opening note.");
    await user.type(screen.getByLabelText("Edit due date (optional)"), "2026-07-25T09:00");
    await user.click(screen.getByRole("button", { name: "Save task changes" }));

    expect(editWorkTask).toHaveBeenCalledWith({
      taskId: "task-1",
      title: "Finish the Episode 5 outline",
      detail: "Use the saved opening note.",
      dueLocal: "2026-07-25T09:00",
      timezone: expect.any(String),
      expectedUpdatedAt: "2026-07-18T18:00:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Task saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("returns a reviewed transcript goal to its exact segment", () => {
    const goalSnapshot: WorkSnapshot = {
      ...snapshot,
      goals: [{
        id: "goal-1",
        title: "Build the review habit",
        description: "Make follow-through visible.",
        status: "ACTIVE",
        targetAt: null,
        achievedAt: null,
        progressPercent: null,
        progressNote: null,
        provenance: "Canonical goal",
        updatedAt: "2026-07-18T18:00:00.000Z",
        roomId: "room-2",
        sessionTitle: "Coaching review",
        sessionStart: null,
        project: null,
        tags: [],
        canEdit: true,
        canManageTags: true,
        parent: null,
        childCount: 0,
        linkedTasks: [],
        sourceAnchor: {
          schema: "quipsly-transcript-derived-goal-v1",
          roomId: "room-2",
          transcriptJobId: "job-2",
          segmentId: "segment-2",
          startSeconds: 12.4,
          endSeconds: 17.8,
          providerTextSha256: "b".repeat(64),
          providerSpeakerLabel: "Speaker",
          effectiveTextSnapshot: "Build a repeatable coaching review habit.",
          effectiveSpeakerLabelSnapshot: "Homer",
          acceptedCorrectionId: "correction-2",
          recordingAssetId: "asset-2",
          playbackSourceId: "source-2",
        },
      }],
      counts: { ...snapshot.counts, activeGoals: 1 },
    };
    render(<WorkClient initialSnapshot={goalSnapshot} initialView="goals" />);
    const link = screen.getByRole("link", { name: "Return to 0:12–0:17" });
    expect(link).toHaveAttribute("href", "/sessions/room-2?mode=transcript&source=asset-2&at=12.4#transcript-segment-segment-2");
    expect(screen.getByText("Homer: Build a repeatable coaching review habit.")).toBeInTheDocument();
  });

  it("shows appended transcript evidence separately from numeric goal progress and returns to playback", () => {
    const goalSnapshot: WorkSnapshot = {
      ...snapshot,
      goals: [{
        id: "goal-merge",
        title: "Build the weekly review habit",
        description: "Review one evidence-backed commitment every Friday.",
        status: "ACTIVE",
        targetAt: null,
        achievedAt: null,
        progressPercent: 40,
        progressNote: "Two reviews completed.",
        provenance: "Canonical goal",
        updatedAt: "2026-08-03T14:00:00.000Z",
        roomId: null,
        sessionTitle: null,
        sessionStart: null,
        project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        tags: [],
        canEdit: true,
        canManageTags: true,
        parent: null,
        childCount: 0,
        linkedTasks: [],
        sourceAnchor: null,
        lastMergedTranscriptEvidence: {
          receiptId: "review-receipt-1",
          goalCandidateId: "packet-goal-build-1-segment-3",
          mergedAt: "2026-08-03T15:00:00.000Z",
          sourceAnchor: {
            schema: "quipsly-transcript-derived-goal-v1",
            roomId: "room-coaching",
            transcriptJobId: "job-coaching",
            segmentId: "segment-3",
            startSeconds: 63.2,
            endSeconds: 71.9,
            providerTextSha256: "c".repeat(64),
            providerSpeakerLabel: "Speaker",
            effectiveTextSnapshot: "The Friday review is helping me follow through.",
            effectiveSpeakerLabelSnapshot: "Scott",
            acceptedCorrectionId: "correction-3",
            recordingAssetId: "asset-coaching",
            playbackSourceId: "source-coaching",
          },
        },
      }],
      counts: { ...snapshot.counts, activeGoals: 1 },
    };

    render(<WorkClient initialSnapshot={goalSnapshot} initialView="goals" />);

    expect(screen.getByText("Progress: 40%")).toBeInTheDocument();
    expect(screen.getByText("Latest progress:").parentElement).toHaveTextContent("Two reviews completed.");
    expect(screen.getByText("Latest reviewed evidence added to this goal")).toBeInTheDocument();
    expect(screen.getByText("Scott: The Friday review is helping me follow through.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Return to 1:03–1:11" })).toHaveAttribute(
      "href",
      "/sessions/room-coaching?mode=transcript&source=asset-coaching&at=63.2#transcript-segment-segment-3",
    );
    expect(screen.getByText(/Evidence was appended without changing this goal’s definition/i)).toBeInTheDocument();
  });

  it("distinguishes a restored goal copy from same-titled current work", () => {
    const title = "Prove one complete Capture-to-Nest episode loop";
    const baseGoal = {
      title,
      description: "Preserved acceptance evidence.",
      status: "ACTIVE" as const,
      targetAt: null,
      achievedAt: null,
      progressPercent: 25,
      progressNote: "One boundary passed.",
      provenance: "Canonical goal" as const,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null,
      sessionTitle: null,
      sessionStart: null,
      project: null,
      tags: [],
      canEdit: true,
      canManageTags: true,
      parent: null,
      childCount: 0,
      linkedTasks: [],
      sourceAnchor: null,
    };
    const goalSnapshot: WorkSnapshot = {
      ...snapshot,
      goals: [
        { ...baseGoal, id: "goal-current" },
        {
          ...baseGoal,
          id: "goal-restored",
          restoredFromPortableBackup: true,
        },
      ],
      counts: { ...snapshot.counts, activeGoals: 2 },
    };

    render(<WorkClient initialSnapshot={goalSnapshot} initialView="goals" />);

    expect(
      screen.getByRole("heading", {
        name: /^Prove one complete Capture-to-Nest episode loop$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /^Prove one complete Capture-to-Nest episode loop — Restored copy$/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Restored copy")).toBeInTheDocument();
    expect(
      screen.getByText(/keeps its own Quipsly identity and history/i),
    ).toBeInTheDocument();
  });

  it("edits a canonical goal without implying progress, task, or calendar changes", async () => {
    const user = userEvent.setup();
    const goalSnapshot: WorkSnapshot = {
      ...snapshot,
      goals: [{
        id: "goal-1",
        title: "Build the review habit",
        description: "Make follow-through visible.",
        status: "ACTIVE",
        targetAt: null,
        achievedAt: null,
        progressPercent: 25,
        progressNote: "One review completed.",
        provenance: "Canonical goal",
        updatedAt: "2026-07-18T18:00:00.000Z",
        roomId: null,
        sessionTitle: null,
        sessionStart: null,
        project: null,
        tags: [],
        canEdit: true,
        canManageTags: true,
        parent: null,
        childCount: 0,
        linkedTasks: [],
        sourceAnchor: null,
      }],
      counts: { ...snapshot.counts, activeGoals: 1 },
    };
    jest.mocked(editWorkGoal).mockResolvedValue({
      ok: true,
      goalId: "goal-1",
      title: "Build a weekly review habit",
      description: "Review real evidence every Friday.",
      targetAt: "2026-09-01T18:00:00.000Z",
      updatedAt: "2026-07-18T18:00:01.000Z",
      receiptId: "goal-edit-receipt",
    });

    render(<WorkClient initialSnapshot={goalSnapshot} initialView="goals" />);
    const editGoalSummary = screen.getByText("Edit goal");
    await user.click(editGoalSummary);
    const goalEditor = editGoalSummary.closest("details");
    expect(goalEditor).not.toBeNull();
    const title = within(goalEditor!).getByRole("textbox", { name: "Goal title" });
    await user.clear(title);
    await user.type(title, "Build a weekly review habit");
    const description = within(goalEditor!).getByRole("textbox", { name: "Definition of success" });
    await user.clear(description);
    await user.type(description, "Review real evidence every Friday.");
    await user.type(within(goalEditor!).getByLabelText("Target date (optional)"), "2026-09-01");
    await user.click(within(goalEditor!).getByRole("button", { name: "Save goal changes" }));

    expect(editWorkGoal).toHaveBeenCalledWith({
      goalId: "goal-1",
      title: "Build a weekly review habit",
      description: "Review real evidence every Friday.",
      targetDecision: "SET",
      targetLocalDate: "2026-09-01",
      timezone: expect.any(String),
      expectedUpdatedAt: "2026-07-18T18:00:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Status, progress evidence, linked tasks, tags, source evidence, and external calendars were left unchanged");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps an untouched goal target instead of reinterpreting it in the browser timezone", async () => {
    const user = userEvent.setup();
    const goal = {
      id: "goal-keep-target",
      title: "Keep the original target",
      description: null,
      status: "ACTIVE" as const,
      targetAt: "2026-09-01T18:17:23.456Z",
      achievedAt: null,
      progressPercent: null,
      progressNote: null,
      provenance: "Canonical goal" as const,
      updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null,
      sessionTitle: null,
      sessionStart: null,
      project: null,
      tags: [],
      canEdit: true,
      canManageTags: true,
      parent: null,
      childCount: 0,
      linkedTasks: [],
      sourceAnchor: null,
    };
    jest.mocked(editWorkGoal).mockResolvedValue({
      ok: true,
      goalId: goal.id,
      title: "Keep the exact original target",
      description: null,
      targetAt: goal.targetAt,
      updatedAt: "2026-07-18T18:00:01.000Z",
      receiptId: "goal-edit-keep-receipt",
    });
    render(<WorkClient initialView="goals" initialSnapshot={{
      ...snapshot,
      goals: [goal],
      counts: { ...snapshot.counts, activeGoals: 1 },
    }} />);

    const editGoalSummary = screen.getByText("Edit goal");
    await user.click(editGoalSummary);
    const goalEditor = editGoalSummary.closest("details");
    expect(goalEditor).not.toBeNull();
    const title = within(goalEditor!).getByRole("textbox", { name: "Goal title" });
    await user.clear(title);
    await user.type(title, "Keep the exact original target");
    await user.click(within(goalEditor!).getByRole("button", { name: "Save goal changes" }));

    expect(editWorkGoal).toHaveBeenCalledWith(expect.objectContaining({
      goalId: goal.id,
      targetDecision: "KEEP",
      targetLocalDate: null,
    }));
  });

  it("opens the derived attention lens without creating an unread notification state", () => {
    render(<WorkClient initialSnapshot={snapshot} initialFilter="ATTENTION" />);
    expect(screen.getByRole("button", { name: "Attention" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Reviewed transcript follow-through")).toBeInTheDocument();
    expect(screen.getByText("Finish episode notes")).toBeInTheDocument();
  });

  it("keeps routine work focused while making the dedicated tag manager obvious", () => {
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [
      { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1", isActive: true },
    ] };
    const { rerender } = render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} />);
    expect(screen.queryByRole("heading", { name: "Shared tags" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage 1 tag" })).toHaveAttribute("href", "/work?manage=tags");

    rerender(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    expect(screen.getByRole("heading", { name: "Tags", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Work" })).toHaveAttribute("href", "/work");
    expect(screen.getByRole("combobox", { name: "Nest" })).toHaveValue("project-1");
    expect(screen.getByRole("searchbox", { name: "Find a tag or former name" })).toBeInTheDocument();
    const manageTag = screen.getByRole("button", { name: "Manage Proof listen" });
    expect(manageTag).toHaveTextContent(/^Manage$/);
  });

  it("opens the vocabulary manager on the project named by the project workspace link", () => {
    const firstProject = {
      id: "project-1", name: "Home", slug: "home", role: "OWNER", canWrite: true, tags: [],
    };
    const requestedProject = {
      id: "project-2",
      name: "High Ground Odyssey",
      slug: "high-ground",
      role: "EDITOR",
      canWrite: true,
      tags: [{ id: "tag-episode", label: "Episode", slug: "episode", category: "meaning", projectId: "project-2", isActive: true }],
    };

    render(
      <WorkClient
        initialSnapshot={snapshot}
        projectOptions={[firstProject, requestedProject]}
        manageTags
        initialProjectId="project-2"
      />,
    );

    expect(screen.getByRole("combobox", { name: "Nest" })).toHaveValue("project-2");
    expect(screen.getByRole("heading", { name: "High Ground Odyssey" })).toBeInTheDocument();
  });

  it("edits only the canonical Nest tag set and refreshes from persisted truth", async () => {
    const user = userEvent.setup();
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [
      { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1" },
      { id: "tag-episode", label: "Episode 4", slug: "episode-4", category: "meaning", projectId: "project-1" },
    ] };
    const taggedSnapshot: WorkSnapshot = {
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0], project, tags: [project.tags[0]], canManageTags: true }],
    };
    jest.mocked(replaceWorkTags).mockResolvedValue({ ok: true, entityKind: "task", entityId: "task-1", projectId: "project-1", tagIds: ["tag-proof", "tag-episode"], updatedAt: "2026-07-18T18:00:01.000Z", receiptId: "tag-receipt" });
    render(<WorkClient initialSnapshot={taggedSnapshot} projectOptions={[project]} />);
    expect(screen.getAllByText("#Proof listen")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Find all accessible work tagged Proof listen" })).toHaveAttribute("href", "/find?tag=tag-proof");
    await user.click(screen.getByText("Edit High Ground Odyssey tags"));
    await user.click(screen.getByRole("checkbox", { name: "Episode 4" }));
    await user.click(screen.getByRole("button", { name: "Save tags" }));
    expect(replaceWorkTags).toHaveBeenCalledWith({ entityKind: "task", entityId: "task-1", tagIds: ["tag-proof", "tag-episode"], expectedUpdatedAt: snapshot.tasks[0].updatedAt });
    expect(await screen.findByRole("status")).toHaveTextContent("Tags saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("previews tag color, saves once, and resets without an approval workflow", async () => {
    const user = userEvent.setup();
    const tag = { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1", isActive: true, archivedAt: null, hexColor: "#aabbcc", updatedAt: "2026-07-18T18:00:00.000Z", aliases: [] };
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [tag] };
    jest.mocked(changeWorkTagTaxonomy).mockResolvedValue({ ok: true, operation: "COLOR", projectId: project.id, tag, aliases: [], revision: 1, receiptId: "color-receipt" });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    await user.click(screen.getByRole("button", { name: "Manage Proof listen" }));
    expect(screen.getByRole("button", { name: "Save color" })).toBeDisabled();
    fireEvent.input(screen.getByLabelText("Color for Proof listen"), { target: { value: "#805a3b" } });
    expect(screen.getByRole("button", { name: "Save color" })).toBeEnabled();
    expect(screen.getAllByText("#Proof listen").some(element => element.style.backgroundColor === "rgb(128, 90, 59)")).toBe(true);
    fireEvent.change(screen.getByLabelText("Color for Proof listen"), { target: { value: "#506b46" } });
    expect(changeWorkTagTaxonomy).not.toHaveBeenCalled();
    expect(screen.getAllByText("#Proof listen").some(element => element.style.backgroundColor === "rgb(80, 107, 70)")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save color" }));
    expect(changeWorkTagTaxonomy).toHaveBeenLastCalledWith({ tagId: tag.id, operation: "COLOR", label: undefined, hexColor: "#506b46", expectedUpdatedAt: tag.updatedAt });
    expect(await screen.findByRole("status")).toHaveTextContent("Color saved for #Proof listen.");
    expect(refresh).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use theme color" }));
    await user.click(screen.getByRole("button", { name: "Save color" }));
    expect(changeWorkTagTaxonomy).toHaveBeenLastCalledWith(expect.objectContaining({ operation: "COLOR", hexColor: null }));
  });

  it("renames canonical vocabulary while explaining preserved aliases", async () => {
    const user = userEvent.setup();
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [
      { id: "tag-proof", label: "Proof listen", slug: "proof-listen", category: "workflow", projectId: "project-1", isActive: true, archivedAt: null, updatedAt: "2026-07-18T18:00:00.000Z", aliases: [] },
    ] };
    jest.mocked(changeWorkTagTaxonomy).mockResolvedValue({
      ok: true,
      operation: "RENAME",
      projectId: "project-1",
      tag: { id: "tag-proof", label: "Final listen", slug: "final-listen", isActive: true, archivedAt: null, updatedAt: "2026-07-18T18:00:01.000Z" },
      aliases: [{ id: "alias-proof", label: "Proof listen", slug: "proof-listen" }],
      revision: 1,
      receiptId: "taxonomy-receipt",
    });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    await user.click(screen.getByRole("button", { name: "Manage Proof listen" }));
    const renameInput = screen.getByRole("textbox", { name: "Rename Proof listen" });
    await user.clear(renameInput);
    await user.type(renameInput, "Final listen");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    expect(changeWorkTagTaxonomy).toHaveBeenCalledWith({
      tagId: "tag-proof",
      operation: "RENAME",
      label: "Final listen",
      expectedUpdatedAt: "2026-07-18T18:00:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("former name remains a reusable alias");
    expect(refresh).toHaveBeenCalled();
  });

  it("creates reusable Nest vocabulary without attaching it to a record", async () => {
    const user = userEvent.setup();
    const project = {
      id: "project-1",
      name: "High Ground Odyssey",
      slug: "high-ground",
      role: "EDITOR",
      canWrite: true,
      tags: [],
    };
    jest.mocked(createWorkVocabularyTag).mockResolvedValue({
      ok: true,
      projectId: "project-1",
      tag: {
        id: "tag-media",
        label: "Media clip QA",
        slug: "media-clip-qa",
        isActive: true,
        archivedAt: null,
        updatedAt: "2026-07-30T18:00:01.000Z",
      },
      aliases: [],
      created: true,
      revision: 1,
      receiptId: "create-tag-receipt",
    });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    await user.type(screen.getByRole("textbox", { name: "New reusable tag" }), "Media clip QA");
    await user.click(screen.getByRole("button", { name: "Create tag" }));
    expect(createWorkVocabularyTag).toHaveBeenCalledWith({
      projectId: "project-1",
      label: "Media clip QA",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Created #Media clip QA for High Ground Odyssey.");
    expect(screen.getByRole("textbox", { name: "New reusable tag" })).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("adds an imported tag suggestion in one click without a review checkbox", async () => {
    const user = userEvent.setup();
    const project = {
      id: "project-1",
      name: "High Ground Odyssey",
      slug: "high-ground",
      role: "EDITOR",
      canWrite: true,
      tags: [],
      tagCandidates: [{
        id: "candidate-narrative",
        label: "Narrative evidence",
        slug: "narrative-evidence",
        status: "PENDING" as const,
        promotedTag: null,
        evidenceCount: 1,
        evidence: [{
          id: "evidence-1",
          sourceKind: "research-source-metadata",
          sourceIdentity: "manifest-1:source-1",
          labelSnapshot: "Narrative evidence",
          importedAt: "2026-07-23T16:00:00.000Z",
        }],
        reviewedAt: null,
        updatedAt: "2026-07-23T16:00:00.000Z",
      }],
    };
    const projectTaskSnapshot: WorkSnapshot = {
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0], project, tags: [], canManageTags: true }],
    };
    jest.mocked(reviewImportedWorkTag).mockResolvedValue({
      ok: true,
      operation: "PROMOTE",
      projectId: "project-1",
      candidate: {
        id: "candidate-narrative",
        label: "Narrative evidence",
        slug: "narrative-evidence",
        status: "PROMOTED",
        promotedTagId: "tag-narrative",
        reviewedAt: "2026-07-23T16:01:00.000Z",
        updatedAt: "2026-07-23T16:01:00.000Z",
      },
      tag: { id: "tag-narrative", label: "Narrative evidence", slug: "narrative-evidence", isActive: true },
      revision: 1,
      receiptId: "candidate-receipt",
    });
    const { rerender } = render(<WorkClient initialSnapshot={projectTaskSnapshot} projectOptions={[project]} />);

    await user.click(screen.getByText("Edit High Ground Odyssey tags"));
    expect(screen.queryByRole("checkbox", { name: "Narrative evidence" })).not.toBeInTheDocument();
    expect(screen.getByText("This Nest has no active tags yet. Create the first reusable tag below.")).toBeInTheDocument();

    rerender(<WorkClient initialSnapshot={projectTaskSnapshot} projectOptions={[project]} manageTags />);
    const suggestions = screen.getByRole("region", { name: "Tag suggestions for High Ground Odyssey" });
    expect(within(suggestions).queryByRole("checkbox")).not.toBeInTheDocument();
    const promoteButton = within(suggestions).getByRole("button", { name: "Add tag #Narrative evidence" });
    expect(promoteButton).toBeEnabled();
    await user.click(promoteButton);
    expect(reviewImportedWorkTag).toHaveBeenCalledWith({
      candidateId: "candidate-narrative",
      operation: "PROMOTE",
      expectedUpdatedAt: "2026-07-23T16:00:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Added #Narrative evidence.");
    expect(refresh).toHaveBeenCalled();
  });

  it("requires a verified impact preview and explicit confirmation before merging tags", async () => {
    const user = userEvent.setup();
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [
      { id: "tag-rough", label: "Rough cut", slug: "rough-cut", category: "production_breakdown", projectId: "project-1", isActive: true, archivedAt: null, updatedAt: "2026-07-18T18:00:00.000Z", aliases: [], mergedInto: null },
      { id: "tag-edit", label: "Episode edit", slug: "episode-edit", category: "production_breakdown", projectId: "project-1", isActive: true, archivedAt: null, updatedAt: "2026-07-18T18:01:00.000Z", aliases: [], mergedInto: null },
    ] };
    jest.mocked(previewTagMerge).mockResolvedValue({
      ok: true,
      preview: {
        projectId: "project-1",
        source: { id: "tag-rough", label: "Rough cut", slug: "rough-cut", updatedAt: "2026-07-18T18:00:00.000Z" },
        target: { id: "tag-edit", label: "Episode edit", slug: "episode-edit", updatedAt: "2026-07-18T18:01:00.000Z" },
        counts: { documents: 0, tasks: 2, goals: 1, sessions: 1, coachingNotes: 0, annotations: 1, taggedSpans: 1, knowledgeNodes: 1, mediaClips: 1, aliases: 1, totalUses: 8 },
        deduplicated: { documents: 0, tasks: 1, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, mediaClips: 0 },
        blockingConflicts: {
          anchoredSpanCollisions: 0,
          aliasCollisions: [],
          relationLimitExceeded: false,
          personalDocumentOwnershipConflict: false,
        },
        impactHash: "a".repeat(64),
        canMerge: true,
        boundaries: { sourcePreservedAsRedirect: true, exactRollbackSnapshot: true, immutableSourceTextMutated: false, externalSideEffects: false },
      },
    });
    jest.mocked(applyTagMerge).mockResolvedValue({
      ok: true,
      projectId: "project-1",
      sourceTag: { id: "tag-rough", label: "Rough cut", slug: "rough-cut", isActive: false, mergedIntoTagId: "tag-edit", mergedAt: "2026-07-18T18:02:00.000Z", updatedAt: "2026-07-18T18:02:00.000Z" },
      targetTag: { id: "tag-edit", label: "Episode edit", slug: "episode-edit", updatedAt: "2026-07-18T18:02:00.000Z" },
      receiptId: "merge-receipt",
      impactHash: "a".repeat(64),
      counts: { documents: 0, tasks: 2, goals: 1, sessions: 1, coachingNotes: 0, annotations: 1, taggedSpans: 1, knowledgeNodes: 1, mediaClips: 1, aliases: 1, totalUses: 8 },
      deduplicated: { documents: 0, tasks: 1, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, mediaClips: 0 },
    });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    await user.click(screen.getByRole("button", { name: "Manage Rough cut" }));
    const sourceRow = screen.getByRole("button", { name: "Close Rough cut controls" }).closest("li");
    expect(sourceRow).not.toBeNull();
    await user.click(within(sourceRow!).getByText("Merge into another tag"));
    await user.selectOptions(within(sourceRow!).getByRole("combobox", { name: "Canonical target" }), "tag-edit");
    expect(within(sourceRow!).getByRole("button", { name: "Preview merge" })).toBeEnabled();
    expect(within(sourceRow!).queryByRole("button", { name: "Merge into #Episode edit" })).not.toBeInTheDocument();
    await user.click(within(sourceRow!).getByRole("button", { name: "Preview merge" }));
    expect(await within(sourceRow!).findByText("#Rough cut → #Episode edit")).toBeInTheDocument();
    const mergeButton = within(sourceRow!).getByRole("button", { name: "Merge into #Episode edit" });
    expect(mergeButton).toBeDisabled();
    await user.click(within(sourceRow!).getByRole("checkbox"));
    expect(mergeButton).toBeEnabled();
    await user.click(mergeButton);
    expect(previewTagMerge).toHaveBeenCalledWith({ sourceTagId: "tag-rough", targetTagId: "tag-edit" });
    expect(applyTagMerge).toHaveBeenCalledWith({
      sourceTagId: "tag-rough",
      targetTagId: "tag-edit",
      expectedImpactHash: "a".repeat(64),
      expectedSourceUpdatedAt: "2026-07-18T18:00:00.000Z",
      expectedTargetUpdatedAt: "2026-07-18T18:01:00.000Z",
    });
    expect(await within(sourceRow!).findByRole("status")).toHaveTextContent("8 exact uses were preserved");
    expect(refresh).toHaveBeenCalled();
  });

  it("fails closed until an exact merge rollback receipt is previewed and confirmed", async () => {
    const user = userEvent.setup();
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [
      { id: "tag-rough", label: "Rough cut", slug: "rough-cut", category: "production_breakdown", projectId: "project-1", isActive: false, archivedAt: "2026-07-18T18:02:00.000Z", updatedAt: "2026-07-18T18:02:00.000Z", aliases: [], mergedInto: { id: "tag-edit", label: "Episode edit", slug: "episode-edit" } },
      { id: "tag-edit", label: "Episode edit", slug: "episode-edit", category: "production_breakdown", projectId: "project-1", isActive: true, archivedAt: null, updatedAt: "2026-07-18T18:02:00.000Z", aliases: [], mergedInto: null },
    ] };
    jest.mocked(previewTagMergeRollback).mockResolvedValue({
      ok: true,
      preview: {
        receiptId: "merge-receipt",
        projectId: "project-1",
        source: { id: "tag-rough", label: "Rough cut", slug: "rough-cut", updatedAt: "2026-07-18T18:02:00.000Z" },
        target: { id: "tag-edit", label: "Episode edit", slug: "episode-edit", updatedAt: "2026-07-18T18:02:00.000Z" },
        counts: { documents: 0, tasks: 2, goals: 1, sessions: 1, coachingNotes: 0, annotations: 1, taggedSpans: 1, knowledgeNodes: 1, mediaClips: 1, aliases: 1, totalUses: 8 },
        targetRelationshipsPreserved: { documents: 0, tasks: 1, goals: 0, sessions: 0, coachingNotes: 0, annotations: 0, mediaClips: 0 },
        targetRelationshipsRemoved: { documents: 0, tasks: 1, goals: 1, sessions: 1, coachingNotes: 0, annotations: 1, mediaClips: 1 },
        blockingConflicts: [],
        previewHash: "b".repeat(64),
        canRollback: true,
        boundaries: { exactReceiptRequired: true, laterEditsFailClosed: true, immutableSourceTextMutated: false, externalSideEffects: false },
      },
    });
    jest.mocked(applyTagMergeRollback).mockResolvedValue({
      ok: true,
      projectId: "project-1",
      sourceTag: { id: "tag-rough", label: "Rough cut", slug: "rough-cut", isActive: true, mergedIntoTagId: null, mergedAt: null, updatedAt: "2026-07-18T18:03:00.000Z" },
      targetTag: { id: "tag-edit", label: "Episode edit", slug: "episode-edit", updatedAt: "2026-07-18T18:03:00.000Z" },
      mergeReceiptId: "merge-receipt",
      rollbackReceiptId: "rollback-receipt",
      previewHash: "b".repeat(64),
      counts: { documents: 0, tasks: 2, goals: 1, sessions: 1, coachingNotes: 0, annotations: 1, taggedSpans: 1, knowledgeNodes: 1, mediaClips: 1, aliases: 1, totalUses: 8 },
    });
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} manageTags />);
    await user.click(screen.getByRole("checkbox", { name: "Show archived" }));
    await user.click(screen.getByRole("button", { name: "Manage Rough cut" }));
    const sourceRow = screen.getByText("#Rough cut").closest("li");
    expect(sourceRow).not.toBeNull();
    await user.click(within(sourceRow!).getByText("Inspect merge receipt & rollback"));
    expect(within(sourceRow!).queryByRole("button", { name: "Restore #Rough cut" })).not.toBeInTheDocument();
    await user.click(within(sourceRow!).getByRole("button", { name: "Preview exact rollback" }));
    expect(await within(sourceRow!).findByText(/Restore #Rough cut from merge receipt merge-receipt/)).toBeInTheDocument();
    const restoreButton = within(sourceRow!).getByRole("button", { name: "Restore #Rough cut" });
    expect(restoreButton).toBeDisabled();
    await user.click(within(sourceRow!).getByRole("checkbox"));
    expect(restoreButton).toBeEnabled();
    await user.click(restoreButton);
    expect(previewTagMergeRollback).toHaveBeenCalledWith({ sourceTagId: "tag-rough" });
    expect(applyTagMergeRollback).toHaveBeenCalledWith({
      sourceTagId: "tag-rough",
      expectedPreviewHash: "b".repeat(64),
      expectedSourceUpdatedAt: "2026-07-18T18:02:00.000Z",
      expectedTargetUpdatedAt: "2026-07-18T18:02:00.000Z",
    });
    expect(await within(sourceRow!).findByRole("status")).toHaveTextContent("8 exact uses were restored");
    expect(refresh).toHaveBeenCalled();
  });

  it("creates and immediately applies a reusable Nest tag without a duplicate side effect", async () => {
    const user = userEvent.setup();
    const project = { id: "project-1", name: "High Ground Odyssey", slug: "high-ground", role: "EDITOR", canWrite: true, tags: [] };
    const taggedSnapshot: WorkSnapshot = {
      ...snapshot,
      tasks: [{ ...snapshot.tasks[0], project, tags: [], canManageTags: true }],
    };
    jest.mocked(createAndAssignWorkTag).mockResolvedValue({
      ok: true,
      entityKind: "task",
      entityId: "task-1",
      projectId: "project-1",
      tag: { id: "tag-product", label: "Product development", slug: "product-development", category: "meaning", projectId: "project-1" },
      created: true,
      updatedAt: "2026-07-18T18:00:01.000Z",
      receiptId: "tag-create-receipt",
    });
    render(<WorkClient initialSnapshot={taggedSnapshot} projectOptions={[project]} />);
    await user.click(screen.getByText("Edit High Ground Odyssey tags"));
    await user.type(screen.getByRole("textbox", { name: "New reusable tag" }), "Product development");
    await user.click(screen.getByRole("button", { name: "Create & apply" }));
    expect(createAndAssignWorkTag).toHaveBeenCalledWith({
      entityKind: "task",
      entityId: "task-1",
      label: "Product development",
      expectedUpdatedAt: snapshot.tasks[0].updatedAt,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("created for High Ground Odyssey and applied here");
    expect(refresh).toHaveBeenCalled();
  });

  it("opens and focuses the same canonical task from another surface", async () => {
    const completedSnapshot: WorkSnapshot = {
      ...snapshot,
      tasks: [
        { ...snapshot.tasks[0], status: "DONE", completedAt: "2026-07-18T19:00:00.000Z" },
        { ...snapshot.tasks[0], id: "task-2", title: "Unrelated queue noise" },
      ],
    };
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={completedSnapshot} focusTaskId="task-1" />);
    const task = document.getElementById("work-task-task-1");
    expect(task).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("heading", { name: "Focused task" })).toBeInTheDocument();
    expect(screen.queryByText("Unrelated queue noise")).not.toBeInTheDocument();
    for (const name of ["Weekly review", "Weekly commitments", "Add a personal task", "Goals"]) {
      expect(screen.queryByRole("region", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("region", { name: "Work overview" })).not.toBeInTheDocument();
    await waitFor(() => expect(task).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Show full task queue" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Unrelated queue noise")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Weekly commitments" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Add a personal task" })).toBeInTheDocument();
  });

  it("opens one focused goal without making the user cross the task wall", async () => {
    const goal = {
      id: "goal-1", title: "Build a sustainable editing rhythm", description: "Complete one protected block.", status: "ACTIVE" as const,
      targetAt: null, achievedAt: null, progressPercent: 25, progressNote: "A block is planned.", provenance: "Canonical goal" as const, updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null, sessionTitle: null, sessionStart: null, project: null, tags: [], canEdit: true, canManageTags: true, parent: null, childCount: 0, linkedTasks: [], sourceAnchor: null,
    };
    const focusedGoalSnapshot: WorkSnapshot = {
      ...snapshot,
      goals: [goal, { ...goal, id: "goal-2", title: "Unrelated durable direction" }],
    };
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={focusedGoalSnapshot} focusGoalId="goal-1" />);
    const goalCard = document.getElementById("work-goal-goal-1");
    expect(screen.getByRole("heading", { name: "Focused goal" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tasks" })).not.toBeInTheDocument();
    expect(screen.queryByText("Unrelated durable direction")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Weekly review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Add a personal task" })).not.toBeInTheDocument();
    await waitFor(() => expect(goalCard).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Show all goals" }));
    expect(screen.getByText("Unrelated durable direction")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Weekly review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Goals" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each(["task", "goal"] as const)(
    "explains an unavailable %s deep link without revealing or replacing scoped work",
    (kind) => {
      render(<WorkClient initialSnapshot={snapshot} unavailableFocusKind={kind} />);
      const notice = screen.getByRole("alert", { name: `${kind === "task" ? "Task" : "Goal"} unavailable` });
      expect(notice).toHaveTextContent(`That ${kind} is not available to this account`);
      expect(notice).toHaveTextContent("belong to another Nest");
      expect(notice).toHaveTextContent("Nothing was changed");
      expect(screen.getByText(snapshot.tasks[0].title)).toBeInTheDocument();
    },
  );

  it("creates a personal task from the visible quick-capture form", async () => {
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "new-task", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "receipt-1" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Draft the next outline");
    await user.click(screen.getByText("Details, date & repeat"));
    await user.type(screen.getByRole("textbox", { name: "Useful detail" }), "Start from the session notes");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(createWorkTask).toHaveBeenCalledWith({ clientRequestId: expect.any(String), title: "Draft the next outline", detail: "Start from the session notes", dueLocal: null, timezone: null, projectId: null, recurrence: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Task added.");
    expect(refresh).toHaveBeenCalled();
  });

  it("creates a timezone-explicit fixed repeat without claiming a reminder or calendar event", async () => {
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "repeat-task", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "repeat-receipt", recurrenceSeriesId: "series-1", occurrenceCount: 3 });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Review coaching goals");
    await user.click(screen.getByText("Details, date & repeat"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Repeat" }), "FIXED");
    await user.type(screen.getByLabelText("Due (required)"), "2026-07-20T09:00");
    const timezone = screen.getByRole("textbox", { name: "Timezone" });
    await user.clear(timezone);
    await user.type(timezone, "America/Denver");
    await user.selectOptions(screen.getByRole("combobox", { name: "Unit" }), "WEEKLY");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(createWorkTask).toHaveBeenCalledWith(expect.objectContaining({
      title: "Review coaching goals",
      dueLocal: "2026-07-20T09:00",
      timezone: "America/Denver",
      recurrence: { cadence: "FIXED", frequency: "WEEKLY", interval: 1 },
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("3 upcoming occurrences");
    expect(setWorkTaskReminder).not.toHaveBeenCalled();
  });

  it("edits future recurrence by versioning the open horizon instead of rewriting history", async () => {
    const user = userEvent.setup();
    const recurringSnapshot: WorkSnapshot = {
      ...snapshot,
      tasks: [{
        ...snapshot.tasks[0],
        dueAt: "2026-07-20T15:00:00.000Z",
        recurrence: {
          seriesId: "series-1",
          occurrenceKey: "2026-07-20T09:00[America/Denver]",
          scheduledLocalDate: "2026-07-20",
          cadence: "FIXED",
          frequency: "WEEKLY",
          interval: 1,
          timezone: "America/Denver",
          localTimeMinutes: 540,
          status: "ACTIVE",
          updatedAt: "2026-07-18T18:00:00.000Z",
          label: "Every week at 09:00 (America/Denver), on schedule",
        },
      }],
    };
    jest.mocked(editTaskRecurrence).mockResolvedValue({
      ok: true,
      scope: "THIS_AND_FUTURE",
      taskId: "task-1",
      receiptId: "revision-receipt",
      priorSeriesId: "series-1",
      nextSeriesId: "series-2",
      firstTaskId: "task-new",
      supersededTaskCount: 3,
      materializedCount: 3,
      reused: false,
    });
    render(<WorkClient initialSnapshot={recurringSnapshot} />);
    const summary = screen.getByText("Edit repeating task");
    await user.click(summary);
    const editor = summary.closest("details")!;
    await user.selectOptions(within(editor).getByRole("combobox", { name: "Change scope" }), "THIS_AND_FUTURE");
    const title = within(editor).getByRole("textbox", { name: "Task title" });
    await user.clear(title);
    await user.type(title, "Biweekly production review");
    const timezone = within(editor).getByRole("textbox", { name: "IANA timezone" });
    await user.clear(timezone);
    await user.type(timezone, "America/New_York");
    await user.click(within(editor).getByRole("button", { name: "Save edit" }));
    expect(editTaskRecurrence).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      seriesId: "series-1",
      scope: "THIS_AND_FUTURE",
      title: "Biweekly production review",
      dueLocal: "2026-07-20T09:00",
      timezone: "America/New_York",
      recurrence: { cadence: "FIXED", frequency: "WEEKLY", interval: 1 },
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("preserved as superseded history");
    expect(refresh).toHaveBeenCalled();
  });

  it("marks committed work done and removes it from the default open filter", async () => {
    jest.mocked(updateWorkTaskStatus).mockResolvedValue({ ok: true, taskId: "task-1", status: "DONE", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "receipt-2" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Mark done" }));
    expect(updateWorkTaskStatus).toHaveBeenCalledWith({ taskId: "task-1", nextStatus: "DONE", expectedUpdatedAt: "2026-07-18T18:00:00.000Z" });
    expect(await screen.findByText("No open tasks. Add your next step above.")).toBeInTheDocument();
  });

  it("lets an owner reopen a completed one-time task", async () => {
    jest.mocked(updateWorkTaskStatus).mockResolvedValue({ ok: true, taskId: "task-1", status: "OPEN", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "receipt-reopen" });
    const user = userEvent.setup();
    const completedSnapshot: WorkSnapshot = {
      ...snapshot,
      counts: { ...snapshot.counts, openTasks: 0, completedTasks: 1 },
      tasks: [{
        ...snapshot.tasks[0],
        status: "DONE",
        completedAt: "2026-07-18T18:30:00.000Z",
        canEdit: true,
      }],
    };
    render(<WorkClient initialSnapshot={completedSnapshot} focusTaskId="task-1" />);
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(updateWorkTaskStatus).toHaveBeenCalledWith({ taskId: "task-1", nextStatus: "OPEN", expectedUpdatedAt: "2026-07-18T18:00:00.000Z" });
    expect(await screen.findByRole("button", { name: "Mark done" })).toBeInTheDocument();
  });

  it("explicitly preserves an overdue recurring occurrence as missed instead of silently canceling it", async () => {
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.mocked(updateWorkTaskStatus).mockResolvedValue({ ok: true, taskId: "task-1", status: "CANCELED", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "missed-receipt", nextOccurrenceTaskId: "task-next" });
    const recurring: WorkSnapshot = {
      ...snapshot,
      tasks: [{
        ...snapshot.tasks[0],
        isOverdue: true,
        dueAt: "2026-07-17T15:00:00.000Z",
        recurrence: {
          seriesId: "series-1",
          occurrenceKey: "2026-07-17T09:00[America/Denver]",
          scheduledLocalDate: "2026-07-17",
          cadence: "FIXED",
          frequency: "DAILY",
          interval: 1,
          timezone: "America/Denver",
          localTimeMinutes: 540,
          status: "ACTIVE",
          updatedAt: "2026-07-18T18:00:00.000Z",
          label: "Every day · fixed schedule · America/Denver",
        },
      }],
    };
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={recurring} />);
    await user.click(screen.getByRole("button", { name: "Skip missed" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("preserve it as skipped"));
    expect(updateWorkTaskStatus).toHaveBeenCalledWith({
      taskId: "task-1",
      nextStatus: "CANCELED",
      expectedUpdatedAt: "2026-07-18T18:00:00.000Z",
      decisionReason: "MISSED_OCCURRENCE_SKIPPED",
    });
    expect(await screen.findByText(/Missed occurrence preserved as skipped/i)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("creates a canonical goal without creating implied work", async () => {
    jest.mocked(createWorkGoal).mockResolvedValue({ ok: true, goalId: "goal-new", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "goal-receipt" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Goals" }));
    await user.type(screen.getByRole("textbox", { name: "Goal title" }), "Make coaching follow-through obvious");
    await user.type(screen.getByRole("textbox", { name: "Why or definition of success" }), "The next action opens from its source session");
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect(createWorkGoal).toHaveBeenCalledWith({
      clientRequestId: expect.any(String),
      title: "Make coaching follow-through obvious",
      description: "The next action opens from its source session",
      targetAt: null,
      projectId: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Goal added.");
    expect(createWorkTask).not.toHaveBeenCalled();
  });

  it("saves an actor-owned weekly plan without implying task or calendar completion", async () => {
    jest.mocked(saveWeeklyCommitment).mockResolvedValue({ ok: true, commitmentId: "week-1", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "week-receipt" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.click(screen.getByRole("button", { name: "Weekly planning" }));
    await user.type(screen.getByRole("textbox", { name: "First commitment" }), "Proof-listen the final episode");
    await user.click(screen.getByRole("checkbox", { name: /Mark reflection complete/i }));
    await user.click(screen.getByRole("button", { name: "Save weekly plan" }));
    expect(saveWeeklyCommitment).toHaveBeenCalledWith(expect.objectContaining({
      commitmentOne: "Proof-listen the final episode",
      clientReviewed: true,
      expectedUpdatedAt: null,
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Weekly plan saved.");
    expect(updateWorkTaskStatus).not.toHaveBeenCalled();
  });
});
