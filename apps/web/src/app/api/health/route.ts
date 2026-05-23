import {
  createWebHealthResponseBody,
  WEB_HEALTH_HEADERS,
} from "@/lib/web-health.mjs";

export function GET() {
  return Response.json(createWebHealthResponseBody(), {
    headers: WEB_HEALTH_HEADERS,
  });
}
