import type { BrowserSourceKind } from "@high-ground/quipsly-domain";

const BROWSER_SOURCE_PREFERENCES_KEY =
  "quipsly-browser-source-preferences-v1";

export type BrowserSourcePreferences = {
  headphonesAttested?: boolean;
  coachingSourceType?: BrowserSourceKind;
  episodeSourceType?: BrowserSourceKind;
};

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function availableStorage(): PreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isSourceKind(value: unknown): value is BrowserSourceKind {
  return value === "audio" || value === "video";
}

export function readBrowserSourcePreferences(
  storage: PreferenceStorage | null = availableStorage(),
): BrowserSourcePreferences {
  if (!storage) return {};
  try {
    const raw = storage.getItem(BROWSER_SOURCE_PREFERENCES_KEY);
    if (!raw) return {};
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...(typeof candidate.headphonesAttested === "boolean"
        ? { headphonesAttested: candidate.headphonesAttested }
        : {}),
      ...(isSourceKind(candidate.coachingSourceType)
        ? { coachingSourceType: candidate.coachingSourceType }
        : {}),
      ...(isSourceKind(candidate.episodeSourceType)
        ? { episodeSourceType: candidate.episodeSourceType }
        : {}),
    };
  } catch {
    return {};
  }
}

export function writeBrowserSourcePreferences(
  patch: BrowserSourcePreferences,
  storage: PreferenceStorage | null = availableStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(
      BROWSER_SOURCE_PREFERENCES_KEY,
      JSON.stringify({ ...readBrowserSourcePreferences(storage), ...patch }),
    );
  } catch {
    // Browser privacy mode or storage pressure must not block recording.
  }
}

export function preferredBrowserSourceType(
  sessionKind: "coaching" | "episode",
  preferences: BrowserSourcePreferences,
): BrowserSourceKind {
  return sessionKind === "episode"
    ? preferences.episodeSourceType ?? "video"
    : preferences.coachingSourceType ?? "audio";
}

export function browserSourceTypeAfterConsentReadback({
  sessionKind,
  preferences,
  consentStatus,
  canRecordVideo,
}: {
  sessionKind: "coaching" | "episode";
  preferences: BrowserSourcePreferences;
  consentStatus?: string | null;
  canRecordVideo: boolean;
}): BrowserSourceKind {
  if (String(consentStatus || "").trim().toUpperCase() !== "GRANTED") {
    return preferredBrowserSourceType(sessionKind, preferences);
  }
  return canRecordVideo ? "video" : "audio";
}

export function browserTranscriptionChoiceAfterConsentReadback({
  consentStatus,
  canTranscribe,
}: {
  consentStatus?: string | null;
  canTranscribe: boolean;
}) {
  return String(consentStatus || "").trim().toUpperCase() === "GRANTED"
    ? canTranscribe
    : true;
}
