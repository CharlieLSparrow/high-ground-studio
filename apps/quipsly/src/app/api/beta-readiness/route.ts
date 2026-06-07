import {
  createBetaReadinessResponseBody,
  RELEASE_HEALTH_HEADERS,
} from "@/lib/release-health";
import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";

export async function GET() {
  const productionCore = await getProductionCoreReadinessSafe();

  return Response.json(createBetaReadinessResponseBody({ productionCore }), {
    headers: RELEASE_HEALTH_HEADERS,
  });
}
