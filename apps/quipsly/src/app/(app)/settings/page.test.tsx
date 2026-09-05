import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { ensureQuipslyBillingContext } from "@/lib/server/subscription-entitlements";

import SettingsPage from "./page";
import {
  getOrgEventsAction,
  getOrgFeedbackTicketsAction,
  getOrgMembersAction,
} from "./actions";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/subscription-entitlements", () => ({ ensureQuipslyBillingContext: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));
jest.mock("./settings-client-view", () => ({ SettingsClientView: ({ initialEntitlement, currentUserIsStaff }: { initialEntitlement: { planName: string }; currentUserIsStaff: boolean }) => <div>settings:{initialEntitlement.planName}:staff-{String(currentUserIsStaff)}</div> }));
jest.mock("./actions", () => ({
  getOrgMembersAction: jest.fn(),
  getOrgEventsAction: jest.fn(),
  getOrgFeedbackTicketsAction: jest.fn(),
  updateOrgDetailsAction: jest.fn(),
  removeTeamMemberAction: jest.fn(),
  updateMemberRoleAction: jest.fn(),
}));
jest.mock("@/app/(marketing)/help/actions", () => ({
  createCategoryAction: jest.fn(),
  deleteCategoryAction: jest.fn(),
  upsertArticleAction: jest.fn(),
  deleteArticleAction: jest.fn(),
}));
jest.mock("./feedback-card", () => ({ FeedbackPortal: () => <div>Feedback portal</div> }));

const mockedAuth = jest.mocked(auth);
const mockedPrisma = jest.mocked(getPrismaClient);
const mockedEnsureBilling = jest.mocked(ensureQuipslyBillingContext);
const entitlement = {
  planName: "Quipsly Coach trial",
  accessMode: "TRIAL",
};

describe("Settings page read boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedAuth.mockResolvedValue({ user: { id: "user-1" } } as never);
    mockedEnsureBilling.mockResolvedValue(entitlement as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("keeps signed-out users on the settings path with a return-safe sign-in gate", async () => {
    mockedAuth.mockResolvedValue(null as never);
    render(await SettingsPage());
    expect(screen.getByText("signed-out:/settings")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("prepares a private account workspace without asking the person to provision one", async () => {
    const organization = {
      id: "org-1",
      name: "My Quipsly",
      slug: "quipsly-user-1",
      subscription: null,
    };
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue({ role: "OWNER", organization }) },
      knowledgeCategory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockedPrisma.mockReturnValue(prisma as never);
    jest.mocked(getOrgMembersAction).mockResolvedValue([] as never);
    jest.mocked(getOrgEventsAction).mockResolvedValue([] as never);
    jest.mocked(getOrgFeedbackTicketsAction).mockResolvedValue([] as never);

    render(await SettingsPage());

    expect(screen.getByText("settings:Quipsly Coach trial:staff-false")).toBeInTheDocument();
    expect(mockedEnsureBilling).toHaveBeenCalledWith({
      prisma,
      user: { id: "user-1", name: undefined },
    });
    expect(prisma.organizationMember.findFirst).toHaveBeenCalledTimes(1);
    expect(getOrgMembersAction).toHaveBeenCalledWith("org-1");
    expect(getOrgEventsAction).toHaveBeenCalledWith("org-1");
    expect(getOrgFeedbackTicketsAction).toHaveBeenCalledWith("org-1");
    expect(prisma.knowledgeCategory.findMany).not.toHaveBeenCalled();
  });

  it("loads global Help Center records only for Quipsly staff", async () => {
    mockedAuth.mockResolvedValue({ user: { id: "staff-1", isStaff: true } } as never);
    const organization = { id: "org-1", name: "Quipsly", slug: "quipsly", subscription: null };
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockResolvedValue({ role: "OWNER", organization }) },
      knowledgeCategory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    mockedPrisma.mockReturnValue(prisma as never);
    jest.mocked(getOrgMembersAction).mockResolvedValue([] as never);
    jest.mocked(getOrgEventsAction).mockResolvedValue([] as never);
    jest.mocked(getOrgFeedbackTicketsAction).mockResolvedValue([] as never);

    render(await SettingsPage());

    expect(screen.getByText("settings:Quipsly Coach trial:staff-true")).toBeInTheDocument();
    expect(prisma.knowledgeCategory.findMany).toHaveBeenCalledTimes(1);
  });

  it("shows an honest outage without substituting sample records", async () => {
    const prisma = {
      organizationMember: { findFirst: jest.fn().mockRejectedValue(new Error("ECONNREFUSED /private/schema.prisma")) },
      knowledgeCategory: { findMany: jest.fn() },
    };
    mockedPrisma.mockReturnValue(prisma as never);

    const { container } = render(await SettingsPage());

    expect(screen.getByRole("status", { name: "Settings unavailable" })).toBeInTheDocument();
    expect(screen.getByText(/No sample organization, member, plan, or activity record/i)).toBeInTheDocument();
    expect(container).not.toHaveTextContent("/private/schema.prisma");
  });
});
