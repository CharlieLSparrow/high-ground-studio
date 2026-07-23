import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { changeWorkTagTaxonomy, createAndAssignWorkTag, createWorkGoal, createWorkTask, editTaskRecurrence, replaceWorkTags, saveWeeklyCommitment, updateWorkTaskStatus } from "./actions";
import { WorkClient } from "./work-client";
import type { WorkSnapshot } from "./work-model";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
jest.mock("./actions", () => ({
  changeWorkTagTaxonomy: jest.fn(),
  createAndAssignWorkTag: jest.fn(),
  createWorkGoal: jest.fn(),
  createWorkTask: jest.fn(),
  editTaskRecurrence: jest.fn(),
  linkWorkGoalTask: jest.fn(),
  recordWorkGoalProgress: jest.fn(),
  replaceWorkTags: jest.fn(),
  saveWeeklyCommitment: jest.fn(),
  unlinkWorkGoalTask: jest.fn(),
  updateWorkGoalStatus: jest.fn(),
  updateTaskRecurrenceStatus: jest.fn(),
  updateWorkTaskStatus: jest.fn(),
}));

const snapshot: WorkSnapshot = {
  tasks: [{
    id: "task-1", title: "Finish episode notes", detail: "Use transcript evidence", status: "OPEN", dueAt: null, completedAt: null,
    createdAt: "2026-07-18T18:00:00.000Z", updatedAt: "2026-07-18T18:00:00.000Z", isOverdue: false, assigneeLabel: null,
    provenance: "Reviewed transcript timestamp", attentionReason: "Reviewed transcript follow-through", roomId: "room-1", sessionTitle: "Episode review", sessionStatus: "ENDED", workspaceSlug: null, bookingStart: null,
    project: null, tags: [], canManageTags: true,
    sourceAnchor: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: "correction-1", recordingAssetId: "asset-1", playbackSourceId: "source-1" },
  }],
  goals: [], commitments: [],
  counts: { openTasks: 1, attentionTasks: 1, overdueTasks: 0, completedTasks: 0, activeGoals: 0, activeCommitments: 0 },
  boundaries: { taskLimit: 500, canonicalGoalModel: true, legacySessionGoalCompatibility: true, externalSideEffects: false },
};

