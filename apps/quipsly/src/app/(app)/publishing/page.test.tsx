import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import {
  getCurrentHomeNestActorEmail,
  listProjectsVisibleToEmail,
} from "@/lib/server/home-nest";

import PublishingPage from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({
  getCurrentHomeNestActorEmail: jest.fn(),
  listProjectsVisibleToEmail: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: jest.fn((value: string | null | undefined) => value?.trim().toLowerCase() || ""),
}));

describe("Publishing runway truth boundary", () => {
  const packetFindMany = jest.fn();
  const artifactFindMany = jest.fn();
  const prisma = {
    studioOutputPacket: { findMany: packetFindMany },
    studioPublishedArtifact: { findMany: artifactFindMany },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "producer@example.com" },
    });
    (getCurrentHomeNestActorEmail as jest.Mock).mockResolvedValue("");
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    (listProjectsVisibleToEmail as jest.Mock).mockResolvedValue([
      {
        id: "project-1",
        slug: "high-ground-odyssey",
        name: "High Ground Odyssey",
        role: "OWNER",
        sourceLabel: "production",
        updatedAt: new Date("2026-07-18T12:00:00.000Z"),
      },
    ]);
    packetFindMany.mockResolvedValue([]);
    artifactFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows a calm signed-out boundary without reading private persistence", async () => {
    (auth as jest.Mock).mockResolvedValue(null);
    (getCurrentHomeNestActorEmail as jest.Mock).mockResolvedValue("");

    render(await PublishingPage());

    expect(screen.getByRole("heading", { name: /private publishing ledger is locked/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fpublishing",
    );
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(listProjectsVisibleToEmail).not.toHaveBeenCalled();
  });

  it("scopes packet and artifact reads to active accessible Nest IDs", async () => {
    render(await PublishingPage());

    expect(listProjectsVisibleToEmail).toHaveBeenCalledWith("producer@example.com", prisma);
    expect(packetFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: { in: ["project-1"] } },
    }));
    expect(artifactFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: { in: ["project-1"] } },
    }));
    expect(screen.getByRole("heading", { name: /no persisted publishing records yet/i })).toBeInTheDocument();
    expect(screen.getByText(/does not invent connected accounts, queued posts, schedules, or destination health/i)).toBeInTheDocument();
  });

  it("renders packet readiness, internal plan, attempt, and artifact as separate evidence", async () => {
    packetFindMany.mockResolvedValue([
      {
        id: "packet-1",
        slug: "episode-4-youtube",
        kind: "youtube-package",
        title: "Episode 4 YouTube handoff",
        status: "ready",
        projectId: "project-1",
        createdByEmail: "producer@example.com",
        approvedByEmail: null,
        approvedAt: null,
        publishAt: new Date("2026-07-19T16:00:00.000Z"),
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
        updatedAt: new Date("2026-07-18T12:00:00.000Z"),
        lineageJson: { sourceDocumentId: "document-private-1", timelineVersionId: "timeline-4" },
        project: { name: "High Ground Odyssey", slug: "high-ground-odyssey" },
        document: { title: "Episode 4 manuscript" },
        productionRoom: { title: "Episode 4 production" },
        publishAttempts: [
          {
            id: "attempt-1",
            destination: "youtube",
            status: "completed",
            error: null,
            requestedByEmail: "producer@example.com",
            startedAt: new Date("2026-07-18T11:00:00.000Z"),
            completedAt: new Date("2026-07-18T11:02:00.000Z"),
            createdAt: new Date("2026-07-18T11:00:00.000Z"),
          },
        ],
      },
    ]);
    artifactFindMany.mockResolvedValue([
      {
        id: "artifact-1",
        projectId: "project-1",
        outputPacketId: "packet-1",
        destination: "youtube",
        status: "published",
        externalId: "yt-episode-4",
        publicUrl: "https://youtube.example/watch/episode-4",
        publishedAt: new Date("2026-07-18T11:03:00.000Z"),
        createdAt: new Date("2026-07-18T11:03:00.000Z"),
        updatedAt: new Date("2026-07-18T11:03:00.000Z"),
        project: { name: "High Ground Odyssey", slug: "high-ground-odyssey" },
      },
    ]);

    render(await PublishingPage());

    expect(screen.getByText("Packet marked ready")).toBeInTheDocument();
    expect(screen.getByLabelText(/episode 4 youtube handoff internal publish plan/i)).toHaveTextContent(/does not prove a provider accepted or scheduled it/i);
    expect(screen.getByText("Attempt completed")).toBeInTheDocument();
    expect(screen.getByText(/external publication still requires an artifact receipt/i)).toBeInTheDocument();
    expect(screen.getByText("Recorded public URL")).toBeInTheDocument();
    expect(screen.getByText(/has not rechecked the live response/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open recorded url/i })).toHaveAttribute(
      "href",
      "https://youtube.example/watch/episode-4",
    );
    expect(screen.getByText(/sourceDocumentId, timelineVersionId/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish now|edit post|connect/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/tomorrow, 10:00 am/i)).not.toBeInTheDocument();
  });

  it("fails closed with no sample records or mutation controls when persistence is unavailable", async () => {
    (listProjectsVisibleToEmail as jest.Mock).mockRejectedValue(
      Object.assign(new Error("Prisma failed at /private/repo/schema.prisma"), { code: "P2021" }),
    );

    render(await PublishingPage());

    expect(screen.getByRole("status", { name: /publishing ledger unavailable/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /no simulated publishing board is standing in/i })).toBeInTheDocument();
    expect(screen.getByText(/publishing receipt tables are not available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/High Ground.*Connected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private\/repo/i)).not.toBeInTheDocument();
  });

  it("keeps accessible unlinked artifact receipts visible as lineage gaps", async () => {
    artifactFindMany.mockResolvedValue([
      {
        id: "artifact-orphan",
        projectId: "project-1",
        outputPacketId: null,
        destination: "podcast-rss",
        status: "published",
        externalId: "rss-4",
        publicUrl: null,
        publishedAt: null,
        createdAt: new Date("2026-07-18T11:03:00.000Z"),
        updatedAt: new Date("2026-07-18T11:03:00.000Z"),
        project: { name: "High Ground Odyssey", slug: "high-ground-odyssey" },
      },
    ]);

    render(await PublishingPage());

    expect(screen.getByRole("heading", { name: /artifact receipts without a packet shown above/i })).toBeInTheDocument();
    expect(screen.getByText("Provider artifact ID recorded")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open high ground odyssey/i })).toHaveAttribute(
      "href",
      "/nests/high-ground-odyssey",
    );
  });
});
