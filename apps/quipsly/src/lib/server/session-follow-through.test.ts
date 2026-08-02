import {
  CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
  CLIENT_FOLLOW_UP_SCHEMA,
  clientFollowUpSha256,
} from "./session-client-follow-up";
import { loadPriorSessionFollowThroughByRoomId } from "./session-follow-through";

const CLIENT = { id: "client-1", email: "client@example.test", primaryEmail: "client@example.test", isStaff: false };
const COACH = { id: "coach-1", email: "coach@example.test", primaryEmail: "coach@example.test", isStaff: false };
const OUTSIDER = { id: "producer-1", email: "producer@example.test", primaryEmail: "producer@example.test", isStaff: false };

function fixture() {
  const releasedTask = {
    id: "task-1",
    title: "Run one protected rehearsal",
    detail: "Write down what changed.",
    status: "OPEN",
    dueAt: "2026-08-03T18:00:00.000Z",
  };
  const releasedGoal = {
    id: "goal-1",
    title: "Use a sustainable boundary",
    description: "Prefer repeatable evidence.",
    status: "ACTIVE",
    targetAt: "2026-08-14T18:00:00.000Z",
  };
  const body = {
    schema: CLIENT_FOLLOW_UP_SCHEMA,
    title: "Follow-through after coaching",
    intro: "Try the smallest repeatable version.",
    session: {
      id: "room-prior",
      title: "Previous coaching Session",
      scheduledStart: "2026-07-31T16:00:00.000Z",
    },
    notes: [],
    goals: [releasedGoal],
    tasks: [releasedTask],
    nextSessionFocus: "What made it easier to repeat?",
  };
  const manifest = {
    schema: CLIENT_FOLLOW_UP_MANIFEST_SCHEMA,
    roomId: "room-prior",
    recipientUserId: CLIENT.id,
    records: {
      notes: [],
      tasks: [{
        id: releasedTask.id,
        updatedAt: "2026-07-31T17:00:00.000Z",
        contentSha256: clientFollowUpSha256({
          title: releasedTask.title,
          detail: releasedTask.detail,
          status: releasedTask.status,
          dueAt: releasedTask.dueAt,
        }),
      }],
      goals: [{
        id: releasedGoal.id,
        updatedAt: "2026-07-31T17:00:00.000Z",
        contentSha256: clientFollowUpSha256({
          title: releasedGoal.title,
          description: releasedGoal.description,
          status: releasedGoal.status,
          targetAt: releasedGoal.targetAt,
        }),
      }],
    },
    boundaries: {
      privateNotesIncluded: false,
      externalMessageSent: false,
    },
  };
  const output = {
    id: "follow-up-1",
    kind: "CLIENT_FOLLOW_UP",
    status: "RELEASED",
    createdByUserId: COACH.id,
    recipientUserId: CLIENT.id,
    title: body.title,
    intro: body.intro,
    nextSessionFocus: body.nextSessionFocus,
    bodyJson: body,
    sourceManifestJson: manifest,
    contentSha256: clientFollowUpSha256(body),
    revision: 2,
    releasedAt: new Date("2026-07-31T18:00:00.000Z"),
    recipient: { name: "Retained client", primaryEmail: CLIENT.primaryEmail },
  };
  const booking = { clientUserId: CLIENT.id, coachUserId: COACH.id };
  const prior = {
    id: "room-prior",
    title: "Previous coaching Session",
    purpose: "COACHING",
    projectId: "project-1",
    scheduledStart: new Date("2026-07-31T16:00:00.000Z"),
    endedAt: new Date("2026-07-31T17:00:00.000Z"),
    createdAt: new Date("2026-07-30T16:00:00.000Z"),
    booking,
    outputs: [output],
  };
  const target = {
    id: "room-next",
    title: "Next coaching Session",
    purpose: "COACHING",
    projectId: "project-1",
    scheduledStart: new Date("2026-08-07T16:00:00.000Z"),
    endedAt: null,
    createdAt: new Date("2026-08-01T16:00:00.000Z"),
    booking,
  };
  const prisma = {
    callRoom: { findMany: jest.fn(async () => [prior]) },
    actionItem: { findMany: jest.fn(async () => [{
      id: "task-1",
      assignedUserId: CLIENT.id,
      projectId: "project-1",
      title: releasedTask.title,
      detail: releasedTask.detail,
      status: "DONE",
      dueAt: new Date(releasedTask.dueAt),
      completedAt: new Date("2026-08-02T18:00:00.000Z"),
      updatedAt: new Date("2026-08-02T18:00:00.000Z"),
      sourceJson: {},
    }]) },
    goal: { findMany: jest.fn(async () => [{
      id: "goal-1",
      ownerUserId: CLIENT.id,
      projectId: "project-1",
      title: releasedGoal.title,
      description: releasedGoal.description,
      status: releasedGoal.status,
      targetAt: new Date(releasedGoal.targetAt),
      achievedAt: null,
      updatedAt: new Date("2026-08-02T18:00:00.000Z"),
      progressReceipts: [{
        id: "progress-1",
        kind: "CHECK_IN",
        progressPercent: 60,
        note: "The smaller version worked.",
        occurredAt: new Date("2026-08-02T18:00:00.000Z"),
      }],
    }]) },
  };
  return { prisma, target, output };
}

