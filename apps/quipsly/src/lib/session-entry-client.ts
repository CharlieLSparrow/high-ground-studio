import type { SessionEntryChoice } from "./session-entry-choice";

const PREFERENCE_KEY = "quipsly.session-entry-preference.v1";

export function savedSessionEntry(): "BROWSER" | "CAPTURE_APP" | null {
  try {
    const value = window.localStorage.getItem(PREFERENCE_KEY);
    return value === "BROWSER" || value === "CAPTURE_APP" ? value : null;
  } catch {
    return null;
  }
}

export function clearSessionEntry() {
  try { window.localStorage.removeItem(PREFERENCE_KEY); } catch { /* Storage is optional. */ }
}

/** Preferences and analytics must never prevent someone from entering a call. */
export function selectSessionEntry(roomId: string, choice: SessionEntryChoice) {
  if (choice !== "TESTFLIGHT") {
    try { window.localStorage.setItem(PREFERENCE_KEY, choice); } catch { /* Storage is optional. */ }
  }
  try {
    void fetch(`/api/sessions/${encodeURIComponent(roomId)}/entry-choice`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => undefined);
  } catch { /* Analytics is best effort, including restricted webviews. */ }
}
