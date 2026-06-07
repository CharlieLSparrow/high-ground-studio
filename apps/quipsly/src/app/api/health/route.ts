import {
  createCompatibilityHealthResponseBody,
  RELEASE_HEALTH_HEADERS,
} from "@/lib/release-health";

export function GET() {
  return Response.json(createCompatibilityHealthResponseBody(), {
    headers: RELEASE_HEALTH_HEADERS,
  });
}
