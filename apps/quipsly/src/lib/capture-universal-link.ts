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

/**
 * Use the registered app scheme for a deliberate "Open Capture" action that
 * begins on nest.quipsly.com. iOS intentionally keeps same-domain Universal
 * Links in Safari, so the HTTPS form remains the safe external/share link while
 * this scheme is the explicit installed-app launch action.
 */
export function captureAppDeepLink(roomId: string) {
  return `quipsly://session/${encodeURIComponent(roomId)}?mode=live`;
}
