import { coachingSetupPaymentPolicy } from "./coaching-setup";

describe("coachingSetupPaymentPolicy", () => {
  it("lets a new coach start without configuring billing", () => {
    expect(coachingSetupPaymentPolicy(null)).toBe("MANUAL");
    expect(coachingSetupPaymentPolicy(0)).toBe("MANUAL");
  });

  it("prepares paid one-to-one coaching only when the coach enters a price", () => {
    expect(coachingSetupPaymentPolicy(15_000)).toBe("PAID_ONE_TO_ONE");
  });
});
