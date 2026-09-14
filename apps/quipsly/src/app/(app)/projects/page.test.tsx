import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { listSharedClientSpaces } from "@/lib/server/shared-client-spaces";
jest.mock("@/lib/server/shared-client-spaces", () => ({ listSharedClientSpaces: jest.fn() }));
import { getPrismaClient } from "@/lib/prisma";
import { canAccessPrivateFictionNest } from "@/lib/fiction/private-fiction-access";
import { ensureHomeNestForEmail, listProjectsVisibleToEmail } from "@/lib/server/home-nest";
import { listAccessibleStudioProjectSummariesForEmail } from "@/lib/server/studio-project-access";
import { hasPlatformOwnerRole } from "@/lib/server/user-management";
import { listStudioProjectOptions } from "@/lib/studio/project-registry";
import { NestRegistryUnavailableState } from "./NestRegistryUnavailableState";
import ProjectsHub from "./page";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ quipslyCoachCapabilityAccess: jest.fn() }));
jest.mock("@/lib/fiction/private-fiction-access", () => ({
  canAccessPrivateFictionNest: jest.fn(),
  PRIVATE_FICTION_ISSUE_SLUG: "issue-1",
  PRIVATE_FICTION_PROJECT_SLUG: "private-fiction",
  PRIVATE_FICTION_SERIES_SLUG: "series-1",
}));
jest.mock("@/lib/server/home-nest", () => ({
  ensureHomeNestForEmail: jest.fn(),
  listProjectsVisibleToEmail: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  listAccessibleStudioProjectSummariesForEmail: jest.fn(),
  normalizeAccessEmail: jest.fn((value: string | null | undefined) => value?.trim().toLowerCase() || null),
}));
jest.mock("@/lib/server/user-management", () => ({
  hasPlatformOwnerRole: jest.fn(),
  requireQuipslyAdminActor: jest.fn(),
}));
jest.mock("@/lib/studio/live-work-nests", () => ({ ensureLiveWorkNests: jest.fn() }));
jest.mock("@/lib/studio/project-registry", () => ({
  HGO_PROJECT_SLUG: "high-ground-odyssey",
  listStudioProjectOptions: jest.fn(),
  NEST_KIND_LABELS: {
    home: "Home",
    writing: "Writing",
    study: "Study",
    production: "Production",
    research: "Research",
    fiction: "Fiction",
    course: "Course",
    gallery: "Gallery",
    mixed: "Mixed",
  },
  WORKFLOW_SYSTEM_DESCRIPTIONS: {},
  WORKFLOW_SYSTEM_LABELS: {
    "data-ingestion": "Data ingestion",
    "knowledge-processing": "Knowledge processing",
    "content-creation": "Content creation",
    "content-publishing": "Content publishing",
  },
  workflowSystemForNestKind: jest.fn(() => "content-creation"),
  normalizeNestKind: jest.fn((value: string) => value),
  nestKindFromSourceLabel: jest.fn((value: string) => value === "home" ? "home" : "writing"),
}));
jest.mock("@high-ground/quipsly-domain/output-catalog", () => ({
  getOutputFamilyLabel: jest.fn(),
  listOutputsForNestKind: jest.fn(() => []),
}), { virtual: true });
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({ redirect: jest.fn() }));

