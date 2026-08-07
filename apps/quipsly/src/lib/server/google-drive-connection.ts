import "server-only";

import { createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import {
  decryptGoogleDriveRefreshToken,
  getGoogleDriveOAuthConfig,
  GoogleDriveOAuthError,
  refreshGoogleDriveAccess,
  revokeGoogleDriveToken,
} from "@/lib/server/google-drive-oauth";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function saveGoogleDriveConnection(input: {
  prisma: PrismaClient;
  userId: string;
  providerAccountKey: string;
  accountEmail: string;
  displayName: string | null;
  grantedScopes: string[];
  encryptedRefreshToken: string;
  clientRequestId: string;
}) {
  const normalizedScopes = [...new Set(input.grantedScopes.map((scope) => scope.trim()).filter(Boolean))].sort();
  const requestSha256 = sha256({
    schema: "quipsly-google-drive-connection-request-v1",
    userId: input.userId,
    providerAccountKey: input.providerAccountKey,
    accountEmail: input.accountEmail.trim().toLowerCase(),
    displayName: input.displayName,
    grantedScopes: normalizedScopes,
  });

  return input.prisma.$transaction(async (tx) => {
    const existing = await tx.studioMediaProviderConnection.findUnique({
      where: { provider_providerAccountKey: { provider: "google-drive", providerAccountKey: input.providerAccountKey } },
      include: { operations: { where: { actorUserId: input.userId, clientRequestId: input.clientRequestId }, take: 1 } },
    });
    if (existing?.userId && existing.userId !== input.userId) {
      throw new GoogleDriveOAuthError(
        "That Google Drive account is already connected to another Quipsly identity.",
        "provider-account-already-connected",
        409,
      );
    }
    const replay = existing?.operations[0];
    if (replay) {
      if (replay.requestSha256 !== requestSha256) {
        throw new GoogleDriveOAuthError("That connection request was reused with different account evidence.", "connection-request-conflict", 409);
      }
      return { connection: existing, replayed: true };
    }

    const now = new Date();
    if (!existing) {
      const connection = await tx.studioMediaProviderConnection.create({
        data: {
          userId: input.userId,
          provider: "google-drive",
          providerAccountKey: input.providerAccountKey,
          accountLabel: input.accountEmail.trim().toLowerCase(),
          grantedScopes: normalizedScopes,
          status: "verified",
          revision: 1,
          verifiedAt: now,
          lastCheckedAt: now,
          metadataJson: {
            schema: "quipsly-google-drive-connection-v1",
            displayName: input.displayName,
            selectedFileScope: true,
          },
          credential: {
            create: {
              encryptedPayload: input.encryptedRefreshToken,
              encryptionVersion: "aes-256-gcm-drive-v1",
            },
          },
        },
      });
      await tx.studioMediaProviderConnectionOperation.create({
        data: {
          connectionId: connection.id,
          revision: 1,
          previousRevision: 0,
          operation: "connect",
          outcome: "succeeded",
          actorUserId: input.userId,
          clientRequestId: input.clientRequestId,
          requestSha256,
          snapshotJson: {
            schema: "quipsly-media-provider-connection-receipt-v1",
            provider: "google-drive",
            accountLabel: connection.accountLabel,
            grantedScopes: normalizedScopes,
            status: "verified",
            credentialStoredEncrypted: true,
          },
        },
      });
      return { connection, replayed: false };
    }

    const nextRevision = existing.revision + 1;
    const updated = await tx.studioMediaProviderConnection.updateMany({
      where: { id: existing.id, revision: existing.revision },
      data: {
        accountLabel: input.accountEmail.trim().toLowerCase(),
        grantedScopes: normalizedScopes,
        status: "verified",
        revision: nextRevision,
        verifiedAt: now,
        lastCheckedAt: now,
        revokedAt: null,
        metadataJson: {
          schema: "quipsly-google-drive-connection-v1",
          displayName: input.displayName,
          selectedFileScope: true,
        },
      },
    });
    if (updated.count !== 1) {
      throw new GoogleDriveOAuthError("The Drive connection changed on another surface. Connect again.", "stale-connection", 409);
    }
    await tx.studioMediaProviderCredential.upsert({
      where: { connectionId: existing.id },
      create: {
        connectionId: existing.id,
        encryptedPayload: input.encryptedRefreshToken,
        encryptionVersion: "aes-256-gcm-drive-v1",
      },
      update: {
        encryptedPayload: input.encryptedRefreshToken,
        encryptionVersion: "aes-256-gcm-drive-v1",
      },
    });
    await tx.studioMediaProviderConnectionOperation.create({
      data: {
        connectionId: existing.id,
        revision: nextRevision,
        previousRevision: existing.revision,
        operation: "reconnect",
        outcome: "succeeded",
        actorUserId: input.userId,
        clientRequestId: input.clientRequestId,
        requestSha256,
        snapshotJson: {
          schema: "quipsly-media-provider-connection-receipt-v1",
          provider: "google-drive",
          accountLabel: input.accountEmail.trim().toLowerCase(),
          grantedScopes: normalizedScopes,
          status: "verified",
          credentialStoredEncrypted: true,
        },
      },
    });
    return {
      connection: await tx.studioMediaProviderConnection.findUniqueOrThrow({ where: { id: existing.id } }),
      replayed: false,
    };
  }, { isolationLevel: "Serializable" });
}

export async function listGoogleDriveConnections(prisma: PrismaClient, userId: string) {
  return prisma.studioMediaProviderConnection.findMany({
    where: { userId, provider: "google-drive" },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      accountLabel: true,
      status: true,
      revision: true,
      grantedScopes: true,
      verifiedAt: true,
      lastCheckedAt: true,
      revokedAt: true,
      metadataJson: true,
    },
  });
}

