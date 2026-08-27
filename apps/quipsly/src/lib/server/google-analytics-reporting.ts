import "server-only";

import { google } from "googleapis";

import { QUIPSLY_PRODUCT_EVENTS } from "@/lib/product-analytics";

const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const CACHE_MS = 5 * 60 * 1_000;

type AggregateRow = {
  label: string;
  activeUsers?: number;
  newUsers?: number;
  sessions?: number;
  eventCount?: number;
};

export type GoogleAnalyticsSummary =
  | {
      status: "available";
      propertyId: string;
      days: number;
      activeUsers: number;
      newUsers: number;
      sessions: number;
      engagedSessions: number;
      devices: AggregateRow[];
      channels: AggregateRow[];
      productEvents: AggregateRow[];
      sampledByConsent: true;
    }
  | {
      status: "not-configured" | "permission-denied" | "unavailable";
      propertyId: string | null;
      reason: string;
    };

type DataApiReport = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
};

type DataApiBatch = { reports?: DataApiReport[]; error?: { code?: number; status?: string } };

const cache = new Map<number, { expiresAt: number; value: GoogleAnalyticsSummary }>();

function propertyId() {
  const value = process.env.QUIPSLY_GA_PROPERTY_ID?.trim() || "";
  return /^\d{6,20}$/.test(value) ? value : null;
}

function wholeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function metricRow(report: DataApiReport | undefined) {
  return report?.rows?.[0]?.metricValues?.map((entry) => wholeNumber(entry.value)) ?? [];
}

function dimensionRows(
  report: DataApiReport | undefined,
  metricNames: Array<"activeUsers" | "newUsers" | "sessions" | "eventCount">,
) {
  return (report?.rows ?? []).map((row) => {
    const result: AggregateRow = {
      label: row.dimensionValues?.[0]?.value?.trim() || "Unknown",
    };
    metricNames.forEach((name, index) => {
      result[name] = wholeNumber(row.metricValues?.[index]?.value);
    });
    return result;
  });
}

async function defaultAccessToken() {
  const auth = new google.auth.GoogleAuth({ scopes: [ANALYTICS_SCOPE] });
  const client = await auth.getClient();
  const response = await client.getAccessToken();
  const token = typeof response === "string" ? response : response?.token;
  if (!token) throw new Error("GA4_ACCESS_TOKEN_UNAVAILABLE");
  return token;
}

export async function readQuipslyGoogleAnalyticsSummary(input: {
  days: number;
  fetcher?: typeof fetch;
  accessToken?: () => Promise<string>;
  now?: Date;
}): Promise<GoogleAnalyticsSummary> {
  const days = Number.isInteger(input.days) && input.days >= 1 && input.days <= 366
    ? input.days
    : 30;
  const exactPropertyId = propertyId();
  if (!exactPropertyId) {
    return {
      status: "not-configured",
      propertyId: null,
      reason: "QUIPSLY_GA_PROPERTY_ID is not configured.",
    };
  }

  const useCache = !input.fetcher && !input.accessToken;
  const now = input.now ?? new Date();
  const cached = useCache ? cache.get(days) : null;
  if (cached && cached.expiresAt > now.getTime()) return cached.value;

  try {
    const token = await (input.accessToken ?? defaultAccessToken)();
    const response = await (input.fetcher ?? fetch)(
      `https://analyticsdata.googleapis.com/v1beta/properties/${exactPropertyId}:batchRunReports`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "Quipsly/1.0 product-operations",
        },
        body: JSON.stringify({
          requests: [
            {
              dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
              metrics: [
                { name: "activeUsers" },
                { name: "newUsers" },
                { name: "sessions" },
                { name: "engagedSessions" },
              ],
            },
            {
              dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
              dimensions: [{ name: "deviceCategory" }],
              metrics: [{ name: "activeUsers" }, { name: "sessions" }],
              orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
              limit: "10",
            },
            {
              dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
              dimensions: [{ name: "sessionDefaultChannelGroup" }],
              metrics: [{ name: "activeUsers" }, { name: "newUsers" }, { name: "sessions" }],
              orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
              limit: "10",
            },
            {
              dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
              dimensions: [{ name: "eventName" }],
              metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
              dimensionFilter: {
                filter: {
                  fieldName: "eventName",
                  inListFilter: {
                    values: QUIPSLY_PRODUCT_EVENTS,
                    caseSensitive: true,
                  },
                },
              },
              orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
              limit: "50",
            },
          ],
        }),
        cache: "no-store",
      },
    );
    const packet = await response.json().catch(() => ({})) as DataApiBatch;
    if (!response.ok) {
      const permissionDenied = response.status === 401 || response.status === 403;
      return {
        status: permissionDenied ? "permission-denied" : "unavailable",
        propertyId: exactPropertyId,
        reason: permissionDenied
          ? "The Quipsly runtime identity needs Viewer access to this GA4 property."
          : "Google Analytics aggregate reporting is temporarily unavailable.",
      };
    }
    const [totals, devices, channels, productEvents] = packet.reports ?? [];
    const [activeUsers, newUsers, sessions, engagedSessions] = metricRow(totals);
    const value: GoogleAnalyticsSummary = {
      status: "available",
      propertyId: exactPropertyId,
      days,
      activeUsers: activeUsers ?? 0,
      newUsers: newUsers ?? 0,
      sessions: sessions ?? 0,
      engagedSessions: engagedSessions ?? 0,
      devices: dimensionRows(devices, ["activeUsers", "sessions"]),
      channels: dimensionRows(channels, ["activeUsers", "newUsers", "sessions"]),
      productEvents: dimensionRows(productEvents, ["eventCount", "activeUsers"]),
      sampledByConsent: true,
    };
    if (useCache) cache.set(days, { expiresAt: now.getTime() + CACHE_MS, value });
    return value;
  } catch {
    return {
      status: "unavailable",
      propertyId: exactPropertyId,
      reason: "Google Analytics aggregate reporting could not be reached.",
    };
  }
}
