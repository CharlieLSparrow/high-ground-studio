/** @jest-environment node */

import {
  activeCoachingEngagementParticipantWhere,
  personalOrSharedCoachingGoalAccessWhere,
} from "./coaching-work-access";

describe("coaching work collaboration access", () => {
  it("requires an active engagement and an explicit participant identity", () => {
    expect(activeCoachingEngagementParticipantWhere("user-1")).toEqual({
      status: "ACTIVE",
      members: { some: { userId: "user-1", status: "ACTIVE" } },
    });
  });

  it("requires a writing role for mutations so observers remain read-only", () => {
    expect(activeCoachingEngagementParticipantWhere("user-1", "write")).toEqual({
      status: "ACTIVE",
      members: { some: {
        userId: "user-1",
        status: "ACTIVE",
        role: { in: ["CLIENT", "COACH", "SUPPORT"] },
      } },
    });
  });

  it("never grants goal access from project membership alone", () => {
    const where = personalOrSharedCoachingGoalAccessWhere("user-1");
    expect(where).toEqual([
      { ownerUserId: "user-1" },
      { engagement: { is: activeCoachingEngagementParticipantWhere("user-1") } },
      { engagementId: null, booking: { is: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] } } },
    ]);
    expect(JSON.stringify(where)).not.toContain("projectId");
  });
});
