import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { sessionActorAccessWhere } from "@/lib/server/session-access";

import FindPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));

describe("Search All page", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders a client's shared-tag results without Nest metadata or a false personal-work label", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "client", primaryEmail: "client@example.test" } } as never);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([]);
    const project = { id: "private-nest", name: "Private coaching practice", slug: "private-nest" };
    const tag = { id: "reflection", projectId: project.id, label: "Reflection", slug: "reflection", hexColor: "#506b46",
      isActive: true, description: "Private catalog notes", aliases: [], mergedIntoTagId: null, project };
    const empty = jest.fn().mockResolvedValue([]);
    const mediaClipRead = jest.fn();
    jest.mocked(getPrismaClient).mockReturnValue({
      studioTag: { findFirst: jest.fn().mockResolvedValue(tag) },
      actionItem: { findMany: jest.fn().mockResolvedValue([{ id: "task", title: "Bring a paragraph", status: "OPEN", project, room: null, sourceJson: {}, tagLinks: [{ tag }] }]) },
      goal: { findMany: jest.fn().mockResolvedValue([{ id: "goal", title: "Write each day", status: "ACTIVE", project, room: null, tagLinks: [{ tag }] }]) },
      callRoom: { findMany: empty }, coachingNote: { findMany: empty }, mediaClip: { findMany: mediaClipRead },
    } as never);
    render(await FindPage({ searchParams: Promise.resolve({ tag: "reflection" }) }));
    expect(screen.getByRole("heading", { name: "#Reflection" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bring a paragraph open Tags: Reflection" })).toHaveAttribute("href", "/work?task=task");
    expect(screen.getByRole("link", { name: "Write each day active Tags: Reflection" })).toHaveAttribute("href", "/work?goal=goal");
    expect(screen.getByText("Work tagged #Reflection in your shared work.")).toBeInTheDocument();
    expect(screen.queryByText(/Private coaching practice|Private catalog notes|personal work|personal goal/)).not.toBeInTheDocument();
    expect(mediaClipRead).not.toHaveBeenCalled();
  });

  it("requires authentication before private access resolution", async () => {
    jest.mocked(auth).mockResolvedValue(null as any);
    render(await FindPage({ searchParams: Promise.resolve({ q: "episode" }) }));
    expect(screen.getByText("signed-out:/find")).toBeInTheDocument();
    expect(listProjectsVisibleToEmail).not.toHaveBeenCalled();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("opens canonical task, goal, Session, document, source, and annotation results", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "Person@Example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{ id: "project-1", slug: "high-ground", name: "High Ground" }] as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      actionItem: { findMany: jest.fn().mockResolvedValue([{ id: "task-1", title: "Episode proof-listen", detail: null, status: "OPEN", dueAt: null, sourceJson: {}, room: { id: "room-1", title: "Episode review" }, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-1", slug: "episode-seed", label: "Episode seed", hexColor: "#506b46", isActive: true } }] }]) },
      goal: { findMany: jest.fn().mockResolvedValue([{ id: "goal-1", title: "Episode quality", description: null, status: "ACTIVE", project: { id: "project-1", name: "High Ground", slug: "high-ground" }, room: null, tagLinks: [] }]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([{ id: "room-1", title: "Episode review", purpose: "PODCAST", status: "ENDED", projectSlug: "high-ground", scheduledStart: null, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [] }]) },
      coachingNote: { findMany: jest.fn().mockResolvedValue([{ id: "note-1", title: "Episode insight", body: "Keep the opening honest.", kind: "SESSION_NOTE", visibility: "AUTHOR_PRIVATE", updatedAt: new Date(), room: { id: "room-1", title: "Episode review" }, tagLinks: [{ tag: { id: "tag-1", slug: "episode-seed", label: "Episode seed", hexColor: "#506b46", isActive: true } }] }]) },
      studioDocument: { findMany: jest.fn().mockResolvedValue([{ id: "document-1", title: "Episode outline", sourceLabel: "document-kind:note", projectionStatus: "private", project: { name: "High Ground", slug: "high-ground" }, blocks: [{ id: "block-1", title: null, body: "The opening needs a human proof-listen." }], tagLinks: [{ tag: { id: "tag-1", slug: "episode-seed", label: "Episode seed", hexColor: "#506b46", isActive: true } }] }]) },
      studioSourceUnit: { findMany: jest.fn().mockResolvedValue([{ id: "source-1", title: "Episode transcript", kind: "transcript", author: "Charlie", project: { name: "High Ground", slug: "high-ground" } }]) },
      studioSourceAnnotation: { findMany: jest.fn().mockResolvedValue([{ id: "annotation-1", kind: "quote", body: "Episode evidence", exactText: "Episode exact words", visibility: "private", sourceUnit: { title: "Episode transcript" }, project: { name: "High Ground", slug: "high-ground" } }]) },
      mediaClip: { findMany: jest.fn().mockResolvedValue([]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([{ id: "tag-1", projectId: "project-1", slug: "episode-seed", label: "Episode seed", description: "Material for a future episode", category: "source", isPrivate: true, aliases: [], project: { name: "High Ground", slug: "high-ground" } }]) },
    } as any);

    render(await FindPage({ searchParams: Promise.resolve({ q: "episode" }) }));
    expect(screen.getByRole("link", { name: "Episode proof-listen open · High Ground · Episode review Tags: Episode seed" })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: "Episode quality active · High Ground" })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByRole("link", { name: "Episode review podcast · ended · High Ground" })).toHaveAttribute("href", "/sessions/room-1");
    expect(screen.getByRole("link", { name: "Episode insight Keep the opening honest. Episode review · session note · author private Tags: Episode seed" })).toHaveAttribute("href", "/sessions/room-1?mode=notes#session-note-note-1");
    expect(screen.getByRole("link", { name: "Episode outline The opening needs a human proof-listen. High Ground · note · private Tags: Episode seed" })).toHaveAttribute("href", "/notes/document-1#note-block-block-1");
    expect(screen.getByRole("link", { name: "Episode transcript High Ground · transcript · Charlie" })).toHaveAttribute("href", "/research?query=Episode%20transcript");
    expect(screen.getByRole("link", { name: "Episode exact words Episode transcript · High Ground · private" })).toHaveAttribute("href", "/research?query=Episode%20exact%20words");
    expect(screen.getByRole("link", { name: "Episode seed High Ground · Tag Material for a future episode" })).toHaveAttribute("href", "/find?tag=tag-1");
    expect(screen.getByRole("status")).toHaveTextContent("Showing 8 results across 1 Nest.");
    expect(screen.queryByText(/Search is read-only|private taxonomy|Permission-filtered/)).not.toBeInTheDocument();
    for (const chip of screen.getAllByText("#Episode seed")) expect(chip).toHaveStyle({ backgroundColor: "#506b46", color: "#ffffff" });
    const prisma = getPrismaClient();
    expect(prisma.callRoom.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        sessionActorAccessWhere({ id: "user-1", primaryEmail: "person@example.com" }),
      ]) }),
    }));
    expect(prisma.actionItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ tagLinks: expect.objectContaining({ select: { tag: { select: expect.objectContaining({ hexColor: true }) } } }) }) }));
  });

  it("renders an exact canonical tag focus without converting identity back to label search", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "Person@Example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([
      { id: "project-1", slug: "high-ground", name: "High Ground", role: "OWNER" },
      { id: "project-2", slug: "coaching", name: "Coaching", role: "VIEWER" },
    ] as any);
    const empty = jest.fn().mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioTag: {
        findFirst: jest.fn().mockResolvedValue({
          id: "tag-1",
          projectId: "project-1",
          slug: "episode-production",
          label: "Episode production",
          description: "Work on one exact episode taxonomy.",
          category: "meaning",
          isPrivate: true,
          isActive: true,
          mergedIntoTagId: null,
          aliases: [],
          project: { id: "project-1", name: "High Ground", slug: "high-ground" },
        }),
        findMany: jest.fn(),
      },
      actionItem: { findMany: empty },
      goal: { findMany: empty },
      callRoom: { findMany: empty },
      coachingNote: { findMany: empty },
      studioDocument: { findMany: empty },
      studioSourceUnit: { findMany: empty },
      studioSourceAnnotation: { findMany: empty },
      mediaClip: {
        findMany: jest.fn().mockResolvedValue([{
          id: "clip-1",
          title: "Opening reaction",
          description: "A precise reusable beat.",
          inTimecode: 4,
          outTimecode: 12,
          mediaAsset: {
            id: "asset-1",
            filename: "episode-reference.mp4",
            duration: 60,
            isGlobal: false,
          },
        }]),
      },
    } as any);

    render(await FindPage({ searchParams: Promise.resolve({ tag: "tag-1" }) }));

    expect(screen.getByRole("heading", { name: "#Episode production" })).toBeInTheDocument();
    expect(screen.getByText("Work tagged #Episode production in High Ground.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Episode production High Ground/ })).toHaveAttribute("href", "/find?tag=tag-1");
    expect(screen.getByRole("link", { name: "Opening reaction A precise reusable beat. episode-reference.mp4 · 4.00s–12.00s" })).toHaveAttribute(
      "href",
      "/media/asset-1?source=find&tag=tag-1&clip=clip-1#clip-clip-1",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 results.");
    expect(screen.queryByRole("heading", { name: "Goals" })).not.toBeInTheDocument();
    expect(screen.queryByText("No matches.")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("offers a direct retry that retains the requested tag when results cannot load", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "Person@Example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockRejectedValueOnce(new Error("Database unavailable"));
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(await FindPage({ searchParams: Promise.resolve({ tag: "tag-1" }) }));
      expect(screen.getByRole("heading", { name: "Search is unavailable" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/find?tag=tag-1");
      expect(screen.queryByText(/unavailable persistence|nothing was changed/)).not.toBeInTheDocument();
    } finally { log.mockRestore(); }
  });
  it("shows one useful empty state instead of a grid of empty categories", async () => {
    jest.mocked(auth).mockResolvedValue({ user: { id: "user-1", primaryEmail: "Person@Example.com" } } as any);
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([] as any);
    const empty = jest.fn().mockResolvedValue([]);
    jest.mocked(getPrismaClient).mockReturnValue({ actionItem: { findMany: empty }, goal: { findMany: empty }, callRoom: { findMany: empty }, coachingNote: { findMany: empty }, studioTag: { findMany: empty } } as any);
    render(await FindPage({ searchParams: Promise.resolve({ q: "unmatched" }) }));
    expect(screen.getByRole("heading", { name: "No results found" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Tasks" })).not.toBeInTheDocument();
  });
});
