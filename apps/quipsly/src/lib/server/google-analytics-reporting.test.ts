/** @jest-environment node */

import { readQuipslyGoogleAnalyticsSummary } from "./google-analytics-reporting";

jest.mock("server-only", () => ({}));
jest.mock("googleapis", () => ({ google: { auth: { GoogleAuth: jest.fn() } } }));

const originalProperty = process.env.QUIPSLY_GA_PROPERTY_ID;

afterEach(() => {
  if (originalProperty === undefined) delete process.env.QUIPSLY_GA_PROPERTY_ID;
  else process.env.QUIPSLY_GA_PROPERTY_ID = originalProperty;
});

describe("Google Analytics aggregate reporting", () => {
  it("returns only aggregate product, device, and acquisition rows", async () => {
    process.env.QUIPSLY_GA_PROPERTY_ID = "503353241";
    const fetcher = jest.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      expect(request.requests).toHaveLength(4);
      expect(JSON.stringify(request)).not.toMatch(
        /recipientEmail|userId|roomTitle|transcriptText|recordingUrl/i,
      );
      return new Response(JSON.stringify({
        reports: [
          { rows: [{ metricValues: [{ value: "12" }, { value: "7" }, { value: "20" }, { value: "15" }] }] },
          { rows: [{ dimensionValues: [{ value: "mobile" }], metricValues: [{ value: "9" }, { value: "14" }] }] },
          { rows: [{ dimensionValues: [{ value: "Direct" }], metricValues: [{ value: "8" }, { value: "5" }, { value: "11" }] }] },
          { rows: [{ dimensionValues: [{ value: "call_joined" }], metricValues: [{ value: "6" }, { value: "4" }] }] },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    await expect(readQuipslyGoogleAnalyticsSummary({
      days: 30,
      fetcher: fetcher as never,
      accessToken: async () => "test-token",
    })).resolves.toEqual({
      status: "available",
      propertyId: "503353241",
      days: 30,
      activeUsers: 12,
      newUsers: 7,
      sessions: 20,
      engagedSessions: 15,
      devices: [{ label: "mobile", activeUsers: 9, sessions: 14 }],
      channels: [{ label: "Direct", activeUsers: 8, newUsers: 5, sessions: 11 }],
      productEvents: [{ label: "call_joined", eventCount: 6, activeUsers: 4 }],
      sampledByConsent: true,
    });
  });

  it("fails closed when the runtime identity lacks property access", async () => {
    process.env.QUIPSLY_GA_PROPERTY_ID = "503353241";
    const result = await readQuipslyGoogleAnalyticsSummary({
      days: 7,
      fetcher: async () => new Response(JSON.stringify({ error: { code: 403 } }), { status: 403 }),
      accessToken: async () => "cloud-token",
    });
    expect(result).toMatchObject({ status: "permission-denied", propertyId: "503353241" });
  });

  it("does not call Google when no exact property is configured", async () => {
    delete process.env.QUIPSLY_GA_PROPERTY_ID;
    const fetcher = jest.fn();
    const result = await readQuipslyGoogleAnalyticsSummary({
      days: 30,
      fetcher: fetcher as never,
      accessToken: async () => "unused",
    });
    expect(result.status).toBe("not-configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
