import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before parsing: this route never called a worker and returned an
// invented output path after a timer.
export async function POST() {
  return retiredPrototypeCapabilityResponse("legacy-image-workflow");
}
