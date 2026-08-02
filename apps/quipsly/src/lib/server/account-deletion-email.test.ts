/** @jest-environment node */

import { accountDeletionEmailConfiguration } from "./account-deletion-email";

describe("account deletion email configuration", () => {
  it("accepts the isolated verified sender contract without exposing the key", () => {
    const configuration = accountDeletionEmailConfiguration({
      QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY: "re_secret",
      QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM:
        "Quipsly <account@notify.quipsly.com>",
    });

    expect(configuration).toEqual({
      apiKeyConfigured: true,
      fromConfigured: true,
      fromValid: true,
      fromDomain: "notify.quipsly.com",
    });
    expect(JSON.stringify(configuration)).not.toContain("re_secret");
  });

  it("rejects malformed and newline-bearing sender values", () => {
    expect(
      accountDeletionEmailConfiguration({
        QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY: "re_secret",
        QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM:
          "Quipsly <account@notify.quipsly.com>\nBcc: attacker@example.test",
      }),
    ).toMatchObject({
      fromConfigured: true,
      fromValid: false,
      fromDomain: null,
    });
    expect(
      accountDeletionEmailConfiguration({
        QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY: "re_secret",
        QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM: "not-an-address",
      }),
    ).toMatchObject({
      fromConfigured: true,
      fromValid: false,
      fromDomain: null,
    });
  });

  it("does not inherit the generic site email configuration", () => {
    expect(
      accountDeletionEmailConfiguration({
        RESEND_API_KEY: "generic-key",
        HGO_EMAIL_FROM: "Generic <notifications@highgroundodyssey.com>",
      }),
    ).toEqual({
      apiKeyConfigured: false,
      fromConfigured: false,
      fromValid: false,
      fromDomain: null,
    });
  });
});
