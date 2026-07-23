import { retiredPrototypeCapabilityResponse } from "@/lib/server/retired-prototype-capability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Retired before request parsing or persistence. The historical route was
// unauthenticated and upserted bundled starter content directly into
// "published" artifact/candidate records under a caller-provided owner email.
export async function POST() {
  return retiredPrototypeCapabilityResponse("starter-episode-publisher");
}
