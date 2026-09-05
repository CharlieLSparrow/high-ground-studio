const MACHINE_PURPOSE_TITLES = new Set([
  "PERSONAL_NOTE",
  "FIELD_NOTE",
  "VOICE_NOTE",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function suggestedTitle(body: unknown) {
  const firstParagraph = typeof body === "string"
    ? body.split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim() ?? ""
    : "";
  const words = firstParagraph.split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  const candidate = words.slice(0, 10).join(" ")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "")
    .slice(0, 80);
  return candidate.length >= 8 ? candidate : null;
}

/**
 * Repairs an exact machine-purpose token from legacy Capture builds at the
 * presentation boundary. Ordinary titles remain untouched, including a human
 * title such as "Personal note". The canonical stored title can then converge
 * naturally on the user's next edit without a hidden database rewrite.
 */
export function presentVoiceWritingTitle(title: unknown, body: unknown) {
  const current = clean(title);
  if (!MACHINE_PURPOSE_TITLES.has(current.toUpperCase())) {
    return current || "Untitled";
  }
  return suggestedTitle(body) ?? "Voice note";
}
