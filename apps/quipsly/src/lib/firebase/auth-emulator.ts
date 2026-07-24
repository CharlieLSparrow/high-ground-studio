const LOCAL_AUTH_EMULATOR_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function resolveFirebaseAuthEmulatorUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" || !LOCAL_AUTH_EMULATOR_HOSTS.has(url.hostname)) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
