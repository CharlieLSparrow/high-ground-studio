import { jsonOk } from "@/lib/api";
import {
  getResearchQueue,
  getResearchQueueStats,
} from "@high-ground/quipsly-domain/seed";
import type { ResearchQueueStatus } from "@high-ground/quipsly-domain";

const researchStatuses = [
  "ready-for-review",
  "needs-source",
  "rights-review",
  "variant-check",
  "blocked",
] as const satisfies readonly ResearchQueueStatus[];

function coerceResearchStatus(value: string | null): ResearchQueueStatus | undefined {
  if (value && researchStatuses.includes(value as ResearchQueueStatus)) {
    return value as ResearchQueueStatus;
  }

  return undefined;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const status = coerceResearchStatus(url.searchParams.get("status"));
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue ? Number.parseInt(limitValue, 10) : undefined;

  return jsonOk({
    queue: getResearchQueue({
      status,
      limit: Number.isFinite(limit) ? limit : undefined,
    }),
    stats: getResearchQueueStats(),
    status: status ?? null,
  });
}
