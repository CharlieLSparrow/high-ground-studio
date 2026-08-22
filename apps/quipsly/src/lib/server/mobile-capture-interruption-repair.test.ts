import {
  MOBILE_CAPTURE_INTERRUPTION_REPAIR_CONTRACT,
  mobileCaptureInterruptionRepairRequired,
} from "./mobile-capture-interruption-repair";

describe("mobile capture interruption repair boundary", () => {
  it("requires repair for an interrupted browser source with an incomplete media tail", () => {
    expect(mobileCaptureInterruptionRepairRequired(JSON.stringify({
      interruptionRecovery: {
        contractKind: "quipsly-browser-source-interruption-recovery-v1",
        mediaTailMayBeIncomplete: true,
      },
    }))).toBe(true);
  });

  it("does not invent repair work for ordinary, malformed, or absent profiles", () => {
    expect(mobileCaptureInterruptionRepairRequired(null)).toBe(false);
    expect(mobileCaptureInterruptionRepairRequired("not-json")).toBe(false);
    expect(mobileCaptureInterruptionRepairRequired({ interruptionRecovery: {} })).toBe(false);
  });

  it("keeps the persisted repair state contract version explicit", () => {
    expect(MOBILE_CAPTURE_INTERRUPTION_REPAIR_CONTRACT).toBe(
      "quipsly-interruption-repair-state-v1",
    );
  });
});

