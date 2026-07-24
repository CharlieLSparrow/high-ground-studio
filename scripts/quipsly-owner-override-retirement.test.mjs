import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(repoRoot, "apps/quipsly/src");
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);

function listRuntimeSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRuntimeSourceFiles(absolutePath);
    if (!entry.isFile()) return [];
    if (!sourceExtensions.has(path.extname(entry.name))) return [];
    if (/\.(?:integration\.)?test\.[cm]?[jt]sx?$/.test(entry.name)) return [];
    return [absolutePath];
  });
}

test("the retired owner override cannot participate in Nest runtime authorization", () => {
  const offenders = listRuntimeSourceFiles(sourceRoot)
    .filter((filePath) => fs.readFileSync(filePath, "utf8").includes("QUIPSLY_OWNER_OVERRIDE"))
    .map((filePath) => path.relative(repoRoot, filePath));

  assert.deepEqual(
    offenders,
    [],
    `Remove QUIPSLY_OWNER_OVERRIDE from runtime source: ${offenders.join(", ")}`,
  );
});
