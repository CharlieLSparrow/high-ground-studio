import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const productSurfaceRoots = [
  "apps/quipsly/src/app/(app)/coaching",
  "apps/quipsly/src/app/(app)/sessions",
  "apps/quipsly/src/app/api/coaching",
  "apps/quipsly/src/app/api/mobile/capture",
];

const additionalProductSurfaces = [
  "apps/quipsly/src/components/capture-app-handoff.tsx",
];

const reservedFixturePatterns = [
  /@dev\.test/i,
  /retained-coaching/i,
  /qa-retained/i,
  /codex-coaching/i,
  /episode\s*9/i,
  /shomers@/i,
  /charlielsparrow@/i,
];

async function sourceFilesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await sourceFilesUnder(path)));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name)
      && !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(path);
    }
  }
  return files;
}

test("ordinary coaching surfaces stay independent of retained people and fixtures", async () => {
  const productSurfaces = [
    ...additionalProductSurfaces,
    ...(await Promise.all(productSurfaceRoots.map(sourceFilesUnder))).flat(),
  ];
  for (const file of productSurfaces) {
    const source = await readFile(file, "utf8");
    for (const pattern of reservedFixturePatterns) {
      assert.doesNotMatch(
        source,
        pattern,
        `${file} must discover the signed-in user's data instead of depending on ${pattern}.`,
      );
    }
  }
});

test("Capture preview data is compile-time unavailable in release builds", async () => {
  const launchConfiguration = await readFile(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift",
    "utf8",
  );
  assert.match(
    launchConfiguration,
    /static var usesPreviewData: Bool \{\s*#if DEBUG\s*ProcessInfo\.processInfo\.arguments\.contains\("--capture-ui-preview"\)\s*#else\s*false\s*#endif\s*\}/,
  );
  assert.match(
    launchConfiguration,
    /static var usesLoginPreview: Bool \{\s*#if DEBUG\s*ProcessInfo\.processInfo\.arguments\.contains\("--capture-login-ui-preview"\)\s*#else\s*false\s*#endif\s*\}/,
  );

  const localLibrary = await readFile(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/LocalRecordingLibrary.swift",
    "utf8",
  );
  assert.match(
    localLibrary,
    /#if DEBUG\s*\/\/\/ Installs one exact, checksum-verified source file/,
  );
  assert.match(
    localLibrary,
    /process\.arguments\.contains\("--quipsly-capture-runtime-smoke"\)[\s\S]*process\.arguments\.contains\("--quipsly-capture-runtime-playback-fixture"\)/,
  );
});
