#!/usr/bin/env node

import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const javaBinCandidates = [
  process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin") : undefined,
  "/opt/homebrew/opt/openjdk/bin",
  "/usr/local/opt/openjdk/bin",
].filter(Boolean);

const extraPathEntries = [];

for (const javaBin of javaBinCandidates) {
  try {
    await access(path.join(javaBin, "java"));
    extraPathEntries.push(javaBin);
    break;
  } catch {
    // Continue looking; macOS may have only the wrapper until Homebrew OpenJDK
    // is added to PATH.
  }
}

const env = {
  ...process.env,
  PATH: [...extraPathEntries, process.env.PATH ?? ""].join(path.delimiter),
};

const args = [
  "emulators:exec",
  "--project",
  "demo-studio-cut-rules",
  "--only",
  "firestore,storage",
  "node --test scripts/studio-cut-rules.test.mjs",
];

console.log("Studio Cut Firebase rules emulator test");
console.log(`firebase ${args.join(" ")}`);

if (extraPathEntries.length > 0) {
  console.log(`Using Java from ${extraPathEntries[0]}`);
}

const child = spawn("firebase", args, {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start Firebase Emulator Suite: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code, signal) => {
  if (signal) {
    console.error(`Firebase Emulator Suite exited via ${signal}`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
