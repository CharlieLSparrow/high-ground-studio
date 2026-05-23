export const WEB_HEALTH_RESPONSE = Object.freeze({
  ok: true,
  service: "high-ground-studio",
  app: "web",
});

export const WEB_HEALTH_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
});

export function createWebHealthResponseBody() {
  return { ...WEB_HEALTH_RESPONSE };
}
