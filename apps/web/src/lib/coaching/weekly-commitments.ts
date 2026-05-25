export const WEEKLY_COMMITMENTS_FEATURE_KEY = "weekly_commitments";

const MAX_COMMITMENT_LENGTH = 800;
const MAX_NOTES_LENGTH = 2000;

export type WeeklyCommitmentFormValues = {
  weekStartsAt: Date;
  commitmentOne: string;
  commitmentTwo: string | null;
  commitmentThree: string | null;
  supportNeeded: string | null;
  progressNotes: string | null;
};

function trimToLimit(value: string, limit: number) {
  const trimmed = value.trim();
  return trimmed.length > limit ? trimmed.slice(0, limit).trim() : trimmed;
}

export function parseDateInputAsUtcDay(rawValue: string, now = new Date()) {
  const value = rawValue.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match) {
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));

    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === monthIndex &&
      parsed.getUTCDate() === day
    ) {
      return parsed;
    }
  }

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function formatDateInputValue(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function parseWeeklyCommitmentFormValues(formData: FormData) {
  const commitmentOne = trimToLimit(
    String(formData.get("commitmentOne") ?? ""),
    MAX_COMMITMENT_LENGTH,
  );
  const commitmentTwo = trimToLimit(
    String(formData.get("commitmentTwo") ?? ""),
    MAX_COMMITMENT_LENGTH,
  );
  const commitmentThree = trimToLimit(
    String(formData.get("commitmentThree") ?? ""),
    MAX_COMMITMENT_LENGTH,
  );
  const supportNeeded = trimToLimit(
    String(formData.get("supportNeeded") ?? ""),
    MAX_NOTES_LENGTH,
  );
  const progressNotes = trimToLimit(
    String(formData.get("progressNotes") ?? ""),
    MAX_NOTES_LENGTH,
  );

  if (!commitmentOne) {
    throw new Error("Add at least one commitment.");
  }

  return {
    weekStartsAt: parseDateInputAsUtcDay(
      String(formData.get("weekStartsAt") ?? ""),
    ),
    commitmentOne,
    commitmentTwo: commitmentTwo || null,
    commitmentThree: commitmentThree || null,
    supportNeeded: supportNeeded || null,
    progressNotes: progressNotes || null,
  } satisfies WeeklyCommitmentFormValues;
}
