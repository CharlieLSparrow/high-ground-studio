import { retiredPublishingConnectionResponse } from "@/lib/server/retired-publishing-connections";

export async function GET() {
  return retiredPublishingConnectionResponse();
}
