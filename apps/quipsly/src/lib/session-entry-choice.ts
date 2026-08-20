export const SESSION_ENTRY_CHOICE_SCHEMA =
  "quipsly-session-entry-choice-v1" as const;

export const SESSION_ENTRY_CHOICES = [
  "BROWSER",
  "CAPTURE_APP",
  "TESTFLIGHT",
] as const;

export type SessionEntryChoice = (typeof SESSION_ENTRY_CHOICES)[number];

export const SESSION_ENTRY_CHOICE_EVENT_NAMES: Record<
  SessionEntryChoice,
  string
> = {
  BROWSER: "Session Entry Selected: Browser",
  CAPTURE_APP: "Session Entry Selected: Capture App",
  TESTFLIGHT: "Session Entry Selected: TestFlight",
};

export function parseSessionEntryChoice(
  value: unknown,
): SessionEntryChoice | null {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";
  return SESSION_ENTRY_CHOICES.find((choice) => choice === normalized) ?? null;
}

export function summarizeSessionEntryChoiceEvents(
  rows: Array<{ userId: string; eventName: string }>,
) {
  const counts: Record<SessionEntryChoice, number> = {
    BROWSER: 0,
    CAPTURE_APP: 0,
    TESTFLIGHT: 0,
  };
  const people = new Set<string>();
  for (const row of rows) {
    const choice = SESSION_ENTRY_CHOICES.find(
      (candidate) => SESSION_ENTRY_CHOICE_EVENT_NAMES[candidate] === row.eventName,
    );
    if (!choice) continue;
    counts[choice] += 1;
    people.add(row.userId);
  }
  return { counts, uniquePeople: people.size };
}
