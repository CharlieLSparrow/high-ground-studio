import assert from "node:assert/strict";
import test from "node:test";
import { typescriptConfigForBuild, typecheckDistDirectory } from "./typescript-config.mjs";

test("typechecking does not rewrite the active dev or release output", () => {
  assert.equal(typecheckDistDirectory({}), ".next-typecheck");
  assert.equal(typecheckDistDirectory({QUIPSLY_BUILD_DIST_DIR: ".next-release"}), ".next-typecheck");
  assert.equal(typecheckDistDirectory({QUIPSLY_TYPECHECK_DIST_DIR: ".next-typecheck-ci"}), ".next-typecheck-ci");
  assert.deepEqual(typescriptConfigForBuild(typecheckDistDirectory({})).include.filter(entry => entry.startsWith(".next")),
    [".next-typecheck/types/**/*.ts", ".next-typecheck/dev/types/**/*.ts"]);
});

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
