#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const pythonCommand = process.env.PYTHON ?? "python";

const verificationSteps = [
  {
    label: "Python compile",
    command: pythonCommand,
    args: ["-m", "py_compile", "tools/studio-cut-local/studio_cut_local.py"],
  },
  {
    label: "Agent smoke test",
    command: pythonCommand,
    args: [
      "tools/studio-cut-local/studio_cut_local.py",
      "agent-smoke-test",
      "--json",
    ],
    parseAgentSmokeJson: true,
  },
  {
    label: "Studio Cut typecheck",
    command: "pnpm",
    args: ["studio-cut:typecheck"],
  },
  {
    label: "Studio Cut build",
    command: "pnpm",
    args: ["studio-cut:build"],
  },
];

function formatCommand(command, args) {
  return [command, ...args].join(" ");
}

function runStep(step) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${step.label}`);
    console.log(formatCommand(step.command, step.args));

    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      reject(new Error(`${step.label} could not start: ${error.message}`));
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${step.label} failed with ${reason}`));
    });
  });
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function summarizeAgentSmoke(report) {
  if (!report) {
    console.log("\nAgent smoke summary: JSON report was not parsed; command exit was successful.");
    return;
  }

  const resolution = report.actualOutputResolution
    ? `${report.actualOutputResolution.width}x${report.actualOutputResolution.height}`
    : "unavailable";

  console.log("\nAgent smoke summary");
  console.log(`  status: ${report.status ?? "unknown"}`);
  console.log(
    `  goldenAssertionsPassed: ${String(report.goldenAssertionsPassed)}`,
  );
  console.log(`  goldenAssertionCount: ${report.goldenAssertionCount ?? "unknown"}`);
  console.log(
    `  actualOutputDurationMs: ${report.actualOutputDurationMs ?? "unavailable"}`,
  );
  console.log(`  actualOutputResolution: ${resolution}`);

  if (report.status && report.status !== "pass") {
    throw new Error(`Agent smoke JSON reported status=${report.status}`);
  }

  if (report.goldenAssertionsPassed === false) {
    throw new Error("Agent smoke JSON reported failed golden assertions");
  }
}

async function main() {
  console.log("Studio Cut verification");
  console.log("=======================");

  for (const step of verificationSteps) {
    const result = await runStep(step);

    if (step.parseAgentSmokeJson) {
      summarizeAgentSmoke(parseJsonFromOutput(result.stdout));
    }
  }

  console.log("\nStudio Cut verification passed.");
  console.log("Completed checks:");

  for (const step of verificationSteps) {
    console.log(`  - ${step.label}`);
  }
}

main().catch((error) => {
  console.error(`\nStudio Cut verification failed: ${error.message}`);
  process.exitCode = 1;
});
