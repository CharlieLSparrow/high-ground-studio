/** @jest-environment node */

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/server/access";
import {
  commitAssistantEntityAction,
  recordAssistantProposalDecisionAction,
} from "@/app/(app)/create/actions";
import { GET, POST } from "./route";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/access", () => ({ requireProjectAccess: jest.fn() }));
jest.mock("@/app/(app)/create/actions", () => ({
  commitAssistantEntityAction: jest.fn(),
  recordAssistantProposalDecisionAction: jest.fn(),
}));

const prisma = {
  studioProject: { findUnique: jest.fn() },
  studioAssistantAction: { findMany: jest.fn() },
};

describe("Story Bible assistant action route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({ user: { email: "writer@example.test" } } as never);
    jest.mocked(getPrismaClient).mockReturnValue(prisma as never);
    prisma.studioProject.findUnique.mockResolvedValue({ id: "project-1", slug: "episode" });
    prisma.studioAssistantAction.findMany.mockResolvedValue([]);
    jest.mocked(requireProjectAccess).mockResolvedValue(undefined as never);
  });

  it("loads only proposed or reviewed entity proposals for an accessible Nest", async () => {
    const response = await GET(new Request("http://localhost/api/story-bible/actions?projectId=project-1"));

    expect(response.status).toBe(200);
    expect(prisma.studioAssistantAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        session: { projectId: "project-1" },
        kind: { in: ["PROPOSE_ENTITY", "PROPOSE_ENTITY_UPDATE"] },
        status: { in: ["proposed", "approved"] },
      },
    }));
  });

  it("records review separately from canonical commit", async () => {
    jest.mocked(recordAssistantProposalDecisionAction).mockResolvedValue({
      ok: true,
      state: "persisted",
      replay: false,
      receipt: { actionId: "action-1", previousStatus: "proposed", status: "approved" },
    });
    jest.mocked(commitAssistantEntityAction).mockResolvedValue({
      ok: true,
      state: "persisted",
      replay: false,
      receipt: { actionId: "action-1", projectId: "project-1", entityId: "entity-1", operation: "created" },
    });

    const reviewed = await POST(new Request("http://localhost/api/story-bible/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: "action-1", status: "approved" }),
    }));
    const committed = await POST(new Request("http://localhost/api/story-bible/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: "action-1", status: "committed" }),
    }));

    expect(reviewed.status).toBe(200);
    expect(committed.status).toBe(200);
    expect(recordAssistantProposalDecisionAction).toHaveBeenCalledWith("action-1", "approved");
    expect(commitAssistantEntityAction).toHaveBeenCalledWith("action-1");
  });

  it("rejects legacy uppercase status drift before any mutation", async () => {
    const response = await POST(new Request("http://localhost/api/story-bible/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionId: "action-1", status: "APPROVED" }),
    }));

    expect(response.status).toBe(400);
    expect(recordAssistantProposalDecisionAction).not.toHaveBeenCalled();
    expect(commitAssistantEntityAction).not.toHaveBeenCalled();
  });
});
