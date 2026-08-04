/** @jest-environment node */

import { open } from "node:fs/promises";
import { NextRequest } from "next/server";

import { getPrismaClient } from "@/lib/prisma";
import { resolveAudioSpectralTile } from "@/lib/server/audio-spectral-evidence";
import { resolveEpisodeProductionAccess } from "@/lib/server/episode-production-access";

import { GET } from "./route";

jest.mock("node:fs/promises", () => ({ open: jest.fn() }));
jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/audio-spectral-evidence", () => ({ resolveAudioSpectralTile: jest.fn() }));
jest.mock("@/lib/server/episode-production-access", () => ({ resolveEpisodeProductionAccess: jest.fn() }));

const allowed = {
  allowed: true,
  actor: { id: "editor_001", email: "editor@example.test", name: "Editor", isStaff: false, source: "session" },
  access: { allowed: true, projectId: "project_001", role: "EDITOR" },
};
const base = "http://localhost/api/media-vault/audio-spectral-evidence/tile?projectSlug=high-ground-odyssey&assetId=asset_audio_001&jobId=audio_spectral_001&level=detail";

describe("protected audio spectral tile route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getPrismaClient).mockReturnValue({} as never);
  });

  it("requires an explicit bounded tile coordinate", async () => {
    const response = await GET(new NextRequest(base));
    expect(response.status).toBe(400);
    expect(resolveEpisodeProductionAccess).not.toHaveBeenCalled();
  });

  it("denies project outsiders before resolving a private path or offset", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue({ allowed: false, status: 403, code: "denied", error: "Denied." } as never);
    const response = await GET(new NextRequest(`${base}&tile=0`));
    expect(response.status).toBe(403);
    expect(resolveAudioSpectralTile).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it("reads only the server-resolved byte range and returns the semantic tile type", async () => {
    jest.mocked(resolveEpisodeProductionAccess).mockResolvedValue(allowed as never);
    jest.mocked(resolveAudioSpectralTile).mockResolvedValue({
      path: "/private/analysis/source.qspx",
      offset: 196_608,
      byteLength: 4,
      startSeconds: 10,
      durationSeconds: 5,
      sha256: "a".repeat(64),
    });
    const close = jest.fn(async () => undefined);
    const read = jest.fn(async (bytes: Buffer, offset: number, length: number, position: number) => {
      Buffer.from([3, 7, 11, 19]).copy(bytes);
      expect({ offset, length, position }).toEqual({ offset: 0, length: 4, position: 196_608 });
      return { bytesRead: 4, buffer: bytes };
    });
    jest.mocked(open).mockResolvedValue({ read, close } as never);

    const response = await GET(new NextRequest(`${base}&tile=2`));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.quipsly.spectral-tile; format=gray8");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300, immutable");
    expect(response.headers.get("x-quipsly-tile-start-seconds")).toBe("10");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([3, 7, 11, 19]);
    expect(resolveAudioSpectralTile).toHaveBeenCalledWith({
      prisma: {},
      projectSlug: "high-ground-odyssey",
      assetId: "asset_audio_001",
      jobId: "audio_spectral_001",
      levelId: "detail",
      tileIndex: 2,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
