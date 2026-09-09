import { isSyntheticEmailRecipient } from "./synthetic-email-recipient";

describe("synthetic email delivery boundary", () => {
  it.each(["client@dev.test", " Client@Example.Test ", "client@team.private.test",
    "client@host.invalid", "client@mail.localhost", "client@quipsly.example",
    "client@example.com", "client@coaches.example.net", "client@EXAMPLE.ORG."])
  ("keeps %s away from external delivery", email => {
    expect(isSyntheticEmailRecipient(email)).toBe(true);
  });
  it.each(["client@quipsly.com", "client@example.test.com", "client@contest.com", "client@example.company"])
  ("does not classify %s by a substring", email => {
    expect(isSyntheticEmailRecipient(email)).toBe(false);
  });
});
