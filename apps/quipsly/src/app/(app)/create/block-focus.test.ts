import { resolveInitialFocusBlockId } from "./block-focus";

describe("writing deep-link block focus", () => {
  const blocks = [{ id: "block-one" }, { id: "block-two" }];

  it("returns only an exact block identity from the loaded canonical document", () => {
    expect(resolveInitialFocusBlockId(blocks, "block-two")).toBe("block-two");
    expect(resolveInitialFocusBlockId(blocks, "block")).toBeUndefined();
    expect(resolveInitialFocusBlockId(blocks, "foreign-block")).toBeUndefined();
  });

  it("ignores absent and non-string query values", () => {
    expect(resolveInitialFocusBlockId(blocks, undefined)).toBeUndefined();
    expect(resolveInitialFocusBlockId(blocks, ["block-one"])).toBeUndefined();
  });
});
