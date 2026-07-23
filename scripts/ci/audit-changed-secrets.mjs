#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_PATTERNS = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  },
  {
    name: "OpenAI API key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "Stripe live key",
    pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
];

function argumentValue(args, name) {
  const prefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function gitDiff(base, head) {
  const result = spawnSync(
    "git",
    ["diff", "--no-color", "--unified=0", base, head, "--"],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git diff failed for ${base}..${head}`);
  }
  return result.stdout;
}

export function scanAddedSecretPatterns(diff) {
  const findings = [];
  let filePath = "";
  let nextLine = 0;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      filePath = line.slice(6);
      continue;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      nextLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const value = line.slice(1);
      for (const secretPattern of SECRET_PATTERNS) {
        if (secretPattern.pattern.test(value)) {
          findings.push({
            filePath: filePath || "unknown",
            line: nextLine,
            kind: secretPattern.name,
          });
        }
      }
      nextLine += 1;
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      nextLine += 1;
    }
  }

  return findings;
}

function runCli() {
  const args = process.argv.slice(2);
  const base = argumentValue(args, "--base");
  const head = argumentValue(args, "--head");
  if (!base || !head) throw new Error("Supply --base and --head.");

  const findings = scanAddedSecretPatterns(gitDiff(base, head));
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`FAIL potential ${finding.kind} added at ${finding.filePath}:${finding.line}`);
    }
    console.error("Remove and rotate real credentials before pushing. Do not add the value to an allowlist.");
    process.exitCode = 1;
    return;
  }

  console.log("PASS no high-confidence secret patterns were added.");
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
