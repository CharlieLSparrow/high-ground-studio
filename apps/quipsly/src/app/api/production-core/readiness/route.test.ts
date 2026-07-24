/** @jest-environment node */

import { getProductionCoreReadinessSafe } from "@/lib/server/production-core-readiness";

import { GET } from "./route";

jest.mock("@/lib/server/production-core-readiness", () => ({ getProductionCoreReadinessSafe: jest.fn() }));

describe("production core readiness API", () => {
  it("keeps the checklist while redacting private database diagnostics", async () => {
    jest.mocked(getProductionCoreReadinessSafe).mockResolvedValue({
      ok: false,
      status: "error",
      generatedAt: "2026-07-18T20:00:00.000Z",
      requiredTableCount: 17,
      presentTableCount: 0,
      missingTables: ["Goal", "GoalTaskLink", "GoalProgressReceipt"],
      groups: [{ id: "goals-follow-through", label: "Goals and follow-through", status: "needs-schema-sync", missingTables: ["Goal", "GoalTaskLink", "GoalProgressReceipt"] }],
      nextStep: "Check DATABASE_URL.",
      error: "postgresql://private-user:private-password@private-host/database",
    });

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body).toMatchObject({ requiredTableCount: 17, missingTables: ["Goal", "GoalTaskLink", "GoalProgressReceipt"], error: "Production core schema query is unavailable." });
    expect(JSON.stringify(body)).not.toContain("private-password");
  });
});
