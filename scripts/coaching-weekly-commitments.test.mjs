import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDateInputValue,
  parseDateInputAsUtcDay,
  parseWeeklyCommitmentFormValues,
  WEEKLY_COMMITMENTS_FEATURE_KEY,
} from "../apps/web/src/lib/coaching/weekly-commitments.ts";

test("uses the stable weekly commitments feature key", () => {
  assert.equal(WEEKLY_COMMITMENTS_FEATURE_KEY, "weekly_commitments");
});

test("parses date inputs as UTC day keys", () => {
  const parsed = parseDateInputAsUtcDay("2026-05-25");

  assert.equal(parsed.toISOString(), "2026-05-25T00:00:00.000Z");
  assert.equal(formatDateInputValue(parsed), "2026-05-25");
});

test("falls back to the current UTC day for invalid date input", () => {
  const parsed = parseDateInputAsUtcDay(
    "not-a-date",
    new Date("2026-05-25T18:45:00.000Z"),
  );

  assert.equal(parsed.toISOString(), "2026-05-25T00:00:00.000Z");
});

test("parses and trims weekly commitment form values", () => {
  const formData = new FormData();
  formData.set("weekStartsAt", "2026-05-25");
  formData.set("commitmentOne", "  Draft the weekly plan  ");
  formData.set("commitmentTwo", " ");
  formData.set("commitmentThree", "Ask for feedback");
  formData.set("supportNeeded", "  Accountability check-in  ");
  formData.set("progressNotes", "");

  const values = parseWeeklyCommitmentFormValues(formData);

  assert.equal(values.weekStartsAt.toISOString(), "2026-05-25T00:00:00.000Z");
  assert.equal(values.commitmentOne, "Draft the weekly plan");
  assert.equal(values.commitmentTwo, null);
  assert.equal(values.commitmentThree, "Ask for feedback");
  assert.equal(values.supportNeeded, "Accountability check-in");
  assert.equal(values.progressNotes, null);
});

test("requires at least one weekly commitment", () => {
  const formData = new FormData();
  formData.set("weekStartsAt", "2026-05-25");
  formData.set("commitmentOne", " ");

  assert.throws(
    () => parseWeeklyCommitmentFormValues(formData),
    /Add at least one commitment/,
  );
});
