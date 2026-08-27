import React from "react";
import { render, screen } from "@testing-library/react";

import { SidebarLayout } from "./SidebarLayout";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/today"),
  useRouter: jest.fn(() => ({ push: jest.fn(), refresh: jest.fn() })),
}));
jest.mock("@/lib/firebase/firebase", () => ({ auth: {} }));
jest.mock("firebase/auth", () => ({ signOut: jest.fn() }));
jest.mock("@/components/NestChatPanel", () => ({ NestChatPanel: () => null }));

describe("Quipsly workspace navigation", () => {
  it("puts the six daily operating surfaces in the primary workflow", () => {
    render(<SidebarLayout><div>Current work</div></SidebarLayout>);

    expect(screen.getAllByRole("link", { name: "Today" })[0]).toHaveAttribute("href", "/today");
    expect(screen.getAllByRole("link", { name: "Inbox" })[0]).toHaveAttribute("href", "/inbox");
    expect(screen.getAllByRole("link", { name: "Work" })[0]).toHaveAttribute("href", "/work");
    expect(screen.getAllByRole("link", { name: "Sessions" })[0]).toHaveAttribute("href", "/coaching/sessions");
    expect(screen.getAllByRole("link", { name: "Library" })[0]).toHaveAttribute("href", "/library");
    expect(screen.getAllByRole("link", { name: "Calendar" })[0]).toHaveAttribute("href", "/schedule");
    expect(screen.getByRole("navigation", { name: "More workspace tools" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Nests" })[0]).toHaveAttribute("href", "/projects");
    expect(screen.getAllByRole("link", { name: "Audio Studio" })[0]).toHaveAttribute("href", "/audio");
    expect(screen.getAllByRole("link", { name: "Podcast desk" })[0]).toHaveAttribute("href", "/podcast");
    expect(screen.getAllByRole("link", { name: "Publishing" }).some((link) => link.getAttribute("href") === "/publishing")).toBe(true);
    expect(screen.getByRole("link", { name: "Get support" })).toHaveAttribute("href", "https://quipsly.com/support");
    expect(screen.queryByText(/support beta/i)).not.toBeInTheDocument();
  });

  it("advertises Search All and a canonical attention queue without inventing unread notifications", () => {
    render(<SidebarLayout><div>Current work</div></SidebarLayout>);

    expect(screen.queryByPlaceholderText("Search assets...")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search all Quipsly" })).toHaveAttribute("href", "/find");
    expect(screen.getAllByRole("link", { name: "Search all" }).every((link) => link.getAttribute("href") === "/find")).toBe(true);
    expect(screen.getByRole("link", { name: "Open attention queue" })).toHaveAttribute("href", "/work?view=attention");
    expect(screen.queryByRole("button", { name: /notifications/i })).not.toBeInTheDocument();
  });

  it("keeps the mobile bar to four destinations plus an explicit More menu", () => {
    render(<SidebarLayout><div>Current work</div></SidebarLayout>);

    expect(screen.getAllByRole("link", { name: "Today" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Inbox" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Work" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Sessions" })).toHaveLength(2);
    expect(screen.getByRole("navigation", { name: "More mobile tools" })).toBeInTheDocument();
    expect(screen.getAllByText("More")).toHaveLength(2);
  });

  it("shows only the back-office destinations granted to a staff role", () => {
    const { rerender } = render(<SidebarLayout showSupportTools><div>Support work</div></SidebarLayout>);
    expect(screen.getAllByRole("link", { name: "Customer support" })[0]).toHaveAttribute("href", "/admin/support");
    expect(screen.queryByRole("link", { name: "Product operations" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();

    rerender(<SidebarLayout showProductOperations><div>Product work</div></SidebarLayout>);
    expect(screen.getAllByRole("link", { name: "Product operations" })[0]).toHaveAttribute("href", "/admin/product-ops");
    expect(screen.queryByRole("link", { name: "Customer support" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
  });
});
