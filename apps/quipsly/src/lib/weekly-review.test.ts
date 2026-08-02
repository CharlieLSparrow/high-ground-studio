import { buildWeeklyReview } from "@high-ground/quipsly-domain/weekly-review";

describe("canonical weekly review projection", () => {
  it("separates planned time from explicit actual time and carries evidence, blockers, sessions, and next work", () => {
    const review = buildWeeklyReview({
      subjectUserId: "client-1",
      subjectLabel: "Client One",
      relationship: "self",
      weekStartsAt: "2026-07-27T12:00:00.000Z",
      generatedAt: "2026-08-01T18:00:00.000Z",
      tasks: [
        { id: "done-task", title: "Proof-listen the recap", status: "DONE", completedAt: "2026-07-30T18:00:00.000Z", roomId: "room-1", sessionTitle: "Coaching review" },
        { id: "blocker-task", title: "Choose the next experiment", status: "OPEN", dueAt: "2026-07-31T18:00:00.000Z", roomId: "room-1", sessionTitle: "Coaching review" },
      ],
      goals: [{
        id: "goal-1",
        title: "Build a repeatable review habit",
        status: "ACTIVE",
        roomId: "room-1",
        sessionTitle: "Coaching review",
        progressReceipts: [{ progressPercent: 50, note: "Reviewed the first real session.", occurredAt: "2026-07-30T17:00:00.000Z" }],
        taskLinks: [
          { taskId: "done-task", relationship: "CONTRIBUTES" },
          { taskId: "blocker-task", relationship: "BLOCKS" },
        ],
      }],
      planBlocks: [
        { id: "worked", taskId: "done-task", startsAt: "2026-07-30T17:00:00.000Z", endsAt: "2026-07-30T17:50:00.000Z", status: "COMPLETED", actualMinutes: 35 },
        { id: "legacy", goalId: "goal-1", startsAt: "2026-07-31T17:00:00.000Z", endsAt: "2026-07-31T18:30:00.000Z", status: "COMPLETED", actualMinutes: null },
      ],
      weeklyPlan: {
        id: "week-1",
        commitments: ["Proof-listen one real recap"],
        supportNeeded: "A second listener",
        progressNotes: "The shorter review loop worked.",
        clientReviewedAt: "2026-08-01T17:30:00.000Z",
      },
    });

    expect(review).toMatchObject({
      schema: "quipsly-weekly-review-v1",
      reviewState: "reviewed",
      plannedMinutes: 140,
      actualMinutes: 35,
      completedBlocksWithoutActualMinutes: 1,
      blockers: ["A second listener", "Choose the next experiment"],
      reflection: "The shorter review loop worked.",
      boundaries: {
        deterministicProjection: true,
        actualTimeExplicitOnly: true,
        missingActualTimeInferred: false,
        targetStatusMutated: false,
        externalSideEffects: false,
      },
    });
    expect(review.goals[0]).toMatchObject({
      id: "goal-1",
      health: "needs-attention",
      progressPercent: 50,
      latestEvidence: "Reviewed the first real session.",
      plannedMinutes: 140,
      actualMinutes: 35,
      completedBlocksWithoutActualMinutes: 1,
      linkedTaskCount: 2,
      completedTaskCount: 1,
      openTaskCount: 1,
      overdueTaskCount: 1,
      nextTask: { id: "blocker-task" },
    });
    expect(review.sessionContributions).toEqual([{ roomId: "room-1", title: "Coaching review", evidenceCount: 4 }]);
    expect(review.nextCommitments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "weekly-plan", title: "Proof-listen one real recap" }),
      expect.objectContaining({ kind: "task", id: "blocker-task" }),
    ]));
  });

  it("does not convert a completed legacy block into guessed actual time", () => {
    const review = buildWeeklyReview({
      subjectUserId: "client-1",
      relationship: "self",
      weekStartsAt: "2026-07-27T12:00:00.000Z",
      generatedAt: "2026-08-01T18:00:00.000Z",
      tasks: [],
      goals: [],
      planBlocks: [{ id: "legacy", goalId: "goal-1", startsAt: "2026-07-28T17:00:00.000Z", endsAt: "2026-07-28T18:00:00.000Z", status: "COMPLETED" }],
      weeklyPlan: null,
    });
    expect(review.plannedMinutes).toBe(60);
    expect(review.actualMinutes).toBe(0);
    expect(review.completedBlocksWithoutActualMinutes).toBe(1);
  });

  it("treats the noon storage marker as a date identity rather than dropping Monday morning", () => {
    const review = buildWeeklyReview({
      subjectUserId: "client-1",
      relationship: "self",
      weekStartsAt: "2026-08-03T12:00:00.000Z",
      generatedAt: "2026-08-03T15:00:00.000Z",
      tasks: [],
      goals: [],
      planBlocks: [{ id: "monday-morning", startsAt: "2026-08-03T08:00:00.000Z", endsAt: "2026-08-03T09:00:00.000Z", status: "COMPLETED", actualMinutes: 45 }],
      weeklyPlan: null,
    });
    expect(review.weekStartsAt).toBe("2026-08-03T12:00:00.000Z");
    expect(review.weekEndsAt).toBe("2026-08-10T00:00:00.000Z");
    expect(review).toMatchObject({ plannedMinutes: 60, actualMinutes: 45 });
  });

  it("does not count a canceled plan block as planned or actual work", () => {
    const review = buildWeeklyReview({
      subjectUserId: "client-1",
      relationship: "self",
      weekStartsAt: "2026-08-03T12:00:00.000Z",
      generatedAt: "2026-08-03T15:00:00.000Z",
      tasks: [],
      goals: [],
      planBlocks: [{ id: "canceled", startsAt: "2026-08-03T08:00:00.000Z", endsAt: "2026-08-03T09:00:00.000Z", status: "CANCELED", actualMinutes: 45 }],
      weeklyPlan: null,
    });
    expect(review).toMatchObject({ plannedMinutes: 0, actualMinutes: 0, completedBlocksWithoutActualMinutes: 0 });
  });
});
