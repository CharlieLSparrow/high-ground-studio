import {
  ACCOUNT_DELETION_POLICY,
  accountDeletionTargetAt,
  projectAccountDeletionRequest,
} from "./account-deletion-policy";

describe("account deletion policy", () => {
  it("publishes one stable 30-day target", () => {
    expect(ACCOUNT_DELETION_POLICY.targetDays).toBe(30);
    expect(
      accountDeletionTargetAt("2026-07-24T12:00:00.000Z").toISOString(),
    ).toBe("2026-08-23T12:00:00.000Z");
  });

  it("keeps completed requests terminal and confirmation-oriented", () => {
    expect(
      projectAccountDeletionRequest({
        id: "request-1",
        status: "COMPLETED",
        requestedAt: "2026-07-01T12:00:00.000Z",
        completedAt: "2026-07-10T12:00:00.000Z",
      }),
    ).toMatchObject({
      status: "COMPLETED",
      statusLabel: "Deletion completed",
      active: false,
      completedAt: new Date("2026-07-10T12:00:00.000Z"),
    });
  });
});
