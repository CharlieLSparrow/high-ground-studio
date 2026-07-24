import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  findStudioProjectForAccess,
  listStudioProjectAccessGrants,
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

import NestDashboardPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  findStudioProjectForAccess: jest.fn(),
  listStudioProjectAccessGrants: jest.fn(),
  normalizeAccessEmail: (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "",
  resolveStudioProjectAccess: jest.fn(),
  roleAllowsAction: () => true,
}));
jest.mock("./CreateDocumentButton", () => ({ CreateDocumentButton: () => <button type="button">Create document</button> }));

describe("Nest project follow-through", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows only actor-scoped canonical goals and accepted tasks with exact return links", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "OWNER", source: "operator-override" } as any);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({ id: "project-1", slug: "high-ground", name: "High Ground", description: "Produce the show.", sourceLabel: "production" } as any);
    jest.mocked(listStudioProjectAccessGrants).mockResolvedValue([] as any);

    const goalFindMany = jest.fn().mockResolvedValue([{ id: "goal-1", title: "Ship a trustworthy episode", status: "ACTIVE", targetAt: null, progressReceipts: [{ progressPercent: 75 }] }]);
    const taskFindMany = jest.fn().mockResolvedValue([
      { id: "task-1", title: "Proof-listen the recap", status: "OPEN", dueAt: null, sourceJson: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: null, recordingAssetId: "asset-1", playbackSourceId: "source-1" }, room: { id: "room-1", title: "Episode review" } },
      { id: "candidate", title: "Maybe follow up", status: "OPEN", dueAt: null, sourceJson: { source: "transcript-packet-builder", candidate: true }, room: { id: "room-1", title: "Episode review" } },
    ]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany: jest.fn().mockResolvedValue([]) },
      studioMediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
      mediaBin: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findMany: goalFindMany },
      actionItem: { findMany: taskFindMany },
    } as any);

    render(await NestDashboardPage({ params: Promise.resolve({ slug: "high-ground" }) }));

    expect(screen.getByRole("heading", { name: "Project follow-through" })).toBeInTheDocument();
    expect(screen.getByText("Operator override: OWNER")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ship a trustworthy episode active · 75% progress" })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByRole("link", { name: "Proof-listen the recap" })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: "Return to 0:03–0:04" })).toHaveAttribute("href", "/sessions/room-1#transcript-segment-segment-1");
    expect(screen.queryByText("Maybe follow up")).not.toBeInTheDocument();
    expect(goalFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-1", ownerUserId: "user-1" } }));
    expect(taskFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }));
    expect(JSON.stringify(taskFindMany.mock.calls[0][0].where)).toContain("assignedUserId");
    expect(JSON.stringify(taskFindMany.mock.calls[0][0].where)).toContain("user-1");
  });
});
