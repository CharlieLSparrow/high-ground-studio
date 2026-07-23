#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  markdownLocalTargets,
  validateMarkdownLinks,
} from "./audit-repository-contract.mjs";

test("extracts local Markdown targets and ignores URLs and anchors", () => {
  assert.deepEqual(
    markdownLocalTargets([
      "[local](docs/README.md)",
      "[section](#start)",
      "[web](https://example.com)",
      "![image](assets/icon.png)",
    ].join("\n")),
    ["docs/README.md", "assets/icon.png"],
  );
});

test("accepts local files resolved relative to the document", () => {
  const existing = new Set([
    "/repo/docs/guide.md",
    "/repo/README.md",
  ]);
  const errors = validateMarkdownLinks({
    root: "/repo",
    documentPath: "docs/guide.md",
    markdown: "[root](../README.md)",
    fileExists: (candidate) => existing.has(candidate),
  });

  assert.deepEqual(errors, []);
});

test("reports a missing local target with its owning document", () => {
  const errors = validateMarkdownLinks({
    root: "/repo",
    documentPath: "docs/guide.md",
    markdown: "[missing](nope.md)",
    fileExists: () => false,
  });

  assert.deepEqual(errors, [
    "docs/guide.md: missing local link target nope.md",
  ]);
});

test("supports repository-root Markdown paths", () => {
  const errors = validateMarkdownLinks({
    root: "/repo",
    documentPath: "docs/guide.md",
    markdown: "[security](/SECURITY.md)",
    fileExists: (candidate) => candidate === "/repo/SECURITY.md",
  });

  assert.deepEqual(errors, []);
});
