import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const quipslyConfig = readFileSync("apps/quipsly/next.config.mjs", "utf8");
const webConfig = readFileSync("apps/web/next.config.mjs", "utf8");
const releaseGate = readFileSync("scripts/hgo-quipsly-release-readiness.mjs", "utf8");
const quipslyTypeScript = JSON.parse(readFileSync("apps/quipsly/tsconfig.json", "utf8"));
const webTypeScript = JSON.parse(readFileSync("apps/web/tsconfig.json", "utf8"));

test("release builds use isolated Next output directories", () => {
  assert.match(
    quipslyConfig,
    /const buildDistDir = process\.env\.QUIPSLY_BUILD_DIST_DIR \|\| "\.next";/,
  );
  assert.match(
    webConfig,
    /const buildDistDir = process\.env\.WEB_BUILD_DIST_DIR \|\| "\.next";/,
  );
  assert.match(releaseGate, /QUIPSLY_BUILD_DIST_DIR: "\.next-release"/);
  assert.match(releaseGate, /WEB_BUILD_DIST_DIR: "\.next-release"/);
  assert.doesNotMatch(releaseGate, /cleanPaths: \["apps\/(?:quipsly|web)\/\.next"\]/);
});

test("build output overrides stay confined to project-local generated directories", () => {
  assert.match(quipslyConfig, /\^\\\.next\(\?:-\[a-z0-9\]\+\)\*\$/);
  assert.match(webConfig, /\^\\\.next\(\?:-\[a-z0-9\]\+\)\*\$/);
});

test("TypeScript includes both developer and isolated release route types", () => {
  for (const config of [quipslyTypeScript, webTypeScript]) {
    assert.ok(config.include.includes(".next/types/**/*.ts"));
    assert.ok(config.include.includes(".next/dev/types/**/*.ts"));
    assert.ok(config.include.includes(".next-release/types/**/*.ts"));
    assert.ok(config.include.includes(".next-release/dev/types/**/*.ts"));
  }
});
