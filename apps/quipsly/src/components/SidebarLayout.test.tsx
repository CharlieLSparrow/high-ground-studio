import React from "react";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import { SidebarLayout } from "./SidebarLayout";
import { createPersonalNote } from "./workspace-create-actions";
import { CoachingSuiteNav } from "./coaching-suite-nav";

jest.mock("next/navigation", () => ({ usePathname: jest.fn(() => "/today"), useRouter: jest.fn() }));
jest.mock("@/lib/firebase/firebase", () => ({ auth: {} }));
jest.mock("firebase/auth", () => ({ signOut: jest.fn() }));
jest.mock("@/components/NestChatPanel", () => ({ NestChatPanel: () => null }));
jest.mock("./workspace-create-actions", () => ({ createPersonalNote: jest.fn() }));

describe("Quipsly workspace navigation", () => {
  const push = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(usePathname).mockReturnValue("/today");
    jest.mocked(useRouter).mockReturnValue({ push, refresh: jest.fn() } as any);
  });
  function openMenu(label: string) {
    const trigger = screen.getByLabelText(label);
    trigger.closest("details")!.setAttribute("open", "");
    return trigger.closest("details")!;
  }

  it("keeps the same five destinations on desktop and mobile", () => {
    render(<SidebarLayout>Current work</SidebarLayout>);
    for (const name of ["Primary workspace", "Mobile workspace"]) {
      const links = within(screen.getByRole("navigation", { name })).getAllByRole("link");
      expect(links.map((link) => link.textContent)).toEqual(["Home", "Sessions", "Nests", "Notes", "Account"]);
      expect(links.map((link) => link.getAttribute("href"))).toEqual(["/today", "/coaching/sessions", "/projects", "/library", "/settings"]);
    }
    expect(screen.queryByText("More")).not.toBeInTheDocument();
    expect(screen.queryByText("Transcription lab")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tasks & goals" })).toHaveAttribute("href", "/work");
    expect(screen.getByRole("link", { name: "Calendar" })).toHaveAttribute("href", "/schedule");
  });

  it("keeps Notes selected while editing a document and shows related tools", () => {
    jest.mocked(usePathname).mockReturnValue("/writing/my-draft");
    render(<SidebarLayout>Draft</SidebarLayout>);
    for (const link of screen.getAllByRole("link", { name: "Notes" })) expect(link).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Notes tools" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.queryByRole("link", { name: "Tasks & goals" })).not.toBeInTheDocument();
  });

  it("keeps global search reachable from both a client space and a note", () => {
    jest.mocked(usePathname).mockReturnValue("/coaching/engagements/client-1");
    const { rerender } = render(<SidebarLayout>Client work</SidebarLayout>);
    expect(screen.getByRole("link", { name: "Search Quipsly" })).toHaveAttribute("href", "/find");
    jest.mocked(usePathname).mockReturnValue("/notes/note-1");
    rerender(<SidebarLayout>Note</SidebarLayout>);
    expect(screen.getByRole("link", { name: "Search Quipsly" })).toHaveAttribute("href", "/find");
  });

  it("lets a client space own its local navigation without stacking two extra toolbars", () => {
    jest.mocked(usePathname).mockReturnValue("/coaching/engagements/client-1");
    const { rerender } = render(<SidebarLayout><CoachingSuiteNav canSchedule />Client workspace</SidebarLayout>);
    expect(screen.queryByRole("navigation", { name: "Sessions tools" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Coaching" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Mobile workspace" })).toBeInTheDocument();
    jest.mocked(usePathname).mockReturnValue("/coaching/engagements");
    rerender(<SidebarLayout><CoachingSuiteNav canSchedule />Client list</SidebarLayout>);
    expect(screen.getByRole("navigation", { name: "Sessions tools" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Coaching" })).toBeInTheDocument();
  });

  it("creates a note from any surface and opens the canonical document", async () => {
    jest.mocked(createPersonalNote).mockResolvedValue({ documentId: "note", href: "/create?project=home&document=note" });
    render(<SidebarLayout>Work</SidebarLayout>);
    openMenu("Create");
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/create?project=home&document=note"));
    expect(createPersonalNote).toHaveBeenCalledTimes(1);
  });

  it("uses the session's own navigation without a second Sessions toolbar", () => {
    jest.mocked(usePathname).mockReturnValue("/sessions/coaching-1");
    const { rerender } = render(<SidebarLayout>Session recording</SidebarLayout>);
    expect(screen.queryByRole("navigation", { name: "Sessions tools" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Primary workspace" })).getByRole("link", { name: "Sessions" }))
      .toHaveAttribute("aria-current", "page");
    jest.mocked(usePathname).mockReturnValue("/sessions/join");
    rerender(<SidebarLayout>Join a session</SidebarLayout>);
    expect(screen.getByRole("navigation", { name: "Sessions tools" })).toBeInTheDocument();
  });

  it("keeps creation failure recoverable in place", async () => {
    jest.mocked(createPersonalNote).mockRejectedValue(new Error("offline"));
    render(<SidebarLayout>Work</SidebarLayout>);
    openMenu("Create");
    fireEvent.click(screen.getByRole("button", { name: /New note/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't create your note");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /New note/ })).toBeEnabled();
  });

  it("dismisses popovers with Escape, outside interaction, and navigation", () => {
    const { rerender } = render(<SidebarLayout>Work</SidebarLayout>);
    const menu = openMenu("Create");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(menu).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Create")).toHaveFocus();
    openMenu("Create");
    fireEvent.pointerDown(document.body);
    expect(menu).not.toHaveAttribute("open");
    openMenu("Create");
    jest.mocked(usePathname).mockReturnValue("/library");
    rerender(<SidebarLayout>Notes</SidebarLayout>);
    expect(menu).not.toHaveAttribute("open");
  });

  it("exposes only granted administration destinations in the account menu", () => {
    const { rerender } = render(<SidebarLayout showSupportTools>Support</SidebarLayout>);
    openMenu("Your account");
    expect(screen.getByRole("link", { name: "Customer support" })).toHaveAttribute("href", "/admin/support");
    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Product operations" })).not.toBeInTheDocument();
    rerender(<SidebarLayout showProductOperations>Product</SidebarLayout>);
    expect(screen.getByRole("link", { name: "Product operations" })).toHaveAttribute("href", "/admin/product-ops");
    expect(screen.queryByRole("link", { name: "Customer support" })).not.toBeInTheDocument();
  });
});
