import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";

import FindPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));

describe("Search All page", () => {
  beforeEach(() => jest.clearAllMocks());

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
      actionItem: { findMany: jest.fn().mockResolvedValue([{ id: "task-1", title: "Episode proof-listen", detail: null, status: "OPEN", dueAt: null, sourceJson: {}, room: { id: "room-1", title: "Episode review" }, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [{ tag: { id: "tag-1", slug: "episode-seed", label: "Episode seed", isActive: true } }] }]) },
      goal: { findMany: jest.fn().mockResolvedValue([{ id: "goal-1", title: "Episode quality", description: null, status: "ACTIVE", project: { id: "project-1", name: "High Ground", slug: "high-ground" }, room: null, tagLinks: [] }]) },
      callRoom: { findMany: jest.fn().mockResolvedValue([{ id: "room-1", title: "Episode review", purpose: "PODCAST", status: "ENDED", projectSlug: "high-ground", scheduledStart: null, project: { id: "project-1", name: "High Ground", slug: "high-ground" }, tagLinks: [] }]) },
      coachingNote: { findMany: jest.fn().mockResolvedValue([{ id: "note-1", title: "Episode insight", body: "Keep the opening honest.", kind: "SESSION_NOTE", updatedAt: new Date(), room: { id: "room-1", title: "Episode review" }, tagLinks: [{ tag: { id: "tag-1", slug: "episode-seed", label: "Episode seed", isActive: true } }] }]) },
      studioDocument: { findMany: jest.fn().mockResolvedValue([{ id: "document-1", title: "Episode outline", projectionStatus: "draft", project: { name: "High Ground", slug: "high-ground" } }]) },
      studioSourceUnit: { findMany: jest.fn().mockResolvedValue([{ id: "source-1", title: "Episode transcript", kind: "transcript", author: "Charlie", project: { name: "High Ground", slug: "high-ground" } }]) },
      studioSourceAnnotation: { findMany: jest.fn().mockResolvedValue([{ id: "annotation-1", kind: "quote", body: "Episode evidence", exactText: "Episode exact words", visibility: "private", sourceUnit: { title: "Episode transcript" }, project: { name: "High Ground", slug: "high-ground" } }]) },
      studioTag: { findMany: jest.fn().mockResolvedValue([{ id: "tag-1", slug: "episode-seed", label: "Episode seed", description: "Material for a future episode", category: "source", isPrivate: true, aliases: [], project: { name: "High Ground", slug: "high-ground" } }]) },
    } as any);

    render(await FindPage({ searchParams: Promise.resolve({ q: "episode" }) }));
    expect(screen.getByRole("link", { name: "Episode proof-listen open · High Ground · Episode review Tags: Episode seed" })).toHaveAttribute("href", "/work?task=task-1");
    expect(screen.getByRole("link", { name: "Episode quality active · High Ground" })).toHaveAttribute("href", "/work?goal=goal-1");
    expect(screen.getByRole("link", { name: "Episode review podcast · ended · High Ground" })).toHaveAttribute("href", "/sessions/room-1");
    expect(screen.getByRole("link", { name: "Episode insight Keep the opening honest. Episode review · session note Tags: Episode seed" })).toHaveAttribute("href", "/sessions/room-1#quick-entry-note-1");
    expect(screen.getByRole("link", { name: "Episode outline High Ground · draft" })).toHaveAttribute("href", "/create?project=high-ground&document=document-1");
    expect(screen.getByRole("link", { name: "Episode transcript High Ground · transcript · Charlie" })).toHaveAttribute("href", "/research?query=Episode%20transcript");
    expect(screen.getByRole("link", { name: "Episode exact words Episode transcript · High Ground · private" })).toHaveAttribute("href", "/research?query=Episode%20exact%20words");
    expect(screen.getByRole("link", { name: "Episode seed High Ground · source · private taxonomy Material for a future episode" })).toHaveAttribute("href", "/research?query=Episode%20seed");
    expect(screen.getByRole("status")).toHaveTextContent("8 accessible results across 1 Nest");
  });
});
