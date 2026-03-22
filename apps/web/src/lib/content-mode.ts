export const CONTENT_MODE_COOKIE = "hgo_mode";

export const ALL_CONTENT_MODES = [
  "public",
  "editor",
  "charlie",
  "skippy",
] as const;

export type ContentMode = (typeof ALL_CONTENT_MODES)[number];

export type ContentAccess = "public" | "team" | "private" | "members";

type CookieStoreLike = {
  get(name: string): { value: string } | undefined;
};

export function normalizeContentMode(value?: string | null): ContentMode {
  switch ((value ?? "").toLowerCase()) {
    case "editor":
      return "editor";
    case "charlie":
      return "charlie";
    case "skippy":
      return "skippy";
    default:
      return "public";
  }
}

export function formatContentModeLabel(mode: ContentMode): string {
  switch (mode) {
    case "editor":
      return "Editor Mode";
    case "charlie":
      return "Charlie Mode";
    case "skippy":
      return "Skippy Mode";
    default:
      return "Public View";
  }
}

export function getModeFromCookieStore(cookieStore: CookieStoreLike): ContentMode {
  const cookieValue = cookieStore.get(CONTENT_MODE_COOKIE)?.value;
  return normalizeContentMode(cookieValue);
}

export function getAllowedModes(isTeam: boolean): ContentMode[] {
  return isTeam ? [...ALL_CONTENT_MODES] : ["public"];
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeAccess(access?: string): ContentAccess {
  const value = access?.toLowerCase();

  if (value === "team") return "team";
  if (value === "private") return "private";
  if (value === "members") return "members";

  return "public";
}

function normalizeStatus(status?: string): string {
  return (status ?? "published").toLowerCase();
}

export function isContentVisibleInMode({
  mode,
  isTeam,
  access,
  status,
  views,
}: {
  mode: ContentMode;
  isTeam: boolean;
  access?: string;
  status?: string;
  views?: string[];
}): boolean {
  const normalizedAccess = normalizeAccess(access);
  const normalizedStatus = normalizeStatus(status);
  const normalizedViews = (views ?? []).map((view) => view.toLowerCase());

  const isPublicPublished =
    normalizedAccess === "public" && normalizedStatus === "published";

  if (!isTeam) {
    return isPublicPublished;
  }

  if (mode === "skippy") {
    return true;
  }

  if (mode === "public") {
    return isPublicPublished;
  }

  if (mode === "editor") {
    return (
      isPublicPublished ||
      normalizedAccess !== "public" ||
      ["draft", "editing", "ready", "scheduled"].includes(normalizedStatus) ||
      normalizedViews.includes("editor")
    );
  }

  if (mode === "charlie") {
    return (
      isPublicPublished ||
      normalizedViews.includes("charlie") ||
      normalizedViews.includes("editor")
    );
  }

  return isPublicPublished;
}