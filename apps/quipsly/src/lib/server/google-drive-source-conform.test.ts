/** @jest-environment node */

import type { PrismaClient } from "@prisma/client";

import { planGoogleDriveSourceUnitConform } from "./google-drive-source-conform";

jest.mock("@/auth", () => ({ auth: jest.fn() }));

function sourceUnit(options: { exact?: boolean; durationSeconds?: number }) {
  const exact = options.exact === true;
  const member = (
    role: "browse-proxy" | "primary-original",
    sizeBytes: bigint,
  ) => ({
    id: `reference_${role.replaceAll("-", "_")}`,
    fileName:
      role === "browse-proxy"
        ? "LRV_20260402_080506_01_001.lrv"
        : "VID_20260402_080506_00_001.insv",
    headRevisionKey: `head-${role}`,
    accessState: "available",
    capabilityState: "downloadable",
    connection: {
      id: "connection_12345678",
      userId: "user_12345678",
      status: "verified",
    },
    revisions: [
      {
        id: `revision_${role.replaceAll("-", "_")}`,
        revisionKey: `head-${role}`,
        identitySha256:
          role === "browse-proxy" ? "a".repeat(64) : "b".repeat(64),
        projectionJson: { memberRole: role, channel: "00" },
        sizeBytes,
        durationSeconds:
          role === "browse-proxy" ? (options.durationSeconds ?? null) : null,
        sourceState: exact ? "checksum-bound" : "provider-revision-bound",
        replicas: exact ? [{ id: `replica_${role}` }] : [],
      },
    ],
  });
  return {
    id: "source_unit_12345678",
    title: "April 2 · segment 001",
    metadataJson: {
      captureKey: "VID_20260402_080506_001",
      packageStatus: "ready-to-attach",
      reasons: [],
    },
    externalMediaReferences: [
      member("browse-proxy", 100n),
      member("primary-original", 1_000n),
    ],
  };
}

function prismaFixture(input: {
  source: ReturnType<typeof sourceUnit>;
  sourceSets?: Array<Record<string, unknown>>;
  safeAvailableBytes?: number;
}) {
  return {
    studioSourceUnit: { findFirst: jest.fn(async () => input.source) },
    studioWorkflowJob: { findMany: jest.fn(async () => []) },
    agentNode: {
      findMany: jest.fn(async () =>
        input.safeAvailableBytes === undefined
          ? []
          : [
              {
                capabilities: {
                  executorKind: "local-mac",
                  storage: {
                    schema: "quipsly-local-media-storage-v1",
                    status: "measured",
                    availableBytes: input.safeAvailableBytes + 500,
                    reserveBytes: 500,
                    safeAvailableBytes: input.safeAvailableBytes,
                    measuredAt: new Date().toISOString(),
                  },
                },
                lastHeartbeatAt: new Date(),
              },
            ],
      ),
    },
    studioMediaSourceSet: {
      findMany: jest.fn(async () => input.sourceSets ?? []),
    },
  } as unknown as PrismaClient;
}

describe("Google Drive source package conform planning", () => {
  it("shows exact remaining bytes before any large original is queued", async () => {
    const plan = await planGoogleDriveSourceUnitConform({
      prisma: prismaFixture({ source: sourceUnit({}) }),
      projectId: "project_12345678",
      sourceUnitId: "source_unit_12345678",
      actorUserId: "user_12345678",
    });
    expect(plan).toMatchObject({
      status: "needs-preparation",
      holds: [],
      storage: {
        totalBytes: "1100",
        originalBytes: "1000",
        cachedBytes: "0",
        remainingBytes: "1100",
        shortfallBytes: "0",
      },
      sourceSet: null,
    });
    expect(plan.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "primary-original",
          exactReplicaReady: false,
        }),
      ]),
    );
  });

  it("holds a transfer and reports an exact shortfall when the Mac cannot retain it safely", async () => {
    const plan = await planGoogleDriveSourceUnitConform({
      prisma: prismaFixture({
        source: sourceUnit({}),
        safeAvailableBytes: 400,
      }),
      projectId: "project_12345678",
      sourceUnitId: "source_unit_12345678",
      actorUserId: "user_12345678",
    });
    expect(plan).toMatchObject({
      status: "held",
      holds: [
        "This Mac does not have enough safe storage for the complete exact package.",
      ],
      storage: {
        remainingBytes: "1100",
        shortfallBytes: "700",
        executor: {
          status: "measured",
          safeAvailableBytes: "400",
          localPathWithheld: true,
        },
      },
    });
  });

  it("recognizes a render-ready set only when all exact members match", async () => {
    const source = sourceUnit({ exact: true, durationSeconds: 60 });
    const plan = await planGoogleDriveSourceUnitConform({
      prisma: prismaFixture({
        source,
        sourceSets: [
          {
            id: "source_set_12345678",
            identitySha256: "c".repeat(64),
            completeness: "complete",
            members: source.externalMediaReferences.map((reference) => ({
              sourceRevisionId: reference.revisions[0]!.id,
            })),
          },
        ],
      }),
      projectId: "project_12345678",
      sourceUnitId: "source_unit_12345678",
      actorUserId: "user_12345678",
    });
    expect(plan).toMatchObject({
      status: "render-ready",
      storage: { cachedBytes: "1100", remainingBytes: "0" },
      sourceSet: { id: "source_set_12345678", completeness: "complete" },
    });
  });
});
