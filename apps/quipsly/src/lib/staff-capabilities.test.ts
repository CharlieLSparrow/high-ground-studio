import { ALL_STAFF_CAPABILITIES, staffCapabilitiesForRoles } from "./staff-capabilities";

describe("staff capability policy", () => {
  it("gives platform owners every back-office capability", () => {
    expect(staffCapabilitiesForRoles(["OWNER"])).toEqual(ALL_STAFF_CAPABILITIES);
  });

  it("keeps support and product analytics least-privileged", () => {
    expect(staffCapabilitiesForRoles(["SUPPORT_AGENT"])).toEqual(["SUPPORT_OPERATIONS"]);
    expect(staffCapabilitiesForRoles(["PRODUCT_ANALYST"])).toEqual(["PRODUCT_ANALYTICS"]);
    expect(staffCapabilitiesForRoles(["SUPPORT_AGENT", "PRODUCT_ANALYST"])).toEqual([
      "SUPPORT_OPERATIONS",
      "PRODUCT_ANALYTICS",
    ]);
  });

  it("does not turn customer product roles into staff authority", () => {
    expect(staffCapabilitiesForRoles(["COACH", "CLIENT", "TEAM_SCHEDULER", "NETWORK_PASS"])).toEqual([]);
  });
});
