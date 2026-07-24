import { retiredPublishingConnectionResponse } from "@/lib/server/retired-publishing-connections";

export const dynamic = "force-dynamic";

export async function GET() {
  return retiredPublishingConnectionResponse();
}
