import {
  parseSessionEntryChoice,
  SESSION_ENTRY_CHOICE_EVENT_NAMES,
  summarizeSessionEntryChoiceEvents,
} from "./session-entry-choice";

describe("Session entry choice", () => {
  it("accepts only the three bounded product choices", () => {
    expect(parseSessionEntryChoice("browser")).toBe("BROWSER");
    expect(parseSessionEntryChoice(" CAPTURE_APP ")).toBe("CAPTURE_APP");
    expect(parseSessionEntryChoice("testflight")).toBe("TESTFLIGHT");
    expect(parseSessionEntryChoice("other-app")).toBeNull();
    expect(parseSessionEntryChoice({ choice: "BROWSER" })).toBeNull();
  });

  it("summarizes idempotent per-person Session events without inventing installs", () => {
    expect(
      summarizeSessionEntryChoiceEvents([
        {
          userId: "client-1",
          eventName: SESSION_ENTRY_CHOICE_EVENT_NAMES.BROWSER,
        },
        {
          userId: "client-2",
          eventName: SESSION_ENTRY_CHOICE_EVENT_NAMES.CAPTURE_APP,
        },
        {
          userId: "client-2",
          eventName: SESSION_ENTRY_CHOICE_EVENT_NAMES.TESTFLIGHT,
        },
      ]),
    ).toEqual({
      counts: { BROWSER: 1, CAPTURE_APP: 1, TESTFLIGHT: 1 },
      uniquePeople: 2,
    });
  });
});
