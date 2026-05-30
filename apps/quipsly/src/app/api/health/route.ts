import {
  createStudioHealthResponseBody,
  STUDIO_HEALTH_HEADERS,
} from "@/lib/studio-health.mjs";

export function GET() {
  return Response.json(createStudioHealthResponseBody(), {
    headers: STUDIO_HEALTH_HEADERS,
  });
}
