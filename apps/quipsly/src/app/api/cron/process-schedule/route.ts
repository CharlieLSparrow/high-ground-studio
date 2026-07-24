import { retiredPublishingExecutionResponse } from "@/lib/server/retired-publishing-execution";

// Retired before auth headers, database queues, or adapter construction are
// inspected. A future scheduler needs authenticated workload identity and a
// receipt-backed attempt state machine.
export async function POST() {
  return retiredPublishingExecutionResponse();
}

export async function GET() {
  return retiredPublishingExecutionResponse();
}
