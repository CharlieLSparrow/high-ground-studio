/** @jest-environment node */

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import {
  resolveStudioProjectAccess,
} from "@/lib/server/studio-project-access";

import {
  resolveEpisodeProductionAccess,
  resolveEpisodeProductionActor,
} from "./episode-production-access";

jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: unknown) => String(value ?? "").trim().toLowerCase(),
  resolveStudioProjectAccess: jest.fn(),
}));

const prisma = {} as never;

describe("Episode production shared authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("binds a verified native bearer identity to project access", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-homer",
        firebaseUid: "firebase-homer",
        email: "shomers@gmail.com",
        primaryEmail: "shomers@gmail.com",
        name: "Homer",
        image: null,
        emailVerified: new Date("2026-07-29T00:00:00.000Z"),
        roles: [],
        isStaff: false,
      },
    });
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-hgo",
      role: "EDITOR",
    } as never);
    const request = new Request("https://nest.quipsly.com/api/nests/hgo/episode-room", {
      headers: { authorization: "Bearer opaque-firebase-token" },
    });

    const actor = await resolveEpisodeProductionActor(request);
    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug: "high-ground-odyssey-rehearsal",
      action: "write",
      prisma,
    });

    expect(actor).toEqual({
      id: "user-homer",
      email: "shomers@gmail.com",
      name: "Homer",
      isStaff: false,
      source: "firebase-bearer",
    });
    expect(resolveStudioProjectAccess).toHaveBeenCalledWith({
      projectSlug: "high-ground-odyssey-rehearsal",
      email: "shomers@gmail.com",
      action: "write",
      prisma,
    });
    expect(access.allowed).toBe(true);
  });

  it("never falls through to project access when the presented bearer is rejected", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    const request = new Request("https://nest.quipsly.com/api/nests/hgo/episode-room", {
      headers: { authorization: "Bearer rejected-token" },
    });

    const access = await resolveEpisodeProductionAccess({
      request,
      projectSlug: "high-ground-odyssey-rehearsal",
      action: "read",
      prisma,
    });

    expect(access).toMatchObject({
      allowed: false,
      status: 401,
      code: "episode-production-auth-required",
      actor: { source: "none", email: "" },
    });
    expect(resolveStudioProjectAccess).not.toHaveBeenCalled();
  });

  it("keeps a stable project ID and slug paired at the canonical resolver", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "user-homer",
        firebaseUid: "firebase-homer",
        email: "shomers@gmail.com",
        primaryEmail: "shomers@gmail.com",
        name: "Homer",
        image: null,
        emailVerified: new Date("2026-07-29T00:00:00.000Z"),
        roles: [],
        isStaff: false,
      },
    });
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({ allowed: true } as never);
    const request = new Request("https://nest.quipsly.com/api/media-vault/episode-inventory");

    await resolveEpisodeProductionAccess({
      request,
      projectId: "project-hgo",
      projectSlug: "high-ground-odyssey",
      action: "read",
      prisma,
    });

    expect(resolveStudioProjectAccess).toHaveBeenCalledWith({
      projectId: "project-hgo",
      projectSlug: "high-ground-odyssey",
      email: "shomers@gmail.com",
      action: "read",
      prisma,
    });
  });
});
