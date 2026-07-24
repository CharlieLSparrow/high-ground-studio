import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before parsing: the historical route interpolated a caller-provided
// path into a shell command and reported success without durable job state.
export async function POST() {
  return retiredPrototypeCapabilityResponse("legacy-shell-ingest");
}

export async function GET() {
  return retiredPrototypeCapabilityResponse("legacy-shell-ingest");
}
