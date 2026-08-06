/** @jest-environment node */

import { NextRequest } from "next/server";

import { GET, POST } from "./route";

const access = jest.fn();
const read = jest.fn();
const register = jest.fn();

jest.mock("@/lib/prisma", () => ({ getPrismaClient: () => ({ marker: "prisma" }) }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: (...args: unknown[]) => access(...args) }));
jest.mock("@/lib/server/episode-audio-activity-analysis", () => ({
  EpisodeAudioActivityAnalysisError: class EpisodeAudioActivityAnalysisError extends Error {
    constructor(message: string, readonly status: number, readonly code: string) { super(message); }
  },
  readEpisodeAudioActivityAnalyses: (...args: unknown[]) => read(...args),
  registerEpisodeAudioActivityAnalysis: (...args: unknown[]) => register(...args),
}));

describe("Episode audio activity analysis route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    access.mockResolvedValue({ allowed: true, actor: { id: "editor-1", email: "editor@example.test" }, access: { projectId: "project-1" } });
  });

  it("requires permission-filtered read access", async () => {
    access.mockResolvedValue({ allowed: false, status: 403, code: "FORBIDDEN", error: "No access." });
    const response = await GET(new NextRequest("http://localhost/api/media-vault/episode-audio-program/analysis?projectSlug=project-one&episodeProductionId=episode-one"));
    expect(response.status).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it("registers analysis with the authenticated actor and stable coordinates", async () => {
    register.mockResolvedValue({ ok: true, idempotentReplay: false, analysis: { id: "analysis-1" } });
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: "project-1", projectSlug: "project-one", episodeProductionId: "episode-one", programFingerprintSha256: "f".repeat(64), clientRequestId: "request-1" }) }));
    expect(response.status).toBe(201);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ prisma: { marker: "prisma" }, actor: { id: "editor-1", email: "editor@example.test" }, projectSlug: "project-one", episodeProductionId: "episode-one", clientRequestId: "request-1" }));
  });

  it("rejects incomplete writes before access or persistence", async () => {
    const response = await POST(new NextRequest("http://localhost/api/media-vault/episode-audio-program/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(400);
    expect(access).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
