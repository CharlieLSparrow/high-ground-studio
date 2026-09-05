/** @jest-environment node */

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { auth } from "@/auth";
import { getPrismaClient } from "@/lib/prisma";

import {
  bootstrapHelpDocsAction,
  createCategoryAction,
  deleteArticleAction,
} from "./actions";

const mockedAuth = jest.mocked(auth);
const mockedPrisma = jest.mocked(getPrismaClient);

describe("global Help Center mutation boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects an organization owner who is not Quipsly staff before reading global data", async () => {
    mockedAuth.mockResolvedValue({
      user: { id: "coach-1", isStaff: false },
    } as never);

    await expect(createCategoryAction("Changed", "Global content")).rejects.toThrow(
      "Quipsly staff access required",
    );
    await expect(bootstrapHelpDocsAction()).rejects.toThrow(
      "Quipsly staff access required",
    );
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("allows a Quipsly staff user to manage the global Help Center", async () => {
    const create = jest.fn().mockResolvedValue({ id: "category-1" });
    const deleteArticle = jest.fn().mockResolvedValue({ id: "article-1" });
    mockedAuth.mockResolvedValue({ user: { id: "staff-1", isStaff: true } } as never);
    mockedPrisma.mockReturnValue({
      knowledgeCategory: { create },
      knowledgeArticle: { delete: deleteArticle },
    } as never);

    await expect(createCategoryAction("Getting Started", "Guides")).resolves.toMatchObject({ ok: true });
    await expect(deleteArticleAction("article-1")).resolves.toEqual({ ok: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(deleteArticle).toHaveBeenCalledWith({ where: { id: "article-1" } });
  });
});
