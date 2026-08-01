import { getCoachingCalendarReadiness } from "@/lib/server/coaching-google-calendar";

import { buildCalendarOverview } from "./calendar-overview";

jest.mock("@/lib/server/coaching-google-calendar", () => ({
  getCoachingCalendarReadiness: jest.fn(),
}));

describe("calendar overview truth and redaction", () => {
  beforeEach(() => {
    jest.mocked(getCoachingCalendarReadiness).mockReturnValue({
      provider: "google-calendar",
      configured: true,
      configurationStatus: "metadata-token-candidate",
      verificationRecommended: true,
    } as never);
  });

  it("holds external writes when configuration exists without a verified connection", () => {
    const overview = buildCalendarOverview({
      connections: [],
      collections: [],
      receipts: [],
      now: new Date("2026-08-01T12:00:00.000Z"),
    });

    expect(overview.externalWritesEnabled).toBe(false);
    expect(overview.managedCoaching.state).toBe("attention");
    expect(overview.purposes.find((item) => item.purpose === "COACHING")?.state).toBe("attention");
    expect(overview.purposes.find((item) => item.purpose === "PODCAST_PRODUCTION")?.state).toBe("quipsly-only");
  });

  it("reports verified projections and only append-only receipt truth", () => {
    const verified = {
      id: "connection-1",
      provider: "GOOGLE",
      status: "VERIFIED",
    };
    const overview = buildCalendarOverview({
      connections: [verified],
      collections: [{
        id: "collection-1",
        purpose: "COACHING",
        status: "ACTIVE",
        connectionId: verified.id,
        connection: verified,
      }],
      receipts: [{
        collectionId: "collection-1",
        operation: "CREATE_EVENT",
        outcome: "SUCCEEDED",
        externalMutated: true,
        occurredAt: new Date("2026-08-01T11:00:00.000Z"),
      }],
    });

    expect(overview.externalWritesEnabled).toBe(true);
    expect(overview.managedCoaching.state).toBe("ready");
    expect(overview.purposes[0]).toMatchObject({
      state: "connected",
      verifiedConnectionCount: 1,
      latestReceipt: { outcome: "SUCCEEDED", externalMutated: true },
    });
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain("credentialRef");
    expect(serialized).not.toContain("providerCalendarId");
    expect(serialized).not.toContain("syncToken");
  });

  it("surfaces a failed provider effect as attention without claiming a mutation", () => {
    const pending = {
      id: "connection-1",
      provider: "GOOGLE",
      status: "PENDING",
    };
    const overview = buildCalendarOverview({
      connections: [pending],
      collections: [{
        id: "collection-1",
        purpose: "COACHING",
        status: "ACTIVE",
        connectionId: pending.id,
        connection: pending,
      }],
      receipts: [{
        collectionId: "collection-1",
        operation: "VERIFY",
        outcome: "FAILED",
        externalMutated: false,
        occurredAt: new Date("2026-08-01T11:00:00.000Z"),
      }],
    });

    expect(overview.purposes[0]).toMatchObject({
      state: "attention",
      latestReceipt: { outcome: "FAILED", externalMutated: false },
    });
  });

  it("does not mistake a personal Google connection for verified managed coaching", () => {
    const verified = {
      id: "personal-google",
      provider: "GOOGLE",
      status: "VERIFIED",
    };
    const overview = buildCalendarOverview({
      connections: [verified],
      collections: [{
        id: "personal-collection",
        purpose: "PERSONAL_COMMITMENTS",
        status: "ACTIVE",
        connectionId: verified.id,
        connection: verified,
      }],
      receipts: [],
    });

    expect(overview.externalWritesEnabled).toBe(true);
    expect(overview.managedCoaching.externallyVerified).toBe(false);
    expect(overview.managedCoaching.state).toBe("attention");
  });
});
