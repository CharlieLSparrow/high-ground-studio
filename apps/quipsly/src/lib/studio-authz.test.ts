import { canAccessQuipslyProduct, canAccessStudio } from "./studio-authz";

describe("Quipsly role boundaries", () => {
  it("lets coaches enter the product without turning them into global Studio staff", () => {
    expect(canAccessQuipslyProduct(["COACH"])).toBe(true);
    expect(canAccessStudio(["COACH"])).toBe(false);
  });

  it.each(["OWNER", "TEAM_SCHEDULER"] as const)(
    "keeps %s as explicit Studio staff authority",
    (role) => {
      expect(canAccessQuipslyProduct([role])).toBe(true);
      expect(canAccessStudio([role])).toBe(true);
    },
  );

  it("does not grant product or staff authority to an empty role set", () => {
    expect(canAccessQuipslyProduct([])).toBe(false);
    expect(canAccessStudio([])).toBe(false);
  });
});
