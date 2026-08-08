/** @jest-environment node */

import type { PrismaClient } from "@prisma/client";

import {
  GoogleDriveSourceMaterializationRequestError,
  requestGoogleDriveSourceMaterialization,
} from "./google-drive-source-materialization";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

describe("Google Drive source materialization capacity preflight", () => {
  it("does not create a workflow job when the Mac reserve would be crossed", async () => {
    const create = jest.fn();
    const prisma = {
      studioMediaSourceRevision: {
        findFirst: jest.fn(async () => ({
          id: "revision_12345678",
          projectId: "project_12345678",
          revisionKey: "head-revision-12345678",
          identitySha256: "a".repeat(64),
          mediaProjection: "dual-fisheye",
          sizeBytes: 1_900_000_000n,
          projectionJson: { memberRole: "browse-proxy" },
          verificationJson: {
            providerChecksum: { algorithm: "md5", value: "b".repeat(32) },
          },
          project: { slug: "high-ground-odyssey" },
          replicas: [],
          externalReference: {
            id: "reference_12345678",
            provider: "google-drive",
            mimeType: "video/mp4",
            accessState: "available",
            capabilityState: "downloadable",
            providerLocatorJson: { externalFileId: "drive-file-12345678" },
            connection: {
              id: "connection_12345678",
              userId: "actor_12345678",
              provider: "google-drive",
              status: "verified",
            },
          },
        })),
      },
      studioWorkflowJob: {
        findUnique: jest.fn(async () => null),
        create,
      },
      agentNode: {
        findMany: jest.fn(async () => [
          {
            id: "execution_worker_12345678",
            hostName: "quipsly-media-worker:Retained-Mac",
            capabilities: {
              executorKind: "local-mac",
              storage: {
                schema: "quipsly-local-media-storage-v1",
                status: "measured",
                availableBytes: 6_770_709_120,
                reserveBytes: 5_368_709_120,
                safeAvailableBytes: 1_402_000_000,
                measuredAt: "2026-08-08T20:00:00.000Z",
                workspaceMode: "temporary",
                scopeId: "storage_scope_12345678",
                pathWithheld: true,
              },
            },
            lastHeartbeatAt: new Date("2026-08-08T20:00:00.000Z"),
          },
        ]),
      },
    } as unknown as PrismaClient;

    await expect(
      requestGoogleDriveSourceMaterialization({
        prisma,
        projectId: "project_12345678",
        referenceId: "reference_12345678",
        sourceRevisionId: "revision_12345678",
        actorUserId: "actor_12345678",
        actorEmail: "homer@example.test",
        clientRequestId: "018f3c85-7b73-7a5e-8a53-2d0c360f5b89",
      }),
    ).rejects.toMatchObject({
      code: "executor-storage-pressure",
      status: 409,
      message: expect.stringContaining("498000000 bytes short"),
    } satisfies Partial<GoogleDriveSourceMaterializationRequestError>);
    expect(create).not.toHaveBeenCalled();
  });
});
