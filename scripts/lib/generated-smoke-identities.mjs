// Pure identity classification. Importing these helpers must never initialize
// database/cloud clients or load the executable cleanup command.
export function isGeneratedSmokeEmail(email) {
  return /^codex-(invite|signup|admin|native|mobile-capture)-[a-f0-9]{8}@dev\.test$/i.test(
    String(email || "").trim(),
  );
}

export function redactEmailList(emails) {
  return emails.map((email) =>
    email.replace(
      /^codex-(invite|signup|admin|native|mobile-capture)-([a-f0-9]{4})[a-f0-9]{4}/i,
      "codex-$1-$2****",
    ),
  );
}