describe("Session follow-through projection", () => {
  it.each([
    ["client", CLIENT, "CLIENT", true],
    ["coach", COACH, "COACH", false],
  ])("shows %s the released identities with live canonical status", async (_label, actor, role, canOpenWork) => {
    const { prisma, target } = fixture();
    const result = await loadPriorSessionFollowThroughByRoomId({
      prisma,
      actor,
      rooms: [target],
    });

    expect(result[target.id]).toMatchObject({
      schema: "quipsly-session-follow-through-v1",
      viewerRole: role,
      sourceRoom: { id: "room-prior", projectId: "project-1" },
      output: { id: "follow-up-1", revision: 2, recipientLabel: "Retained client" },
      tasks: [{
        id: "task-1",
        status: "DONE",
        releasedStatus: "OPEN",
        availability: "CURRENT",
        changedSinceRelease: true,
      }],
      goals: [{
        id: "goal-1",
        status: "ACTIVE",
        availability: "CURRENT",
        changedSinceRelease: false,
        progressedSinceRelease: true,
        latestProgress: { progressPercent: 60 },
      }],
      summary: {
        openTaskCount: 0,
        completedTaskCount: 1,
        activeGoalCount: 1,
        changedSinceReleaseCount: 2,
        unavailableCount: 0,
      },
      canOpenWork,
      canonicalRecordsMutated: false,
      currentSessionMutated: false,
      externalSideEffects: false,
    });
  });

  it("denies a Session producer and fails closed on a changed release body", async () => {
    const denied = fixture();
    await expect(loadPriorSessionFollowThroughByRoomId({
      prisma: denied.prisma,
      actor: OUTSIDER,
      rooms: [denied.target],
    })).resolves.toEqual({});
    expect(denied.prisma.actionItem.findMany).not.toHaveBeenCalled();

    const tampered = fixture();
    tampered.output.bodyJson.intro = "Changed after the release hash was created.";
    await expect(loadPriorSessionFollowThroughByRoomId({
      prisma: tampered.prisma,
      actor: CLIENT,
      rooms: [tampered.target],
    })).resolves.toEqual({});
    expect(tampered.prisma.actionItem.findMany).not.toHaveBeenCalled();
  });

  it("does not relabel progress recorded before the immutable release as new follow-through", async () => {
    const retained = fixture();
    const goals = await retained.prisma.goal.findMany();
    goals[0].progressReceipts[0].occurredAt = new Date("2026-07-31T17:59:59.000Z");
    retained.prisma.goal.findMany.mockResolvedValue(goals);

    const result = await loadPriorSessionFollowThroughByRoomId({
      prisma: retained.prisma,
      actor: CLIENT,
      rooms: [retained.target],
    });

    expect(result[retained.target.id]).toMatchObject({
      tasks: [{ changedSinceRelease: true }],
      goals: [{ changedSinceRelease: false, progressedSinceRelease: false }],
      summary: { changedSinceReleaseCount: 1 },
    });
  });

  it("conceals live work that moved outside the released coaching project", async () => {
    const moved = fixture();
    const movedTask = await moved.prisma.actionItem.findMany();
    const movedGoal = await moved.prisma.goal.findMany();
    movedTask[0].projectId = "different-private-project";
    movedGoal[0].projectId = "different-private-project";
    moved.prisma.actionItem.findMany.mockResolvedValue(movedTask);
    moved.prisma.goal.findMany.mockResolvedValue(movedGoal);

    const result = await loadPriorSessionFollowThroughByRoomId({
      prisma: moved.prisma,
      actor: COACH,
      rooms: [moved.target],
    });

    expect(result[moved.target.id]).toMatchObject({
      tasks: [{ id: "task-1", title: "Run one protected rehearsal", availability: "UNAVAILABLE" }],
      goals: [{ id: "goal-1", title: "Use a sustainable boundary", availability: "UNAVAILABLE" }],
      summary: { unavailableCount: 2 },
    });
  });

  it("fails closed when a release repeats a canonical record identity", async () => {
    const duplicate = fixture();
    duplicate.output.bodyJson.tasks.push({ ...duplicate.output.bodyJson.tasks[0] });
    duplicate.output.sourceManifestJson.records.tasks.push({
      ...duplicate.output.sourceManifestJson.records.tasks[0],
    });
    duplicate.output.contentSha256 = clientFollowUpSha256(duplicate.output.bodyJson);

    await expect(loadPriorSessionFollowThroughByRoomId({
      prisma: duplicate.prisma,
      actor: CLIENT,
      rooms: [duplicate.target],
    })).resolves.toEqual({});
    expect(duplicate.prisma.actionItem.findMany).not.toHaveBeenCalled();
  });
});
