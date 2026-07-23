import { retiredPublishingExecutionResponse } from "@/lib/server/retired-publishing-execution";

// Retired before request parsing: the historical route was public and could
// call external adapters without a scoped actor or persisted attempt receipt.
export async function POST() {
  return retiredPublishingExecutionResponse();
}
