import { parseCoachCohortRows } from "./user-management-cohort";

describe("parseCoachCohortRows", () => {
  it("normalizes a real coach cohort before any records change", () => {
    expect(parseCoachCohortRows(" Coach.One@Example.com,Coach One\ncoach.two@example.com ")).toEqual({
      ok: true,
      rows: [
        { email: "coach.one@example.com", name: "Coach One" },
        { email: "coach.two@example.com", name: "" },
      ],
    });
  });

  it("rejects duplicates after normalization", () => {
    expect(parseCoachCohortRows("coach@example.com\nCOACH@example.com")).toEqual({
      ok: false,
      error: "Each coach email may appear only once in a cohort batch.",
    });
  });

  it("rejects malformed and oversized batches", () => {
    expect(parseCoachCohortRows("not-an-email")).toEqual({
      ok: false,
      error: "Every cohort row needs a valid email address.",
    });
    expect(parseCoachCohortRows(Array.from({ length: 101 }, (_, index) => `coach${index}@example.com`).join("\n"))).toEqual({
      ok: false,
      error: "Enter between 1 and 100 coaches, one email or email,name pair per line.",
    });
  });
});
