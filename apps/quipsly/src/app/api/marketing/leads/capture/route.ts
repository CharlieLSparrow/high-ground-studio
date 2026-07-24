import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before request parsing or persistence. The historical prototype
// assigned every public lead to the first database user, accepted an unscoped
// landing-page ID, and logged a simulated automation trigger.
export async function POST() {
  return retiredPrototypeCapabilityResponse("prototype-lead-capture");
}
