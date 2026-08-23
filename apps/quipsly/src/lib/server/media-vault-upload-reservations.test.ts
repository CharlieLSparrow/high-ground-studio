import { mediaVaultTransactionRetryDelayMs } from "./media-vault-upload-reservations";

describe("media vault reservation transaction recovery", () => {
  it("backs off for transaction-start contention and serialization conflicts", () => {
    expect(mediaVaultTransactionRetryDelayMs({ code: "P2028" }, 0)).toBe(75);
    expect(mediaVaultTransactionRetryDelayMs({ code: "P2034" }, 1)).toBe(150);
    expect(mediaVaultTransactionRetryDelayMs({ code: "P2028" }, 3)).toBeNull();
    expect(mediaVaultTransactionRetryDelayMs({ code: "P2002" }, 0)).toBeNull();
  });
});
