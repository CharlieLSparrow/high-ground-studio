import {
  createReleaseHealthResponseBody,
  RELEASE_HEALTH_HEADERS,
} from "@/lib/release-health";

export function GET() {
  return Response.json(createReleaseHealthResponseBody(), {
    headers: RELEASE_HEALTH_HEADERS,
  });
}
