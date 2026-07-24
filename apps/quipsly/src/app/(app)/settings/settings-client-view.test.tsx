import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrganizationRole, SubscriptionStatus } from "@prisma/client";

import { SettingsClientView } from "./settings-client-view";

jest.mock("./actions", () => ({
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

const plan = {
  id: "plan-1",
  name: "Legacy Pro row",
  price: 2900,
  currency: "usd",
  interval: "month",
};

const props = {
  initialOrg: {
    id: "org-1",
    name: "High Ground",
    slug: "high-ground",
    description: "Production workspace",
    subscription: {
      id: "sub-1",
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date("2026-08-01T00:00:00.000Z"),
    },
  },
  initialMembers: [
    {
      id: "member-1",
      userId: "user-1",
      role: OrganizationRole.OWNER,
      user: {
        id: "user-1",
        name: "Charlie",
        primaryEmail: "charlie@example.com",
        image: null,
      },
    },
  ],
  initialEvents: [],
  initialFeedback: [],
  plans: [plan, { ...plan, id: "plan-2", name: "Legacy Agency row", price: 9900 }],
  currentUserRole: OrganizationRole.OWNER,
  currentUserId: "user-1",
  initialKbData: [],
};

describe("SettingsClientView truth UX", () => {
  it("shows existing access without an invitation-shaped privilege grant", () => {
    render(<SettingsClientView {...props} />);

    expect(screen.getByText("Existing access only")).toBeInTheDocument();
    expect(screen.getByText(/will not create an account or grant membership/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /invite member|send invitation/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/editor@quipsly/i)).not.toBeInTheDocument();
  });

  it("renders billing records as read-only and exposes no fake card checkout", () => {
    render(<SettingsClientView {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Billing & Plans" }));

    expect(screen.getByText("Billing changes are not connected.")).toBeInTheDocument();
    expect(screen.getByText(/persisted subscription and plan-catalog records only/i)).toBeInTheDocument();
    expect(screen.getByText("Current database record")).toBeDisabled();
    expect(screen.getByText("Checkout unavailable")).toBeDisabled();
    expect(screen.queryByLabelText(/card number|expiry|cvc/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/activation complete|Stripe Sandbox checkout/i)).not.toBeInTheDocument();
  });
});
