import { coachingHoldDetails } from "./coaching-hold";

describe("held time and client requests", () => {
  it("keeps a coach's title without turning their reservation into a client request", () => {
    expect(coachingHoldDetails({ metadataJson: { source: "quipsly-coaching-runway", title: " Planning together " } }))
      .toEqual({ isClientRequest: false, title: "Planning together" });
  });
  it("recognizes actual client self-scheduling", () => {
    expect(coachingHoldDetails({ metadataJson: { source: "quipsly-client-self-scheduling" }, offering: { title: "Coaching" } }))
      .toEqual({ isClientRequest: true, title: "Coaching" });
  });
  it.each([undefined, null, [], "invalid", {}])("does not invent client intent from %p", (metadataJson) => {
    expect(coachingHoldDetails({ metadataJson })).toEqual({ isClientRequest: false, title: null });
  });
});
