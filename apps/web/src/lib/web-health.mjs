export const WEB_HEALTH_RESPONSE = Object.freeze({
  ok: true,
  service: "high-ground-studio",
  app: "web",
});

export const WEB_HEALTH_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
});

export function createWebHealthResponseBody(environment = process.env) {
  const sourceSha = environment.HGO_BUILD_ID || "";
  return {
    ...WEB_HEALTH_RESPONSE,
    ...(sourceSha ? { sourceSha } : {}),
  };
}
