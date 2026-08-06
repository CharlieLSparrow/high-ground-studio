import React from "react";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { notFound, unstable_rethrow } from "next/navigation";

import SessionReviewPage from "./page";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySession: jest.fn() }));
jest.mock("@/lib/server/home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));
jest.mock("./session-review-client", () => ({ SessionReviewClient: () => <div>Session review client</div> }));
jest.mock("next/navigation", () => ({
  notFound: jest.fn(() => {
    const error = new Error("NEXT_HTTP_ERROR_FALLBACK;404") as Error & { digest: string };
    error.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw error;
  }),
  unstable_rethrow: jest.fn((error: unknown) => {
    throw error;
  }),
}));

describe("SessionReviewPage privacy boundary", () => {
  it("propagates Next not-found errors for an inaccessible room", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: { id: "outsider", primaryEmail: "outsider@example.com", email: "outsider@example.com", isStaff: false },
    } as never);
    jest.mocked(getPrismaClient).mockReturnValue({
      callRoom: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);

    await expect(SessionReviewPage({
      params: Promise.resolve({ roomId: "private-room" }),
      searchParams: Promise.resolve({ mode: "prepare" }),
    })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(unstable_rethrow).toHaveBeenCalledWith(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });

  it("queries governed preflight evidence without projecting it onto episode-binding receipts", async () => {
    jest.mocked(getQuipslySession).mockResolvedValue({
      user: { id: "producer", primaryEmail: "producer@example.com", email: "producer@example.com", isStaff: false },
    } as never);
    const findFirst = jest.fn().mockResolvedValue(null);
    jest.mocked(getPrismaClient).mockReturnValue({ callRoom: { findFirst } } as never);

    await expect(SessionReviewPage({
      params: Promise.resolve({ roomId: "private-room" }),
      searchParams: Promise.resolve({ mode: "recordings" }),
    })).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });

    const query = findFirst.mock.calls[0]?.[0] as {
      select?: {
        episodeBindingReceipts?: { select?: Record<string, boolean> };
        participantPreflightReceipts?: { select?: Record<string, boolean> };
      };
    };
    expect(query.select?.episodeBindingReceipts?.select).not.toHaveProperty("governedActionId");
    expect(query.select?.participantPreflightReceipts?.select).toHaveProperty("governedActionId", true);
  });
});
