/** @jest-environment node */

import { randomUUID } from "node:crypto";

import { getPrismaClient } from "@/lib/prisma";

import { disconnectGoogleDriveConnection, listGoogleDriveConnections, saveGoogleDriveConnection } from "./google-drive-connection";
import { encryptGoogleDriveRefreshToken } from "./google-drive-oauth";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

const runDatabaseSmoke = process.env.QUIPSLY_GOOGLE_DRIVE_DB_SMOKE === "1" ? describe : describe.skip;
if (process.env.QUIPSLY_GOOGLE_DRIVE_DB_SMOKE === "1") {
  if (!process.env.QUIPSLY_LOCAL_DATABASE_URL) throw new Error("QUIPSLY_LOCAL_DATABASE_URL is required for Drive connection proof.");
  process.env.DATABASE_URL = process.env.QUIPSLY_LOCAL_DATABASE_URL;
}

runDatabaseSmoke("Google Drive connection ownership and receipts", () => {
  const prisma = getPrismaClient();
  const nonce = randomUUID().slice(0, 8);
  let userId = "";
  let otherUserId = "";
  let connectionId = "";
  let workspaceId = "";

  beforeAll(async () => {
    const [user, other] = await Promise.all([
      prisma.user.create({ data: { primaryEmail: `drive-owner-${nonce}@example.test` } }),
      prisma.user.create({ data: { primaryEmail: `drive-other-${nonce}@example.test` } }),
    ]);
    userId = user.id;
    otherUserId = other.id;
  });

  afterAll(async () => {
    try {
      if (workspaceId) await prisma.studioWorkspace.deleteMany({ where: { id: workspaceId } });
      await prisma.studioMediaProviderConnection.deleteMany({ where: { userId: { in: [userId, otherUserId].filter(Boolean) } } });
      await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId].filter(Boolean) } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it("creates and replays one encrypted, user-owned connection", async () => {
    const clientRequestId = randomUUID();
    const value = {
      prisma,
      userId,
      providerAccountKey: `google-drive:${nonce}`,
      accountEmail: `OWNER-${nonce}@example.test`,
      displayName: "Drive owner",
      grantedScopes: ["openid", "email", "https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: "drive-v1.not-a-real-token.test-only",
      clientRequestId,
    };
    const created = await saveGoogleDriveConnection(value);
    connectionId = created.connection.id;
    expect(created).toMatchObject({ replayed: false, connection: { revision: 1, status: "verified" } });
    await expect(saveGoogleDriveConnection(value)).resolves.toMatchObject({ replayed: true, connection: { id: connectionId, revision: 1 } });
    const safe = await listGoogleDriveConnections(prisma, userId);
    expect(safe).toHaveLength(1);
    expect(JSON.stringify(safe)).not.toMatch(/not-a-real-token|encryptedPayload|credential/i);
    await expect(prisma.studioMediaProviderConnectionOperation.findMany({
      where: { connectionId },
      select: { revision: true, previousRevision: true, operation: true, snapshotJson: true },
    })).resolves.toEqual([expect.objectContaining({ revision: 1, previousRevision: 0, operation: "connect" })]);
  });

  it("rejects changed evidence under one request and cross-account identity capture", async () => {
    const clientRequestId = randomUUID();
    await saveGoogleDriveConnection({
      prisma,
      userId,
      providerAccountKey: `google-drive:second-${nonce}`,
      accountEmail: `second-${nonce}@example.test`,
      displayName: null,
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: "encrypted-one",
      clientRequestId,
    });
    await expect(saveGoogleDriveConnection({
      prisma,
      userId,
      providerAccountKey: `google-drive:second-${nonce}`,
      accountEmail: `second-${nonce}@example.test`,
      displayName: null,
      grantedScopes: ["different-scope"],
      encryptedRefreshToken: "encrypted-two",
      clientRequestId,
    })).rejects.toMatchObject({ code: "connection-request-conflict", status: 409 });
    await expect(saveGoogleDriveConnection({
      prisma,
      userId: otherUserId,
      providerAccountKey: `google-drive:${nonce}`,
      accountEmail: `owner-${nonce}@example.test`,
      displayName: null,
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: "encrypted-other",
      clientRequestId: randomUUID(),
    })).rejects.toMatchObject({ code: "provider-account-already-connected", status: 409 });
  });

  it("reconnects with a new projection revision and replaces only the isolated credential", async () => {
    const result = await saveGoogleDriveConnection({
      prisma,
      userId,
      providerAccountKey: `google-drive:${nonce}`,
      accountEmail: `owner-${nonce}@example.test`,
      displayName: "Drive owner updated",
      grantedScopes: ["https://www.googleapis.com/auth/drive.file", "email", "openid"],
      encryptedRefreshToken: "encrypted-replacement",
      clientRequestId: randomUUID(),
    });
    expect(result.connection).toMatchObject({ id: connectionId, revision: 2, status: "verified" });
    await expect(prisma.studioMediaProviderCredential.findUniqueOrThrow({ where: { connectionId } }))
      .resolves.toMatchObject({ encryptedPayload: "encrypted-replacement", encryptionVersion: "aes-256-gcm-drive-v1" });
    await expect(prisma.studioMediaProviderConnectionOperation.findMany({
      where: { connectionId }, orderBy: { revision: "asc" }, select: { revision: true, previousRevision: true, operation: true },
    })).resolves.toEqual([
      { revision: 1, previousRevision: 0, operation: "connect" },
      { revision: 2, previousRevision: 1, operation: "reconnect" },
    ]);
  });

  it("revokes the provider grant, deletes the credential, and holds attached source execution", async () => {
    const key = Buffer.alloc(32, 11);
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      QUIPSLY_APP_HOST: "http://127.0.0.1:3012",
      GOOGLE_DRIVE_OAUTH_CLIENT_ID: "drive-client",
      GOOGLE_DRIVE_OAUTH_CLIENT_SECRET: "drive-secret",
      GOOGLE_DRIVE_OAUTH_STATE_SECRET: "s".repeat(48),
      GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY: key.toString("base64url"),
    };
    const saved = await saveGoogleDriveConnection({
      prisma,
      userId,
      providerAccountKey: `google-drive:disconnect-${nonce}`,
      accountEmail: `disconnect-${nonce}@example.test`,
      displayName: null,
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: encryptGoogleDriveRefreshToken("disconnect-refresh-token", key),
      clientRequestId: randomUUID(),
    });
    const workspace = await prisma.studioWorkspace.create({ data: { slug: `drive-disconnect-${nonce}`, name: "Drive disconnect proof" } });
    workspaceId = workspace.id;
    const project = await prisma.studioProject.create({ data: { workspaceId, slug: `drive-disconnect-${nonce}`, name: "Drive disconnect Nest" } });
    const reference = await prisma.studioExternalMediaReference.create({
      data: {
        projectId: project.id,
        connectionId: saved.connection.id,
        provider: "google-drive",
        connectionKey: `google-drive:${saved.connection.id}`,
        externalFileId: `disconnect-file-${nonce}`,
        fileName: "Disconnect proof.mov",
        accessState: "available",
        capabilityState: "downloadable",
        importedByUserId: userId,
        importedByEmail: `drive-owner-${nonce}@example.test`,
        clientRequestId: randomUUID(),
      },
    });
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async (_url, init) => {
      expect(String(init?.body)).toContain("disconnect-refresh-token");
      return new Response("", { status: 200 });
    }) as typeof fetch;
    try {
      const result = await disconnectGoogleDriveConnection({
        prisma,
        userId,
        connectionId: saved.connection.id,
        clientRequestId: randomUUID(),
        requestUrl: "http://127.0.0.1:3012/api/media/connections/google-drive",
        environment,
      });
      expect(result).toMatchObject({ replayed: false, providerResult: "revoked", connection: { status: "revoked", revision: 2 } });
      await expect(prisma.studioMediaProviderCredential.findUnique({ where: { connectionId: saved.connection.id } })).resolves.toBeNull();
      await expect(prisma.studioExternalMediaReference.findUnique({ where: { id: reference.id }, select: { revision: true, accessState: true, capabilityState: true } }))
        .resolves.toEqual({ revision: 2, accessState: "revoked", capabilityState: "needs-reauth" });
      await expect(prisma.studioExternalMediaReferenceOperation.findMany({ where: { referenceId: reference.id }, select: { operation: true, previousRevision: true, revision: true } }))
        .resolves.toEqual([{ operation: "connection-revoked", previousRevision: 1, revision: 2 }]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("deletes a user-owned connection and its receipts with the user", async () => {
    const disposable = await prisma.user.create({ data: { primaryEmail: `drive-disposable-${nonce}@example.test` } });
    const saved = await saveGoogleDriveConnection({
      prisma,
      userId: disposable.id,
      providerAccountKey: `google-drive:disposable-${nonce}`,
      accountEmail: `drive-disposable-${nonce}@example.test`,
      displayName: null,
      grantedScopes: ["https://www.googleapis.com/auth/drive.file"],
      encryptedRefreshToken: "encrypted-disposable",
      clientRequestId: randomUUID(),
    });
    await expect(prisma.user.delete({ where: { id: disposable.id } })).resolves.toMatchObject({ id: disposable.id });
    await expect(prisma.studioMediaProviderConnection.findUnique({ where: { id: saved.connection.id } })).resolves.toBeNull();
    await expect(prisma.studioMediaProviderConnectionOperation.count({ where: { connectionId: saved.connection.id } })).resolves.toBe(0);
  });
});
