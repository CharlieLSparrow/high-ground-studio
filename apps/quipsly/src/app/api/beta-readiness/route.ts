import {
  createBetaReadinessResponseBody,
  RELEASE_HEALTH_HEADERS,
} from "@/lib/release-health";
import { RELEASE_SMOKE_RECEIPT_HEADER } from "@/lib/server/release-smoke-receipt";
import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const productionCore = await getProductionCoreReadinessSafe();
  const readiness = createBetaReadinessResponseBody({
    productionCore,
    releaseSmokeReceipt: {
      token: request.headers.get(RELEASE_SMOKE_RECEIPT_HEADER),
    },
  });

  return Response.json(readiness, {
    status: readiness.ready ? 200 : 503,
    headers: {
      ...RELEASE_HEALTH_HEADERS,
      Vary: RELEASE_SMOKE_RECEIPT_HEADER,
    },
  });
}
