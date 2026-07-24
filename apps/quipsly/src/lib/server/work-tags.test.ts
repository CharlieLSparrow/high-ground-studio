/** @jest-environment node */

jest.mock("./home-nest", () => ({ listProjectsVisibleToEmail: jest.fn() }));

import { normalizeWorkTagLabel, workTagSlug } from "./work-tag-normalization";

describe("work tag identity", () => {
  it("normalizes deliberate user labels without storing UI hash syntax", () => {
    expect(normalizeWorkTagLabel("  ##  Product   development  ")).toBe("Product development");
    expect(workTagSlug("Product development")).toBe("product-development");
  });

  it("keeps readable ampersand vocabulary deterministic", () => {
    expect(workTagSlug("Research & Writing")).toBe("research-and-writing");
  });

  it("gives non-Latin labels a deterministic stable identity", () => {
    expect(workTagSlug("研究")).toMatch(/^tag-[0-9a-f]{12}$/);
    expect(workTagSlug("研究")).toBe(workTagSlug("研究"));
  });

  it("rejects empty, control-only, and oversized labels", () => {
    expect(normalizeWorkTagLabel("###   ")).toBe("");
    expect(normalizeWorkTagLabel("\u0000\u0007")).toBe("");
    expect(normalizeWorkTagLabel("x".repeat(81))).toBe("");
  });
});
