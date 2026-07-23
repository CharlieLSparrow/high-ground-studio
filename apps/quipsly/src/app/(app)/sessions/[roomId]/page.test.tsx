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

    await expect(SessionReviewPage({ params: Promise.resolve({ roomId: "private-room" }) })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(notFound).toHaveBeenCalledTimes(1);
    expect(unstable_rethrow).toHaveBeenCalledWith(expect.objectContaining({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" }));
  });
});
