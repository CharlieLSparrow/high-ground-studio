import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

export async function GET() {
  return retiredPrototypeCapabilityResponse("unscoped-agent-registry");
}

export async function POST() {
  return retiredPrototypeCapabilityResponse("unscoped-agent-registry");
}
