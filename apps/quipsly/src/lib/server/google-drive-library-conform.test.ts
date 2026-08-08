import { summarizeGoogleDriveLibraryConformPlans } from "./google-drive-library-conform";

type ConformPlan = Parameters<
  typeof summarizeGoogleDriveLibraryConformPlans
>[0]["plans"][number];

function plan(input: {
  id: string;
  title: string;
  capturedAt: string | null;
  status: ConformPlan["status"];
  originalBytes: string;
  remainingBytes: string;
  holds?: string[];
  safeAvailableBytes?: string;
}): ConformPlan {
  return {
    schema: "quipsly-google-drive-source-conform-plan-v1",
    sourceUnit: {
      id: input.id,
      title: input.title,
      captureKey: `capture-${input.id}`,
      capturedAt: input.capturedAt,
    },
    status: input.status,
    holds: input.holds ?? [],
    storage: {
      totalBytes: input.originalBytes,
      originalBytes: input.originalBytes,
      cachedBytes: "0",
      remainingBytes: input.remainingBytes,
      shortfallBytes: "0",
      executor: input.safeAvailableBytes
        ? {
            status: "measured",
            safeAvailableBytes: input.safeAvailableBytes,
            availableBytes: "180",
            reserveBytes: "100",
            measuredAt: "2026-08-08T20:00:00.000Z",
            workspaceMode: "durable",
            localPathWithheld: true,
          }
        : {
            status: "unavailable",
            safeAvailableBytes: null,
            availableBytes: null,
            reserveBytes: null,
            measuredAt: null,
            workspaceMode: "unknown",
            localPathWithheld: true,
          },
    },
    members: [
      {
        referenceId: "secret-provider-reference",
        sourceRevisionId: "secret-source-revision",
        name: "secret-provider-name.insv",
        role: "primary-original",
        channel: null,
        sizeBytes: input.originalBytes,
        durationSeconds: null,
        sourceState: "available",
        exactReplicaReady: input.status === "render-ready",
        materializationJob: null,
      },
    ],
    sourceSet:
      input.status === "render-ready"
        ? {
            id: `set-${input.id}`,
            identitySha256: "a".repeat(64),
            completeness: "complete",
          }
        : null,
  };
}

describe("Google Drive library conform summary", () => {
  it("groups capture days, measures aggregate storage, and withholds member identities", () => {
    const summary = summarizeGoogleDriveLibraryConformPlans({
      library: {
        id: "library-1234",
        name: "Homer 360",
        heldSegmentCount: 3,
      },
      plans: [
        plan({
          id: "source-unit-a",
          title: "May segment A",
          capturedAt: "2026-05-07T18:04:59.000Z",
          status: "render-ready",
          originalBytes: "100",
          remainingBytes: "0",
          safeAvailableBytes: "80",
        }),
        plan({
          id: "source-unit-b",
          title: "May segment B",
          capturedAt: "2026-05-07T18:06:00.000Z",
          status: "needs-preparation",
          originalBytes: "100",
          remainingBytes: "60",
          safeAvailableBytes: "80",
        }),
        plan({
          id: "source-unit-c",
          title: "Undated segment",
          capturedAt: null,
          status: "held",
          originalBytes: "100",
          remainingBytes: "40",
          holds: ["Reconnect the owning Drive account."],
          safeAvailableBytes: "80",
        }),
      ],
      inventoryTruncated: false,
    });

    expect(summary).toMatchObject({
      schema: "quipsly-google-drive-library-conform-plan-v1",
      library: { unattachedHeldSegmentCount: 3 },
      summary: {
        segmentCount: 3,
        renderReady: 1,
        needsPreparation: 1,
        held: 1,
        totalOriginalBytes: "300",
        remainingBytes: "100",
        aggregateShortfallBytes: "20",
        inventoryTruncated: false,
      },
      boundaries: {
        inspectionOnly: true,
        originalsRemainInDrive: true,
        preparationRequiresOneExplicitSegment: true,
        providerLocatorsWithheld: true,
        localPathsWithheld: true,
      },
      days: [
        {
          date: "2026-05-07",
          segmentCount: 2,
          renderReadyCount: 1,
          heldCount: 0,
          remainingBytes: "60",
        },
        {
          date: null,
          segmentCount: 1,
          renderReadyCount: 0,
          heldCount: 1,
          remainingBytes: "40",
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain("secret-provider-reference");
    expect(JSON.stringify(summary)).not.toContain("secret-source-revision");
    expect(JSON.stringify(summary)).not.toContain("secret-provider-name");
  });
});
