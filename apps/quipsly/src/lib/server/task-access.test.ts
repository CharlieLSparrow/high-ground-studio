/** @jest-environment node */

import {
  personalOrSharedSessionTaskAccessWhere,
  personalOrSharedWorkspaceTaskAccessWhere,
} from "./task-access";

describe("canonical task visibility", () => {
  it("keeps assigned session tasks private and shares only unassigned work", () => {
    expect(personalOrSharedSessionTaskAccessWhere("user-1")).toEqual([
      { assignedUserId: "user-1" },
      {
        assignedUserId: null,
        room: { OR: [
          { createdByUserId: "user-1" },
          { participants: { some: { userId: "user-1", accessStatus: "ACTIVE" } } },
          { booking: { clientUserId: "user-1" } },
          { booking: { coachUserId: "user-1" } },
        ] },
      },
      {
        assignedUserId: null,
        booking: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] },
      },
    ]);
  });

  it("shares unassigned project work without exposing another assignee", () => {
    expect(personalOrSharedWorkspaceTaskAccessWhere("user-1", ["project-1"])).toEqual([
      { assignedUserId: "user-1" },
      { assignedUserId: null, projectId: { in: ["project-1"] } },
      {
        assignedUserId: null,
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
        booking: { OR: [{ clientUserId: "user-1" }, { coachUserId: "user-1" }] },
      },
    ]);
  });
});
