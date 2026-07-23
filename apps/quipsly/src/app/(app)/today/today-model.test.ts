import { buildTodayView } from "./today-model";

const now = "2026-07-19T15:00:00.000Z";

describe("Nest Today model", () => {
  it("keeps Today deliberate, bounded, and free of unreviewed transcript candidates", () => {
    const result = buildTodayView({
      now,
      sessions: [
        { id: "later", title: "Later", purpose: "COACHING", scheduledStart: "2026-07-20T18:00:00.000Z" },
        { id: "next", title: "Episode 5", purpose: "PODCAST", scheduledStart: "2026-07-19T16:00:00.000Z" },
      ],
      planBlocks: [{ id: "block", startsAt: "2026-07-19T16:00:00.000Z", endsAt: "2026-07-19T16:30:00.000Z", timezone: "UTC", status: "PLANNED", actionItem: { id: "planned", title: "Proof listen", status: "OPEN" } }],
      tasks: [
        { id: "planned", title: "Proof listen", createdAt: now },
        { id: "candidate", title: "Maybe publish", createdAt: now, sourceJson: { source: "transcript-packet-builder", candidate: true } },
        { id: "due", title: "Send outline", dueAt: "2026-07-19T17:00:00.000Z", createdAt: now, tags: [{ id: "tag-1", slug: "episode-5", label: "Episode 5" }] },
        { id: "ordinary", title: "Someday", createdAt: now },
      ],
      goals: [{ id: "goal", title: "Ship Episode 5", updatedAt: now }],
    });

    expect(result.nextSession?.id).toBe("next");
    expect(result.planBlocks.map((block) => block.targetId)).toEqual(["planned"]);
    expect(result.tasks.map((task) => task.id)).toEqual(["due"]);
    expect(result.tasks[0]?.reason).toBe("Due within 24 hours");
    expect(result.tasks[0]?.tags).toEqual([{ id: "tag-1", slug: "episode-5", label: "Episode 5" }]);
    expect(result.goals.map((goal) => goal.id)).toEqual(["goal"]);
    expect(result.boundaries).toMatchObject({ deliberatePlanLimit: 4, externalSideEffects: false });
  });

  it("uses each block timezone to decide whether it belongs to Today", () => {
    const result = buildTodayView({
      now: "2026-07-19T01:00:00.000Z",
      sessions: [],
      tasks: [],
      goals: [],
      planBlocks: [
        { id: "denver", startsAt: "2026-07-19T00:30:00.000Z", endsAt: "2026-07-19T01:30:00.000Z", timezone: "America/Denver", status: "PLANNED", goal: { id: "g1", title: "Denver goal", status: "ACTIVE" } },
        { id: "tokyo", startsAt: "2026-07-18T16:00:00.000Z", endsAt: "2026-07-18T17:00:00.000Z", timezone: "Asia/Tokyo", status: "PLANNED", goal: { id: "g2", title: "Tokyo goal", status: "ACTIVE" } },
      ],
    });
    expect(result.planBlocks.map((block) => block.id)).toEqual(["tokyo", "denver"]);
  });
});
