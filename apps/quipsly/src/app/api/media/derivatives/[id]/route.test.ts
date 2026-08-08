/** @jest-environment node */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { getPrismaClient } from "@/lib/prisma";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { resolveStudioProjectAccess } from "@/lib/server/studio-project-access";
import {
  readCurrentLocalExecutorIdentity,
  readLocalExecutorTarget,
} from "@/lib/server/local-executor-storage";

import { GET } from "./route";

jest.mock("@/lib/prisma", () => ({ getPrismaClient: jest.fn() }));
jest.mock("@/lib/server/quipsly-session", () => ({
  getQuipslySessionFromRequest: jest.fn(),
}));
jest.mock("@/lib/server/studio-project-access", () => ({
  normalizeAccessEmail: (value: string) => value.toLowerCase(),
  resolveStudioProjectAccess: jest.fn(),
}));
jest.mock("@/lib/server/local-executor-storage", () => ({
  readCurrentLocalExecutorIdentity: jest.fn(),
  readLocalExecutorTarget: jest.fn(),
}));

describe("local media derivative delivery", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacyRoots = process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
  let root = "";
  let legacyRoot = "";
  let outsideRoot = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "quipsly-derivative-route-test-"));
    legacyRoot = path.join(root, "legacy");
    outsideRoot = path.join(root, "outside");
    await Promise.all([
      mkdir(legacyRoot, { recursive: true }),
      mkdir(outsideRoot, { recursive: true }),
    ]);
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: "test",
    });
    process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = JSON.stringify([
      legacyRoot,
    ]);
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({
      user: {
        id: "actor-1",
        email: "member@example.test",
        primaryEmail: "member@example.test",
      },
    } as never);
    jest.mocked(resolveStudioProjectAccess).mockResolvedValue({
      allowed: true,
      projectId: "project-1",
    } as never);
    jest.mocked(readLocalExecutorTarget).mockResolvedValue(null);
    jest.mocked(readCurrentLocalExecutorIdentity).mockResolvedValue(null);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    Object.defineProperty(process.env, "NODE_ENV", {
      configurable: true,
      value: originalNodeEnv,
    });
    if (originalLegacyRoots === undefined)
      delete process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON;
    else
      process.env.QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON = originalLegacyRoots;
    await rm(root, { recursive: true, force: true });
  });

  async function responseFor(
    locator: string,
    bytes: Buffer,
    custody: { custodianNodeId: string | null; storageScopeId: string | null } = {
      custodianNodeId: null,
      storageScopeId: null,
    },
  ) {
    jest.mocked(getPrismaClient).mockReturnValue({
      studioMediaDerivative: {
        findUnique: jest.fn().mockResolvedValue({
          id: "derivative-1",
          projectId: "project-1",
          status: "ready",
          storageProvider: "local",
          ...custody,
          locator,
          sizeBytes: BigInt(bytes.length),
          mimeType: "video/mp4",
          contentSha256: "a".repeat(64),
          project: { slug: "project-one" },
        }),
      },
    } as never);
    return GET(
      new Request("http://127.0.0.1/api/media/derivatives/derivative-1"),
      {
        params: Promise.resolve({ id: "derivative-1" }),
      },
    );
  }

  it("streams an authorized derivative from an explicit legacy root", async () => {
    const bytes = Buffer.from("legacy proxy bytes");
    const locator = path.join(legacyRoot, "proxy.mp4");
    await writeFile(locator, bytes);

    const response = await responseFor(locator, bytes);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns a non-enumerating 404 for a file outside every media root", async () => {
    const bytes = Buffer.from("unrelated local bytes");
    const locator = path.join(outsideRoot, "unrelated.mp4");
    await writeFile(locator, bytes);

    const response = await responseFor(locator, bytes);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("streams executor-local bytes only while their exact storage scope is online", async () => {
    const bytes = Buffer.from("scoped spatial proof bytes");
    const locator = path.join(legacyRoot, "spatial-proof.mp4");
    await writeFile(locator, bytes);
    const custody = {
      custodianNodeId: "execution_worker_spatial_test",
      storageScopeId: "storage_scope_spatial_test",
    };

    expect((await responseFor(locator, bytes, custody)).status).toBe(404);
    jest.mocked(readLocalExecutorTarget).mockResolvedValue({
      nodeId: custody.custodianNodeId,
      hostName: "Editing Mac",
      storageScopeId: custody.storageScopeId,
      storage: {
        status: "measured",
        safeAvailableBytes: "1",
        availableBytes: "1",
        reserveBytes: "0",
        measuredAt: new Date().toISOString(),
        workspaceMode: "durable",
        localPathWithheld: true,
      },
    });
    expect((await responseFor(locator, bytes, custody)).status).toBe(404);
    jest.mocked(readCurrentLocalExecutorIdentity).mockResolvedValue({
      nodeId: custody.custodianNodeId,
      hostName: "Editing Mac",
      storageScopeId: custody.storageScopeId,
    });
    expect((await responseFor(locator, bytes, custody)).status).toBe(200);
  });
});
