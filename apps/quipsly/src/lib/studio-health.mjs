export const STUDIO_HEALTH_RESPONSE = Object.freeze({
  ok: true,
  service: "high-ground-studio",
  app: "studio",
});

export const STUDIO_HEALTH_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
});

export function createStudioHealthResponseBody() {
  return { ...STUDIO_HEALTH_RESPONSE };
}
