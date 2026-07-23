import React from "react";
import { render, screen } from "@testing-library/react";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import WorkPage from "./page";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("../studio-access-shell", () => ({ StudioAccessShell: ({ mode, redirectTo }: { mode: string; redirectTo: string }) => <div>{mode}:{redirectTo}</div> }));
jest.mock("./work-client", () => ({ WorkClient: () => <div>Persisted work queue</div> }));

describe("Work Queue page truth states", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a signed-in account before reading private records", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage());
    expect(screen.getByText("signed-out:/work")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("preserves the attention destination across the sign-in boundary", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue(null as any);
    render(await WorkPage({ searchParams: Promise.resolve({ view: "attention" }) }));
    expect(screen.getByText("signed-out:/work?view=attention")).toBeInTheDocument();
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("shows an honest unavailable state instead of sample work", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({ user: { id: "user-1" } } as any);
    jest.mocked(getPrismaClient).mockReturnValue({
      coachingBooking: { findMany: jest.fn().mockRejectedValue(Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" })) },
    } as any);
    render(await WorkPage());
    expect(screen.getByRole("status", { name: "Work queue unavailable" })).toHaveTextContent("database connection is unavailable");
    expect(screen.queryByText("Persisted work queue")).not.toBeInTheDocument();
  });
});
