export const MOBILE_CAPTURE_SESSION_PURPOSES = [
  "COACHING",
  "PODCAST",
  "RESEARCH_INTERVIEW",
  "INTERNAL_MEETING",
  "PERSONAL_NOTE",
] as const;

export type MobileCaptureSessionPurpose = typeof MOBILE_CAPTURE_SESSION_PURPOSES[number];

const PURPOSE_ALIASES: Readonly<Record<string, MobileCaptureSessionPurpose>> = {
  FIELD_NOTE: "PERSONAL_NOTE",
  VOICE_NOTE: "PERSONAL_NOTE",
};

export function parseMobileCaptureSessionPurpose(value: unknown): MobileCaptureSessionPurpose | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[-\s]+/g, "_");
  const aliased = PURPOSE_ALIASES[normalized] ?? normalized;
  return (MOBILE_CAPTURE_SESSION_PURPOSES as readonly string[]).includes(aliased)
    ? aliased as MobileCaptureSessionPurpose
    : null;
}

export function fallbackTitleForMobileCapturePurpose(purpose: MobileCaptureSessionPurpose) {
  if (purpose === "PODCAST") return "Podcast capture session";
  if (purpose === "RESEARCH_INTERVIEW") return "Research interview capture session";
  if (purpose === "INTERNAL_MEETING") return "Quipsly meeting capture";
  if (purpose === "PERSONAL_NOTE") return "Voice note";
  return "Coaching capture session";
}
