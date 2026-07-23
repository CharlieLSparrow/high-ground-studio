import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

export async function GET() {
  return retiredPrototypeCapabilityResponse("static-podcast-feed");
}
