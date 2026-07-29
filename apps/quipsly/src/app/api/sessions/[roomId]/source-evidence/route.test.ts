/** @jest-environment node */

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";

import { GET } from "./route";

const mockedPrisma = jest.mocked(getPrismaClient);
const mockedSession = jest.mocked(getQuipslySessionFromRequest);
const actor = {
  id: "actor-private-1",
  email: "editor@example.com",
  primaryEmail: "editor@example.com",
  isStaff: false,
};

function request() {
  return new Request("http://localhost/api/sessions/room-1/source-evidence");
}

function context() {
  return { params: Promise.resolve({ roomId: "room-1" }) };
}

function prismaFixture() {
  return {
    callRoom: {
      findFirst: jest.fn().mockResolvedValue({
        id: "room-1",
        recordingAssets: [],
        stateReceipts: [],
      }),
    },
    mobileCaptureFinalizationReceipt: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe("Session source-evidence receipt route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSession.mockResolvedValue({ user: actor } as never);
  });

  it("requires an authenticated Session actor before reading Prisma", async () => {
    mockedSession.mockResolvedValue(null);
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
      externalSideEffects: false,
    });
    expect(mockedPrisma).not.toHaveBeenCalled();
  });

  it("does not disclose whether an inaccessible Session exists", async () => {
    const prisma = prismaFixture();
    prisma.callRoom.findFirst.mockResolvedValue(null);
    mockedPrisma.mockReturnValue(prisma as never);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      code: "SESSION_NOT_FOUND",
    });
    expect(prisma.mobileCaptureFinalizationReceipt.findMany).not.toHaveBeenCalled();
  });

  it("downloads a private, no-store, independently derived receipt", async () => {
    const prisma = prismaFixture();
    mockedPrisma.mockReturnValue(prisma as never);
    const response = await GET(request(), context());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(body).toMatchObject({
      schema: "quipsly-nest-source-evidence",
      version: 1,
      authority: "nest-independent-projection",
      roomId: "room-1",
      phoneReceiptImportedAsAuthority: false,
      evidence: {
        sources: [],
        counts: {
          VERIFIED_MATCH: 0,
          HELD: 0,
          DRIFT: 0,
          INCOMPLETE: 0,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("actor-private-1");
  });

  it("fails closed without exposing persistence details", async () => {
    const prisma = prismaFixture();
    prisma.callRoom.findFirst.mockRejectedValue(new Error("postgres password=secret"));
    mockedPrisma.mockReturnValue(prisma as never);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request(), context());
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      ok: false,
      code: "SOURCE_EVIDENCE_UNAVAILABLE",
      externalSideEffects: false,
    });
    expect(JSON.stringify(body)).not.toContain("password");
    errorSpy.mockRestore();
  });
});
