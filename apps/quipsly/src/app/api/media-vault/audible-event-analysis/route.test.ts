/** @jest-environment node */

import { NextRequest } from "next/server";

import { POST } from "./route";
import { registerAudibleEventAnalysis } from "@/lib/server/audible-event-review";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";
import { authorizeStudioMediaSource } from "@/lib/server/studio-media-source-access";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));
jest.mock("@/lib/server/studio-media-source-access", () => ({ authorizeStudioMediaSource: jest.fn() }));
jest.mock("@/lib/server/audible-event-review", () => ({
  AudibleEventReviewError: class AudibleEventReviewError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  registerAudibleEventAnalysis: jest.fn(),
}));

const coordinates = {
  projectSlug: "high-ground-odyssey",
  assetId: "asset-001",
  sourceId: "source-001",
};

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/media-vault/audible-event-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...coordinates,
      action: "register-source-bound-analysis",
      analysis: { analysisId: "audible-analysis-001" },
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
    allowed: true,
    actor: { id: "staff-001", email: "staff@example.com", isStaff: true },
  } as never);
  jest.mocked(authorizeStudioMediaSource).mockResolvedValue({ allowed: true } as never);
  jest.mocked(registerAudibleEventAnalysis).mockResolvedValue({ ok: true, idempotentReplay: false } as never);
});

test("registers only an authorized exact source for a staff operator", async () => {
  const response = await POST(request());

  expect(response.status).toBe(200);
  expect(authorizeStudioMediaSource).toHaveBeenCalledWith(expect.objectContaining({
    sourceId: coordinates.sourceId,
    actor: { id: "staff-001", email: "staff@example.com", isStaff: true },
  }));
  expect(registerAudibleEventAnalysis).toHaveBeenCalledWith(expect.objectContaining({
    ...coordinates,
    analysis: { analysisId: "audible-analysis-001" },
  }));
});

test("rejects ordinary collaborators before source authorization or registration", async () => {
  jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({
    allowed: true,
    actor: { id: "editor-001", email: "editor@example.com", isStaff: false },
  } as never);

  const response = await POST(request());

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "audible-event-analysis-staff-required" });
  expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
  expect(registerAudibleEventAnalysis).not.toHaveBeenCalled();
});

test("fails closed when the immutable source is held", async () => {
  jest.mocked(authorizeStudioMediaSource).mockResolvedValue({
    allowed: false,
    status: 409,
    errorCode: "CAPTURE_EXPLICIT_RELEASE_REQUIRED",
    error: "Held pending release.",
  } as never);

  const response = await POST(request());

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ code: "CAPTURE_EXPLICIT_RELEASE_REQUIRED" });
  expect(registerAudibleEventAnalysis).not.toHaveBeenCalled();
});

test("rejects incomplete coordinates before consulting authorization", async () => {
  const response = await POST(request({ sourceId: "" }));

  expect(response.status).toBe(400);
  expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  expect(authorizeStudioMediaSource).not.toHaveBeenCalled();
  expect(registerAudibleEventAnalysis).not.toHaveBeenCalled();
});
