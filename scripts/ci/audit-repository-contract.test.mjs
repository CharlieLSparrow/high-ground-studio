#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  markdownLocalTargets,
  validateActionPins,
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

test("requires external Actions to use immutable commit SHAs", () => {
  assert.deepEqual(
    validateActionPins(
      ".github/workflows/test.yml",
      [
        "steps:",
        "  - uses: actions/checkout@v7",
        "  - uses: docker://alpine:3.22",
        "  - uses: ./local-action",
      ].join("\n"),
    ),
    [
      ".github/workflows/test.yml: action must be pinned to a full commit SHA: actions/checkout@v7",
    ],
  );
});

test("accepts immutable Action pins with readable version comments", () => {
  assert.deepEqual(
    validateActionPins(
      ".github/workflows/test.yml",
      "  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    ),
    [],
  );
});
