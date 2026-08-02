import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";

import { applyTagMerge, applyTagMergeRollback, changeWorkTagTaxonomy, createAndAssignWorkTag, createWorkGoal, createWorkTask, createWorkVocabularyTag, editTaskRecurrence, editWorkGoal, editWorkTask, previewTagMerge, previewTagMergeRollback, replaceWorkTags, reviewImportedWorkTag, saveWeeklyCommitment, setWorkTaskReminder, updateWorkTaskStatus } from "./actions";
import { WorkClient } from "./work-client";
import type { WorkSnapshot } from "./work-model";

const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
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
    sourceAnchor: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: "correction-1", recordingAssetId: "asset-1", playbackSourceId: "source-1" },
  }],
  goals: [], commitments: [], weeklyReviews: [],
  counts: { openTasks: 1, attentionTasks: 1, overdueTasks: 0, completedTasks: 0, activeGoals: 0, activeCommitments: 0 },
  boundaries: { taskLimit: 500, canonicalGoalModel: true, legacySessionGoalCompatibility: true, externalSideEffects: false },
};

describe("Work Queue interactions", () => {
  beforeEach(() => jest.clearAllMocks());

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
    expect(link).toHaveAttribute("href", "/sessions/room-1#transcript-segment-segment-1");
    expect(screen.getByText(/Charlie: Welcome, everybody/i)).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName === "SPAN"
      && element.textContent?.startsWith("Reminder ") === true
      && element.textContent.includes("2026")
    ))).toBeInTheDocument();
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
    expect(await screen.findByRole("status")).toHaveTextContent("reminder, repeat, status, tags, goal links, and external calendars were left unchanged");
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

    render(<WorkClient initialSnapshot={goalSnapshot} />);

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

    render(<WorkClient initialSnapshot={goalSnapshot} />);
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
    render(<WorkClient initialSnapshot={{
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
    expect(screen.queryByRole("heading", { name: "Nest vocabulary" })).not.toBeInTheDocument();
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
    expect(await screen.findByRole("status")).toHaveTextContent("no record was tagged automatically");
    expect(screen.getByRole("textbox", { name: "New reusable tag" })).toHaveValue("");
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps imported keywords out of canonical choices until explicit promotion", async () => {
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
    expect(screen.getByText("Suggestion only")).toBeInTheDocument();
    const promoteButton = screen.getByRole("button", { name: "Promote to #Narrative evidence" });
    expect(promoteButton).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Add #Narrative evidence to intentional shared vocabulary." }));
    expect(promoteButton).toBeEnabled();
    await user.click(promoteButton);
    expect(reviewImportedWorkTag).toHaveBeenCalledWith({
      candidateId: "candidate-narrative",
      operation: "PROMOTE",
      expectedUpdatedAt: "2026-07-23T16:00:00.000Z",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("intentional shared vocabulary");
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
    const sourceRow = screen.getByText("#Rough cut").closest("li");
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