describe("Work Queue interactions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a reviewed transcript task to its exact segment", () => {
    render(<WorkClient initialSnapshot={snapshot} />);
    const link = screen.getByRole("link", { name: "Return to 0:03–0:04" });
    expect(link).toHaveAttribute("href", "/sessions/room-1#transcript-segment-segment-1");
    expect(screen.getByText(/Charlie: Welcome, everybody/i)).toBeInTheDocument();
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
    render(<WorkClient initialSnapshot={goalSnapshot} />);
    const link = screen.getByRole("link", { name: "Return to 0:12–0:17" });
    expect(link).toHaveAttribute("href", "/sessions/room-2#transcript-segment-segment-2");
    expect(screen.getByText("Homer: Build a repeatable coaching review habit.")).toBeInTheDocument();
  });

  it("opens the derived attention lens without creating an unread notification state", () => {
    render(<WorkClient initialSnapshot={snapshot} initialFilter="ATTENTION" />);
    expect(screen.getByRole("button", { name: "Attention" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Reviewed transcript follow-through")).toBeInTheDocument();
    expect(screen.getByText("Finish episode notes")).toBeInTheDocument();
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
    expect(screen.getAllByText("#Proof listen")).toHaveLength(2);
    await user.click(screen.getByText("Edit High Ground Odyssey tags"));
    await user.click(screen.getByRole("checkbox", { name: "Episode 4" }));
    await user.click(screen.getByRole("button", { name: "Save tags" }));
    expect(replaceWorkTags).toHaveBeenCalledWith({ entityKind: "task", entityId: "task-1", tagIds: ["tag-proof", "tag-episode"], expectedUpdatedAt: snapshot.tasks[0].updatedAt });
    expect(await screen.findByRole("status")).toHaveTextContent("No external action was taken");
    expect(refresh).toHaveBeenCalled();
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
    render(<WorkClient initialSnapshot={snapshot} projectOptions={[project]} />);
    await user.click(screen.getByText("Manage vocabulary · 1 active across 1 Nest"));
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
    await waitFor(() => expect(task).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Show full task queue" }));
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Unrelated queue noise")).toBeInTheDocument();
  });

  it("opens one focused goal without making the user cross the task wall", async () => {
    const goal = {
      id: "goal-1", title: "Build a sustainable editing rhythm", description: "Complete one protected block.", status: "ACTIVE" as const,
      targetAt: null, achievedAt: null, progressPercent: 25, progressNote: "A block is planned.", provenance: "Canonical goal" as const, updatedAt: "2026-07-18T18:00:00.000Z",
      roomId: null, sessionTitle: null, sessionStart: null, project: null, tags: [], canManageTags: true, parent: null, childCount: 0, linkedTasks: [], sourceAnchor: null,
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
    await waitFor(() => expect(goalCard).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "Show all goals" }));
    expect(screen.getByText("Unrelated durable direction")).toBeInTheDocument();
  });

  it("creates a personal task from the visible quick-capture form", async () => {
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "new-task", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "receipt-1" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Draft the next outline");
    await user.type(screen.getByRole("textbox", { name: "Useful detail" }), "Start from the session notes");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(createWorkTask).toHaveBeenCalledWith({ title: "Draft the next outline", detail: "Start from the session notes", dueLocal: null, timezone: null, projectId: null, recurrence: null });
    expect(await screen.findByRole("status")).toHaveTextContent("assigned to you");
    expect(refresh).toHaveBeenCalled();
  });

  it("creates a timezone-explicit fixed repeat without claiming a reminder or calendar event", async () => {
    jest.mocked(createWorkTask).mockResolvedValue({ ok: true, taskId: "repeat-task", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "repeat-receipt", recurrenceSeriesId: "series-1", occurrenceCount: 3 });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.type(screen.getByRole("textbox", { name: "Task title" }), "Review coaching goals");
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
    expect(await screen.findByRole("status")).toHaveTextContent("3 canonical occurrences");
    expect(screen.getByRole("status")).toHaveTextContent("No reminder or provider event was scheduled");
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
    expect(await screen.findByText("No open tasks are in your scoped queue.")).toBeInTheDocument();
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
    await user.type(screen.getByRole("textbox", { name: "Goal title" }), "Make coaching follow-through obvious");
    await user.type(screen.getByRole("textbox", { name: "Why or definition of success" }), "The next action opens from its source session");
    await user.click(screen.getByRole("button", { name: "Add goal" }));
    expect(createWorkGoal).toHaveBeenCalledWith({
      title: "Make coaching follow-through obvious",
      description: "The next action opens from its source session",
      targetAt: null,
      projectId: null,
    });
    expect(await screen.findByText(/No tasks or calendar events were added automatically/i)).toBeInTheDocument();
  });

  it("saves an actor-owned weekly plan without implying task or calendar completion", async () => {
    jest.mocked(saveWeeklyCommitment).mockResolvedValue({ ok: true, commitmentId: "week-1", updatedAt: "2026-07-18T19:00:00.000Z", receiptId: "week-receipt" });
    const user = userEvent.setup();
    render(<WorkClient initialSnapshot={snapshot} />);
    await user.type(screen.getByRole("textbox", { name: "First commitment" }), "Proof-listen the final episode");
    await user.click(screen.getByRole("checkbox", { name: /I reviewed this against what actually happened/i }));
    await user.click(screen.getByRole("button", { name: "Save weekly plan" }));
    expect(saveWeeklyCommitment).toHaveBeenCalledWith(expect.objectContaining({
      commitmentOne: "Proof-listen the final episode",
      clientReviewed: true,
      expectedUpdatedAt: null,
    }));
    expect(await screen.findByText(/No messages or calendar events were created/i)).toBeInTheDocument();
  });
});
