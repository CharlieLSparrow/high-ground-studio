import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

export async function POST() {
  return retiredPrototypeCapabilityResponse("hardcoded-snippet-ingest");
}
