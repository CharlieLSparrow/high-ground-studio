import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../apps/quipsly/src/lib/server/access.ts", import.meta.url), "utf8");

test("project access is fail-closed in every environment", () => {
  assert.match(source, /if \(!session\?\.user\?\.id\)\s*\{\s*throw new Error\("UNAUTHORIZED: Not signed in"\)/);
  assert.doesNotMatch(source, /dev-user-id|Dev Local Owner|NODE_ENV\s*===\s*["']development["']/);
});

test("authentication happens before project database access", () => {
  const authIndex = source.indexOf("const session = await auth()");
  const denialIndex = source.indexOf('throw new Error("UNAUTHORIZED: Not signed in")');
  const prismaIndex = source.indexOf("const prisma = getPrismaClient()");
  assert.ok(authIndex >= 0 && denialIndex > authIndex && prismaIndex > denialIndex);
});