export async function getGoogleDriveAccess(input: {
  prisma: PrismaClient;
  userId: string;
  connectionId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const connection = await input.prisma.studioMediaProviderConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId, provider: "google-drive" },
    include: { credential: true },
  });
  if (!connection) throw new GoogleDriveOAuthError("That Drive connection is unavailable.", "connection-not-found", 404);
  if (connection.status !== "verified" || !connection.credential?.encryptedPayload) {
    throw new GoogleDriveOAuthError("Reconnect Google Drive before browsing its files.", "connection-needs-reauth", 409);
  }
  const config = getGoogleDriveOAuthConfig(input.requestUrl, input.environment);
  const refreshToken = decryptGoogleDriveRefreshToken(connection.credential.encryptedPayload, config.encryptionKey);
  const access = await refreshGoogleDriveAccess({ refreshToken, config });
  return { connection, ...access };
}

export async function disconnectGoogleDriveConnection(input: {
  prisma: PrismaClient;
  userId: string;
  connectionId: string;
  clientRequestId: string;
  requestUrl: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const requestId = input.clientRequestId.trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)) {
    throw new GoogleDriveOAuthError("The disconnect request identity is malformed.", "invalid-request-id", 400);
  }
  const current = await input.prisma.studioMediaProviderConnection.findFirst({
    where: { id: input.connectionId, userId: input.userId, provider: "google-drive" },
    include: { credential: true },
  });
  if (!current) throw new GoogleDriveOAuthError("That Drive connection is unavailable.", "connection-not-found", 404);
  if (current.status === "revoked" && !current.credential) return { connection: current, replayed: true, providerResult: "already-disconnected" as const };
  if (!current.credential?.encryptedPayload) {
    throw new GoogleDriveOAuthError("The Drive credential is unavailable. Reconnect before disconnecting cleanly.", "credential-missing", 409);
  }
  const config = getGoogleDriveOAuthConfig(input.requestUrl, input.environment);
  const refreshToken = decryptGoogleDriveRefreshToken(current.credential.encryptedPayload, config.encryptionKey);
  const providerResult = await revokeGoogleDriveToken(refreshToken);
  const requestSha256 = sha256({
    schema: "quipsly-google-drive-disconnect-request-v1",
    connectionId: current.id,
    userId: input.userId,
    expectedRevision: current.revision,
  });

  const connection = await input.prisma.$transaction(async (tx) => {
    const latest = await tx.studioMediaProviderConnection.findUniqueOrThrow({
      where: { id: current.id },
      include: {
        operations: { where: { actorUserId: input.userId, clientRequestId: requestId }, take: 1 },
        externalReferences: {
          select: {
            id: true,
            revision: true,
            projectId: true,
            provider: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            headRevisionKey: true,
            revisions: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true } },
          },
        },
      },
    });
    const replay = latest.operations[0];
    if (replay) {
      if (replay.requestSha256 !== requestSha256) {
        throw new GoogleDriveOAuthError("That disconnect request identity was reused.", "connection-request-conflict", 409);
      }
      return latest;
    }
    if (latest.revision !== current.revision) {
      throw new GoogleDriveOAuthError("The Drive connection changed on another surface.", "stale-connection", 409);
    }
    const nextRevision = latest.revision + 1;
    const updated = await tx.studioMediaProviderConnection.updateMany({
      where: { id: latest.id, revision: latest.revision },
      data: { status: "revoked", revision: nextRevision, revokedAt: new Date(), lastCheckedAt: new Date() },
    });
    if (updated.count !== 1) throw new GoogleDriveOAuthError("The Drive connection changed on another surface.", "stale-connection", 409);
    await tx.studioMediaProviderCredential.deleteMany({ where: { connectionId: latest.id } });
    await tx.studioMediaProviderConnectionOperation.create({
      data: {
        connectionId: latest.id,
        revision: nextRevision,
        previousRevision: latest.revision,
        operation: "disconnect",
        outcome: "succeeded",
        actorUserId: input.userId,
        clientRequestId: requestId,
        requestSha256,
        snapshotJson: {
          schema: "quipsly-media-provider-connection-receipt-v1",
          provider: "google-drive",
          accountLabel: latest.accountLabel,
          status: "revoked",
          credentialDeleted: true,
          providerResult,
        },
      },
    });
    for (const reference of latest.externalReferences) {
      const referenceRevision = reference.revision + 1;
      const referenceRequestSha256 = sha256({
        schema: "quipsly-external-media-connection-revocation-v1",
        connectionId: latest.id,
        referenceId: reference.id,
        previousRevision: reference.revision,
      });
      const referenceUpdated = await tx.studioExternalMediaReference.updateMany({
        where: { id: reference.id, revision: reference.revision },
        data: { accessState: "revoked", capabilityState: "needs-reauth", revision: referenceRevision, lastVerifiedAt: new Date() },
      });
      if (referenceUpdated.count !== 1) throw new GoogleDriveOAuthError("An attached Drive source changed during disconnect.", "stale-external-reference", 409);
      await tx.studioExternalMediaReferenceOperation.create({
        data: {
          referenceId: reference.id,
          revision: referenceRevision,
          previousRevision: reference.revision,
          operation: "connection-revoked",
          actorUserId: input.userId,
          clientRequestId: requestId,
          requestSha256: referenceRequestSha256,
          snapshotJson: {
            schema: "quipsly-external-media-v1",
            referenceId: reference.id,
            revision: referenceRevision,
            projectId: reference.projectId,
            connectionId: latest.id,
            provider: reference.provider,
            fileName: reference.fileName,
            mimeType: reference.mimeType,
            sizeBytes: reference.sizeBytes?.toString() ?? null,
            headRevisionKey: reference.headRevisionKey,
            accessState: "revoked",
            capabilityState: "needs-reauth",
            sourceRevisionId: reference.revisions[0]?.id ?? "",
          },
        },
      });
    }
    return tx.studioMediaProviderConnection.findUniqueOrThrow({ where: { id: latest.id } });
  }, { isolationLevel: "Serializable" });
  return { connection, replayed: false, providerResult };
}
