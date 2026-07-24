import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before form parsing, storage access, or persistence.
export async function POST() {
  return retiredPrototypeCapabilityResponse("unscoped-asset-upload");
}
