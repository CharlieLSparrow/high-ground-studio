import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before parsing or room lookup. Canonical capture/session routes bind
// every participant and state transition to a verified Quipsly session.
export async function POST() {
  return retiredPrototypeCapabilityResponse("legacy-call-signaling");
}
