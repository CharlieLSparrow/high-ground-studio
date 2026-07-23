import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before parsing: this route only logged pretend jobs and returned a
// success-shaped response without a queue or provider receipt.
export async function POST() {
  return retiredPrototypeCapabilityResponse("legacy-distribution-trigger");
}
