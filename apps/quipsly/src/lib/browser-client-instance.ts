const CLIENT_INSTANCE_KEY = "quipsly-live-device-id";

export function browserClientInstanceId() {
  const stored = window.localStorage.getItem(CLIENT_INSTANCE_KEY)?.trim().toLowerCase();
  if (stored?.startsWith("web-")) return stored;
  const value = `web-${crypto.randomUUID()}`;
  window.localStorage.setItem(CLIENT_INSTANCE_KEY, value);
  return value;
}
