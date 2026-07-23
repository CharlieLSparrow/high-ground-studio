"use server";

const legacyConnectionUnavailable = {
  ok: false,
  errorCode: "LEGACY_PUBLISHING_SUITE_RETIRED",
  error: "Legacy channel connections are disabled. No provider authorization was started.",
} as const;

export async function connectTwitterAction() {
  return legacyConnectionUnavailable;
}

export async function connectYouTubeAction() {
  return legacyConnectionUnavailable;
}
