import { render, screen } from "@testing-library/react";

import { getPrismaClient } from "@/lib/prisma";
import { listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import AudioMasteryWorkspacePage from "./page";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("./audio-mastery-workspace-client", () => ({
  AudioMasteryWorkspaceClient: (props: {
    projects: Array<{ slug: string }>;
    initialProjectSlug: string;
    initialEpisodeSlug: string;
  }) => <div data-testid="audio-workspace-props">{JSON.stringify(props)}</div>,
}));

describe("AudioMasteryWorkspacePage project authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the canonical visible-project list even for a staff session", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: {
        id: "staff-user",
        firebaseUid: "firebase-staff",
        email: "staff@example.test",
        primaryEmail: "staff@example.test",
        name: "Staff",
        image: null,
        emailVerified: new Date(),
        roles: ["OWNER"],
        isStaff: true,
      },
    });
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{
      id: "project-allowed",
      workspaceId: "workspace-1",
      slug: "allowed-project",
      name: "Allowed project",
      description: null,
      sourceLabel: null,
      isPrivate: true,
      workspaceName: "Workspace",
      workspaceSlug: "workspace",
      role: "OWNER",
      accessSource: "staff",
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
      collaborators: [],
    }]);
    const findMany = jest.fn().mockResolvedValue([{
      id: "episode-allowed",
      projectId: "project-allowed",
      slug: "episode-allowed",
      title: "Allowed episode",
      status: "PREP",
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
    }]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioEpisodeProduction: { findMany },
    } as never);

    render(await AudioMasteryWorkspacePage({
      searchParams: Promise.resolve({
        project: "unlisted-project",
        episode: "unlisted-episode",
      }),
    }));

    expect(listProjectsVisibleToEmail).toHaveBeenCalledWith(
      "staff@example.test",
      expect.anything(),
    );
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: { in: ["project-allowed"] } },
    }));
    const props = JSON.parse(screen.getByTestId("audio-workspace-props").textContent || "{}");
    expect(props).toMatchObject({
      projects: [{ slug: "allowed-project" }],
      initialProjectId: "project-allowed",
      initialProjectSlug: "allowed-project",
      initialEpisodeSlug: "episode-allowed",
    });
  });

  it("does not substitute another project for a stale ID and slug pair", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: {
        id: "actor",
        firebaseUid: "firebase-actor",
        email: "actor@example.test",
        primaryEmail: "actor@example.test",
        name: "Actor",
        image: null,
        emailVerified: new Date(),
        roles: [],
        isStaff: false,
      },
    });
    jest.mocked(listProjectsVisibleToEmail).mockResolvedValue([{
      id: "project-allowed",
      workspaceId: "workspace-1",
      slug: "allowed-project",
      name: "Allowed project",
      description: null,
      sourceLabel: null,
      isPrivate: true,
      workspaceName: "Workspace",
      workspaceSlug: "workspace",
      role: "OWNER",
      accessSource: "grant",
      updatedAt: new Date("2026-08-06T12:00:00.000Z"),
      collaborators: [],
    }]);
    jest.mocked(getPrismaClient).mockReturnValue({
      studioEpisodeProduction: { findMany: jest.fn().mockResolvedValue([]) },
    } as never);

    render(await AudioMasteryWorkspacePage({
      searchParams: Promise.resolve({
        projectId: "stale-project-id",
        project: "allowed-project",
        episode: "episode-9",
      }),
    }));

    const props = JSON.parse(screen.getByTestId("audio-workspace-props").textContent || "{}");
    expect(props).toMatchObject({
      initialProjectId: "stale-project-id",
      initialProjectSlug: "allowed-project",
      initialEpisodeSlug: "",
      loadError: expect.stringContaining("did not substitute another project"),
    });
  });
});
