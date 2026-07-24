/** @jest-environment node */

import { GET as getCatalog } from "./route";
import { GET as getOutputDefinition } from "./[outputId]/route";
import { GET as getNestKindDefinitions } from "./nest-kind/[nestKind]/route";

describe("output catalog API truth boundary", () => {
  it("returns definition counts and explicit non-proof boundaries", async () => {
    const response = getCatalog();
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.definitionCount).toBeGreaterThan(0);
    expect(body).not.toHaveProperty("count");
    expect(body).not.toHaveProperty("statuses");
    expect(body.catalogBoundary).toMatchObject({
      kind: "quipsly-output-capability-roadmap-v1",
      provesPublication: false,
      provesServiceHealth: false,
    });
    expect(body.outputs.every((output: Record<string, unknown>) => (
      "catalogStage" in output && "roadmapHorizon" in output && !("status" in output)
    ))).toBe(true);
  });

  it("returns a capability plan whose inputs are explicitly not checked", async () => {
    const response = await getOutputDefinition(new Request("http://localhost/api/output-catalog/hgo-episode-page"), {
      params: Promise.resolve({ outputId: "hgo-episode-page" }),
    });
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("capabilityPlan");
    expect(body).not.toHaveProperty("readinessPlan");
    expect(body.capabilityPlan.requiredInputs.every((input: Record<string, unknown>) => (
      input.evidenceState === "not-checked"
    ))).toBe(true);
    expect(body.packetSkeleton.provenance.note).toMatch(/not a published artifact/i);
  });

  it("uses definition counts for Nest-kind catalog projections", async () => {
    const response = await getNestKindDefinitions(
      new Request("http://localhost/api/output-catalog/nest-kind/production"),
      { params: Promise.resolve({ nestKind: "production" }) },
    );
    const body = await response.json();

    expect(body.ok).toBe(true);
    expect(body.definitionCount).toBe(body.outputs.length);
    expect(body).not.toHaveProperty("count");
    expect(body.catalogBoundary.provesPersistedPacket).toBe(false);
  });
});
