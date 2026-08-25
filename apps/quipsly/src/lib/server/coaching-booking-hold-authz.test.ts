import { canManageCoachingBookingHold } from "./coaching-booking-hold-authz";

describe("coaching booking hold authority", () => {
  it("lets the assigned coach manage the request", () => {
    expect(
      canManageCoachingBookingHold({
        actorUserId: "coach-1",
        actorIsStaff: false,
        assignedCoachUserId: "coach-1",
      }),
    ).toBe(true);
  });

  it("refuses another coach even when that actor has a coach profile", () => {
    expect(
      canManageCoachingBookingHold({
        actorUserId: "coach-2",
        actorIsStaff: false,
        assignedCoachUserId: "coach-1",
      }),
    ).toBe(false);
  });

  it("preserves the explicit staff recovery boundary", () => {
    expect(
      canManageCoachingBookingHold({
        actorUserId: "staff-1",
        actorIsStaff: true,
        assignedCoachUserId: "coach-1",
      }),
    ).toBe(true);
  });
});
