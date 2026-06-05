import assert from "node:assert/strict";
import test from "node:test";

// Set up DATABASE_URL for local integration run
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/high_ground_studio";

// Import the access helper directly using its relative path.
// The ts-extension-loader handles loading the TS file.
import { requireProjectAccess } from "../apps/quipsly/src/lib/server/access.ts";

test("requireProjectAccess - development mode bypass", async () => {
  // Force development mode env
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  try {
    const result = await requireProjectAccess("quipsly-dev-lab", "write");

    assert.ok(result, "Should return a result object");
    assert.equal(result.user.id, "dev-user-id");
    assert.equal(result.user.primaryEmail, "dev@quipsly.com");
    assert.equal(result.membership.role, "OWNER");
    assert.ok(result.workspace, "Should resolve workspace");
    assert.ok(result.project, "Should resolve project");
    assert.ok(result.document, "Should resolve document");
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});

test("requireProjectAccess - production mode auth enforcement", async () => {
  // Force production mode env
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    // Should throw since there is no NextAuth session in the test context
    await assert.rejects(
      async () => {
        await requireProjectAccess("quipsly-dev-lab", "write");
      },
      /UNAUTHORIZED: Not signed in/
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
});
