import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

// Retired before parsing: the prototype wrote process-local sidecars marked
// "published" and launched an in-memory job with no actor, durable queue, or
// artifact receipt.
export async function POST() {
  return retiredPrototypeCapabilityResponse("legacy-render-submit");
}
