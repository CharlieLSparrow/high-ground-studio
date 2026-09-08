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
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }), notFound: jest.fn(), redirect: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  findStudioProjectForAccess: jest.fn(),
  listStudioProjectAccessGrants: jest.fn(),
  normalizeAccessEmail: (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "",
  resolveStudioProjectAccess: jest.fn(),
  roleAllowsAction: () => true,
}));
jest.mock("./CreateDocumentButton", () => ({ CreateDocumentButton: () => <button type="button">Create document</button> }));
jest.mock("./NestQuickCapture", () => ({ NestQuickCapture: () => <div>Quick capture</div> }));
jest.mock("@/app/(app)/work/actions", () => ({ editWorkTask: jest.fn(), updateWorkTaskStatus: jest.fn() }));

describe("Nest project follow-through", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    { view: "overview", kind: "home" },
    { view: "notes", kind: "home" },
    { view: "overview", kind: "production" },
  ])("opens the note from $kind/$view without leaking development fixtures", async ({ view, kind }) => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "OWNER", source: "grant" } as any);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({ id: "project-1", slug: "high-ground", name: "High Ground", sourceLabel: `nest-kind:${kind}` } as any);
    jest.mocked(listStudioProjectAccessGrants).mockResolvedValue([] as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany: jest.fn().mockResolvedValue([{ id: "note-1", title: "Session preparation", sourceLabel: "document-kind:note", updatedAt: new Date(), blocks: [{ id: "block-1", body: "An idea to explore" }], _count: { blocks: 1 } }]) },
      studioMediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
      mediaBin: { findMany: jest.fn().mockResolvedValue([]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      studioEpisodeProduction: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findMany: jest.fn().mockResolvedValue([]) },
      actionItem: { findMany: jest.fn().mockResolvedValue([]) },
    } as any);
    render(await NestDashboardPage({ params: Promise.resolve({ slug: "high-ground" }), searchParams: Promise.resolve({ view }) }));
    expect(screen.getByRole("link", { name: /Session preparation/ })).toHaveAttribute("href", "/notes/note-1");
    expect(screen.queryByRole("heading", { name: /Storyboard NLE Sandbox/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Intro_Shot_01.mp4")).not.toBeInTheDocument();
    if (kind === "production") expect(screen.getByRole("heading", { name: "Episode Rooms" })).toBeInTheDocument();
    else expect(screen.queryByRole("heading", { name: "Episode Rooms" })).not.toBeInTheDocument();
  });

  it("shows only actor-scoped canonical goals and accepted tasks with exact return links", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "person@example.com" } } as any);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true, role: "OWNER", source: "grant" } as any);
    jest.mocked(findStudioProjectForAccess).mockResolvedValue({ id: "project-1", slug: "high-ground", name: "High Ground", description: "Produce the show.", sourceLabel: "production" } as any);
    jest.mocked(listStudioProjectAccessGrants).mockResolvedValue([] as any);

    const goalFindMany = jest.fn().mockResolvedValue([{ id: "goal-1", title: "Ship a trustworthy episode", status: "ACTIVE", targetAt: null, progressReceipts: [{ progressPercent: 75 }] }]);
    const taskFindMany = jest.fn().mockResolvedValue([
      { id: "task-1", title: "Proof-listen the recap", status: "OPEN", dueAt: null, detail: null, updatedAt: new Date("2026-09-08T00:00:00Z"), tagLinks: [], sourceJson: { schema: "quipsly-transcript-derived-task-v1", roomId: "room-1", transcriptJobId: "job-1", segmentId: "segment-1", startSeconds: 3.66, endSeconds: 4.84, providerTextSha256: "a".repeat(64), providerSpeakerLabel: "Speaker", effectiveTextSnapshot: "Welcome, everybody.", effectiveSpeakerLabelSnapshot: "Charlie", acceptedCorrectionId: null, recordingAssetId: "asset-1", playbackSourceId: "source-1" }, room: { id: "room-1", title: "Episode review" } },
      { id: "candidate", title: "Maybe follow up", status: "OPEN", dueAt: null, detail: null, updatedAt: new Date("2026-09-08T00:00:00Z"), tagLinks: [], sourceJson: { source: "transcript-packet-builder", candidate: true }, room: { id: "room-1", title: "Episode review" } },
    ]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioDocument: { findMany: jest.fn().mockResolvedValue([]) },
      studioMediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
      mediaBin: { findMany: jest.fn().mockResolvedValue([]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([]) },
      studioEpisodeProduction: { findMany: jest.fn().mockResolvedValue([]) },
      goal: { findMany: goalFindMany },
      actionItem: { findMany: taskFindMany },
    } as any);

    render(await NestDashboardPage({
      params: Promise.resolve({ slug: "high-ground" }),
      searchParams: Promise.resolve({ view: "work" }),
    }));

    expect(screen.getByRole("heading", { name: "Tasks and goals" })).toBeInTheDocument();
    expect(screen.getByText("OWNER")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ship a trustworthy episode active · 75% progress" })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByRole("link", { name: "Proof-listen the recap" })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: "Return to 0:03–0:04" })).toHaveAttribute("href", "/sessions/room-1#transcript-segment-segment-1");
    expect(screen.queryByText("Maybe follow up")).not.toBeInTheDocument();
    expect(goalFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: "project-1", ownerUserId: "user-1" } }));
    expect(taskFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.any(Array) }) }));
    expect(taskFindMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { dueAt: "asc" }],
      take: 64,
    }));
    expect(JSON.stringify(taskFindMany.mock.calls[0][0].where)).toContain("assignedUserId");
    expect(JSON.stringify(taskFindMany.mock.calls[0][0].where)).toContain("user-1");
  });
});
