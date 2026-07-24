import React from "react";
import { render, screen } from "@testing-library/react";

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";

import QuotePassportPage, { generateMetadata } from "./page";

const mockedRedirect = jest.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
const mockedNotFound = jest.fn(() => { throw new Error("NOT_FOUND"); });

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: jest.fn((value?: string | null) => value?.trim().toLowerCase() || ""),
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  redirect: (url: string) => mockedRedirect(url),
  notFound: () => mockedNotFound(),
}));

describe("private quote passport access", () => {
  const findUnique = jest.fn();
  const findFirst = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(auth).mockResolvedValue({
      user: { id: "reader-1", primaryEmail: "reader@example.com" },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({ quipLoreQuote: { findUnique, findFirst } } as never);
    findUnique.mockResolvedValue({ id: "quote-1", project: { id: "project-1", slug: "private-nest" } });
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      role: "VIEWER",
      source: "grant",
      projectId: "project-1",
      projectSlug: "private-nest",
    });
  });

  it("keeps social metadata generic without opening Prisma", async () => {
    const metadata = await generateMetadata();

    expect(metadata.title).toBe("Private quote passport | Quipsly");
    expect(metadata.description).not.toContain("Secret quote");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("redirects signed-out readers before looking up a quote", async () => {
    jest.mocked(auth).mockResolvedValue(null);

    await expect(QuotePassportPage({ params: Promise.resolve({ id: "secret-quote" }) })).rejects.toThrow("REDIRECT:/login?callbackUrl=%2Fq%2Fsecret-quote");
    expect(getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns not found when project access is denied and never loads quote content", async () => {
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: false,
      role: null,
      source: "none",
      projectId: "project-1",
      projectSlug: "private-nest",
    });

    await expect(QuotePassportPage({ params: Promise.resolve({ id: "quote-1" }) })).rejects.toThrow("NOT_FOUND");
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("scopes the final content read to the authorized project", async () => {
    findFirst.mockResolvedValue({
      id: "quote-1",
      projectId: "project-1",
      text: "The source-aware line.",
      createdAt: new Date("2026-07-18T12:00:00.000Z"),
      author: { name: "Charlie" },
      work: { title: "High Ground notes" },
      tags: [{ id: "tag-1", name: "leadership" }],
      project: { slug: "private-nest" },
    });

    render(await QuotePassportPage({ params: Promise.resolve({ id: "quote-1" }) }));

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "quote-1", projectId: "project-1" } }));
    expect(screen.getByRole("article", { name: "Private quote passport" })).toBeInTheDocument();
    expect(screen.getByText("The source-aware line.")).toBeInTheDocument();
    expect(screen.getByText("#leadership")).toBeInTheDocument();
  });
});
