const DEFAULT_QUIPSLY_APP_ORIGIN = "https://nest.quipsly.com";

export function captureUniversalLink(
  roomId: string,
  origin = process.env.NEXT_PUBLIC_QUIPSLY_WEB_ORIGIN || DEFAULT_QUIPSLY_APP_ORIGIN,
) {
  const url = new URL(`/sessions/${encodeURIComponent(roomId)}`, origin);
  url.searchParams.set("open", "capture");
  url.searchParams.set("mode", "live");
  return url.toString();
}
