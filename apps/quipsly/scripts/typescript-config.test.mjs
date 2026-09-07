import assert from "node:assert/strict";
import test from "node:test";
import { typescriptConfigForBuild } from "./typescript-config.mjs";

test("build lanes include only their own generated route validators", () => {
  for (const lane of [".next", ".next-release", ".next-recovery-lab"]) {
    const config = typescriptConfigForBuild(lane);
    assert.deepEqual(config.include.filter((entry) => entry.startsWith(".next")), [
      `${lane}/types/**/*.ts`, `${lane}/dev/types/**/*.ts`,
    ]);
    assert.equal(config.extends, "./tsconfig.json");
    assert.equal(config.compilerOptions.tsBuildInfoFile, `./${lane}/cache/typescript.tsbuildinfo`);
  }
});

test("output directory cannot escape the application", () => {
  for (const invalid of ["../outside", "/tmp/types", ".next/../../outside", ".next;echo"]) {
    assert.throws(() => typescriptConfigForBuild(invalid));
  }
});