describe("Nest registry degraded-state UX", () => {
  const originalOwnerOverride = process.env.QUIPSLY_OWNER_OVERRIDE;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QUIPSLY_OWNER_OVERRIDE = "false";
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    (auth as jest.Mock).mockResolvedValue({
      user: { id: "user-1", primaryEmail: "writer@example.com" },
    });
    (getPrismaClient as jest.Mock).mockReturnValue({ kind: "mock-prisma" });
    (ensureHomeNestForEmail as jest.Mock).mockResolvedValue({ id: "home-1" });
    (listProjectsVisibleToEmail as jest.Mock).mockResolvedValue([]);
    (listStudioProjectOptions as jest.Mock).mockResolvedValue([]);
    (listAccessibleStudioProjectSummariesForEmail as jest.Mock).mockResolvedValue([]);
    (canAccessPrivateFictionNest as jest.Mock).mockResolvedValue(false);
    (hasPlatformOwnerRole as jest.Mock).mockReturnValue(false);
    jest.mocked(listSharedClientSpaces).mockResolvedValue({ spaces: [], hasMore: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalOwnerOverride === undefined) {
      delete process.env.QUIPSLY_OWNER_OVERRIDE;
    } else {
      process.env.QUIPSLY_OWNER_OVERRIDE = originalOwnerOverride;
    }
  });

  it("offers a calm retry without accepting or rendering a raw diagnostic", () => {
    const secretDiagnostic = "Prisma failed at /Users/wall-e/Dev/high-ground-studio/prisma/schema.prisma";
    const { container } = render(<NestRegistryUnavailableState />);

    expect(screen.getByRole("status")).toHaveAccessibleName("Your Nest list could not be loaded");
    expect(screen.getByText(/cannot verify which Nests you own or share/i)).toBeInTheDocument();
    expect(screen.getByText(/connection problem, not an empty workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/show your Home Nest, owned Nests, and invited Nests/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /try again/i })).toHaveAttribute("href", "/projects");
    expect(container).not.toHaveTextContent(secretDiagnostic);
    expect(container).not.toHaveTextContent(/Diagnostic:/i);
  });

  it("hides admin mutations, creation, and empty-state claims when the registry read fails", async () => {
    process.env.QUIPSLY_OWNER_OVERRIDE = "true";
    (hasPlatformOwnerRole as jest.Mock).mockReturnValue(true);
    (listProjectsVisibleToEmail as jest.Mock).mockRejectedValue(
      new Error("Prisma client failed at /Users/wall-e/Dev/high-ground-studio/node_modules/.prisma/client"),
    );

    render(await ProjectsHub({ searchParams: Promise.resolve({ liveNests: "4" }) }));

    expect(screen.getByRole("heading", { name: "Your Nest list could not be loaded" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bootstrap live nests/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Create a Nest" })).not.toBeInTheDocument();
    expect(screen.queryByText(/You have not created any Nests yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No shared Nests yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live Nests are ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/Users\/wall-e\/Dev/i)).not.toBeInTheDocument();
  });

  it("fails closed instead of showing a partial owned list when shared access cannot be verified", async () => {
    (listProjectsVisibleToEmail as jest.Mock).mockResolvedValue([
      {
        id: "owned-1",
        slug: "owned-but-unverified-page",
        name: "Owned Nest that must not leak into a partial page",
        role: "OWNER",
        sourceLabel: "writing",
        updatedAt: new Date("2026-07-18T12:00:00.000Z"),
      },
    ]);
    (listAccessibleStudioProjectSummariesForEmail as jest.Mock).mockRejectedValue(
      new Error("collaboration registry unavailable"),
    );

    render(await ProjectsHub({ searchParams: Promise.resolve({}) }));

    expect(listProjectsVisibleToEmail).toHaveBeenCalledWith(
      "writer@example.com",
      expect.objectContaining({ kind: "mock-prisma" }),
    );
    expect(screen.getByRole("heading", { name: "Your Nest list could not be loaded" })).toBeInTheDocument();
    expect(screen.queryByText("Owned Nest that must not leak into a partial page")).not.toBeInTheDocument();
    expect(canAccessPrivateFictionNest).not.toHaveBeenCalled();
  });

  it("keeps the real empty state and creation controls when all access reads succeed", async () => {
    const { container } = render(await ProjectsHub({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create a Nest" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeRequired();
    expect(screen.getByRole("textbox", { name: /Description/ })).not.toBeRequired();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Create Nest" })).toBeEnabled();
    expect(screen.getByText(/Only you can access this Nest until you invite someone/i)).toBeInTheDocument();
    expect(
      container.querySelector('input[name="clientRequestId"]'),
    ).toHaveAttribute(
      "value",
      expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f-]{27}$/),
    );
    expect(screen.getByText(/You have not created any Nests yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No shared Nests yet/i)).toBeInTheDocument();
  });

  it("shows a client relationship without granting or requiring its parent Nest membership", async () => {
    jest.mocked(listSharedClientSpaces).mockResolvedValue({ spaces: [{ id: "client-space", title: "Our coaching space", people: ["Morgan Ellis"], href: "/coaching/engagements/client-space" }], hasMore: false });
    render(await ProjectsHub({}));
    expect(listSharedClientSpaces).toHaveBeenCalledWith(expect.objectContaining({ kind: "mock-prisma" }), "user-1");
    expect(screen.getByRole("link", { name: "Open Our coaching space" })).toHaveAttribute("href", "/coaching/engagements/client-space");
    expect(screen.getByText("With Morgan Ellis")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View all coaching spaces" })).not.toBeInTheDocument();
  });

  it("keeps confirmed Nests usable when the independent client-space read fails", async () => {
    jest.mocked(listSharedClientSpaces).mockRejectedValue(new Error("database unavailable"));
    render(await ProjectsHub({}));
    expect(screen.getByText("Couldn’t load your coaching spaces.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create a Nest" })).toBeInTheDocument();
    expect(screen.queryByText("database unavailable")).not.toBeInTheDocument();
  });

  it("keeps confirmed coaching spaces and their full list usable when the Nest registry fails", async () => {
    (listProjectsVisibleToEmail as jest.Mock).mockRejectedValue(new Error("registry unavailable"));
    jest.mocked(listSharedClientSpaces).mockResolvedValue({
      spaces: [{ id: "client-space", title: "Our coaching space", people: ["Morgan Ellis"], href: "/coaching/engagements/client-space" }],
      hasMore: true,
    });
    render(await ProjectsHub({}));
    expect(screen.getByRole("link", { name: "Open Our coaching space" })).toHaveAttribute("href", "/coaching/engagements/client-space");
    expect(screen.getByRole("link", { name: "View all coaching spaces" })).toHaveAttribute("href", "/coaching/engagements");
    expect(screen.getByRole("heading", { name: "Your Nest list could not be loaded" })).toBeInTheDocument();
  });

  it("distinguishes an unavailable private document from a missing Nest", async () => {
    render(
      await ProjectsHub({
        searchParams: Promise.resolve({
          fallback: "true",
          documentUnavailable: "1",
          nest: "shared-writing-nest",
        }),
      }),
    );

    expect(
      screen.getByText(/That document is not available to this account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/access to the "shared-writing-nest" Nest is unchanged/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not find a Nest/i)).not.toBeInTheDocument();
  });
});
