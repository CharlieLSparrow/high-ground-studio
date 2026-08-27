export const QUIPSLY_PRODUCT_EVENTS = [
  "login_started",
  "sign_up",
  "coach_profile_created",
  "booking_link_shared",
  "booking_link_opened",
  "invitation_accepted",
  "preflight_completed",
  "call_joined",
  "call_completed",
  "recording_started",
  "recording_uploaded",
  "recording_materialized",
  "transcript_ready",
  "transcript_corrected",
  "share_created",
  "share_opened",
  "note_created",
  "task_created",
  "goal_created",
  "begin_checkout",
  "trial_started",
  "purchase",
] as const;

export type QuipslyProductEventName = typeof QUIPSLY_PRODUCT_EVENTS[number];

export const QUIPSLY_PRODUCT_EVENT_PARAMETERS = {
  surface: [
    "marketing",
    "sign_in",
    "coaching_home",
    "booking_page",
    "session_workspace",
    "native_handoff",
    "transcript_editor",
    "share_page",
    "billing",
    "unknown",
  ],
  workflow: ["coaching", "podcast", "content", "writing", "unknown"],
  client_kind: ["browser", "ios", "macos", "unknown"],
  participant_role: ["coach", "client", "guest", "unknown"],
  result: ["success", "cancelled", "failed"],
  method: ["google", "email", "apple", "link", "testflight", "unknown"],
  plan: ["monthly", "annual", "unknown"],
  provider: ["app_store", "stripe", "manual", "unknown"],
  content_type: ["note", "task", "goal", "transcript", "recording", "unknown"],
  recording_mode: ["local", "cloud", "hybrid", "unknown"],
} as const;

export type QuipslyProductEventParameters = Partial<{
  [Key in keyof typeof QUIPSLY_PRODUCT_EVENT_PARAMETERS]:
    typeof QUIPSLY_PRODUCT_EVENT_PARAMETERS[Key][number];
}> & {
  has_video?: boolean;
};

const productEventNames = new Set<string>(QUIPSLY_PRODUCT_EVENTS);

export function isQuipslyProductEventName(value: unknown): value is QuipslyProductEventName {
  return typeof value === "string" && productEventNames.has(value);
}

export function sanitizeProductEventParameters(value: unknown): QuipslyProductEventParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const sanitized: Record<string, string | boolean> = {};
  for (const [key, allowed] of Object.entries(QUIPSLY_PRODUCT_EVENT_PARAMETERS)) {
    const candidate = input[key];
    if (typeof candidate === "string" && (allowed as readonly string[]).includes(candidate)) {
      sanitized[key] = candidate;
    }
  }
  if (typeof input.has_video === "boolean") sanitized.has_video = input.has_video;
  return sanitized as QuipslyProductEventParameters;
}

const staticRoutes = new Set([
  "/",
  "/about",
  "/analytics",
  "/billing",
  "/coaching",
  "/coaching/sessions",
  "/login",
  "/pricing",
  "/projects",
  "/settings",
  "/support",
]);

export function privacySafeAnalyticsPath(pathname: string | null | undefined): string {
  const path = typeof pathname === "string" && pathname.startsWith("/")
    ? pathname.split("?", 1)[0].replace(/\/+$/, "") || "/"
    : "/unknown";
  if (staticRoutes.has(path)) return path;
  if (/^\/sessions\/[^/]+(?:\/.*)?$/.test(path)) return "/sessions/:session";
  if (/^\/nests\/[^/]+(?:\/.*)?$/.test(path)) return "/nests/:nest";
  if (/^\/projects\/[^/]+(?:\/.*)?$/.test(path)) return "/projects/:project";
  if (/^\/coaching\/book\/[^/]+(?:\/.*)?$/.test(path)) return "/coaching/book/:coach";
  if (/^\/share\/[^/]+(?:\/.*)?$/.test(path)) return "/share/:share";
  if (/^\/editor(?:\/.*)?$/.test(path)) return "/editor";

  const firstSegment = path.split("/").filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}/:other` : "/unknown";
}

export function analyticsSurfaceForPath(pathname: string | null | undefined) {
  const safePath = privacySafeAnalyticsPath(pathname);
  if (safePath.startsWith("/coaching/book/")) return "booking_page";
  if (safePath.startsWith("/coaching")) return "coaching_home";
  if (safePath.startsWith("/sessions")) return "session_workspace";
  if (safePath.startsWith("/share")) return "share_page";
  if (safePath === "/login") return "sign_in";
  if (["/", "/about", "/pricing"].includes(safePath)) return "marketing";
  return "unknown";
}
