export type CoachCohortRow = { email: string; name: string };

export function parseCoachCohortRows(raw: string):
  | { ok: true; rows: CoachCohortRow[] }
  | { ok: false; error: string } {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [emailPart, ...nameParts] = line.split(",");
      return {
        email: emailPart.trim().toLowerCase(),
        name: nameParts.join(",").trim().slice(0, 160),
      };
    });

  if (rows.length < 1 || rows.length > 100) {
    return { ok: false, error: "Enter between 1 and 100 coaches, one email or email,name pair per line." };
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (rows.some((row) => !emailPattern.test(row.email))) {
    return { ok: false, error: "Every cohort row needs a valid email address." };
  }
  if (new Set(rows.map((row) => row.email)).size !== rows.length) {
    return { ok: false, error: "Each coach email may appear only once in a cohort batch." };
  }
  return { ok: true, rows };
}
