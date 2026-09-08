/** @jest-environment node */

import {
  personalOrSharedSessionTaskAccessWhere,
  personalOrSharedWorkspaceTaskAccessWhere,
  nestSharedTaskAccessWhere,
} from "./task-access";
import { sharedCoachingWorkVisibilityWhere } from "./coaching-work-access";

describe("canonical task visibility", () => {
  const engagementAccess = {
    engagement: { is: {
      status: "ACTIVE",
      members: { some: { userId: "user-1", status: "ACTIVE" } },
    } },
  };
  const bookingAccess = {
    engagementId: null,
    booking: { is: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] } },
  };

  it("shares assigned coaching work only through an explicit engagement or booking", () => {
    expect(personalOrSharedSessionTaskAccessWhere("user-1")).toEqual([nestSharedTaskAccessWhere("user-1"), ...[
      { assignedUserId: "user-1" },
      { AND: [sharedCoachingWorkVisibilityWhere(), engagementAccess] },
      { AND: [sharedCoachingWorkVisibilityWhere(), bookingAccess] },
      {
        assignedUserId: null,
        engagementId: null,
        room: { OR: [
          { createdByUserId: "user-1" },
          { participants: { some: { userId: "user-1", accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: "user-1" } },
          { booking: { coachUserId: "user-1" } },
        ] },
      },
      {
        assignedUserId: null,
        engagementId: null,
        booking: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] },
      },
    ].map(where => ({ ...where, isNestShared: false }))]);
  });

  it("does not give an observer write controls for coaching tasks", () => {
    const where = personalOrSharedSessionTaskAccessWhere("user-1", "write");
    expect(where).toContainEqual({ isNestShared: false, AND: [sharedCoachingWorkVisibilityWhere(), {
      engagement: { is: {
        status: "ACTIVE",
        members: { some: {
          userId: "user-1",
          status: "ACTIVE",
          role: { in: ["CLIENT", "COACH", "SUPPORT"] },
        } },
      } },
    }] });
    expect(JSON.stringify(where)).not.toContain("OBSERVER");
  });

  it("shares unassigned project work without exposing another assignee", () => {
    expect(personalOrSharedWorkspaceTaskAccessWhere("user-1", ["project-1"])).toEqual([nestSharedTaskAccessWhere("user-1"), ...[
      { assignedUserId: "user-1" },
      { AND: [sharedCoachingWorkVisibilityWhere(), engagementAccess] },
      { AND: [sharedCoachingWorkVisibilityWhere(), bookingAccess] },
      { assignedUserId: null, engagementId: null, projectId: { in: ["project-1"] } },
      {
        assignedUserId: null,
        engagementId: null,
        room: { OR: [
          { createdByUserId: "user-1" },
          { participants: { some: { userId: "user-1", accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: "user-1" } },
          { booking: { coachUserId: "user-1" } },
          { projectId: { in: ["project-1"] } },
        ] },
      },
      {
        assignedUserId: null,
        engagementId: null,
        booking: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] },
      },
    ].map(where => ({ ...where, isNestShared: false }))]);
  });

  it("uses current stable membership for shared tasks, never assignment or an email label", () => {
    expect(nestSharedTaskAccessWhere("user-1", "write")).toEqual({ isNestShared: true, engagementId: null,
      project: { accessGrants: { some: { memberUserId: "user-1", status: "ACTIVE", role: { in: ["OWNER", "EDITOR"] } } } } });
    expect(nestSharedTaskAccessWhere("user-1").project).toEqual({ accessGrants: { some: {
      memberUserId: "user-1", status: "ACTIVE", role: { in: ["OWNER", "EDITOR", "VIEWER"] },
    } } });
  });
});
