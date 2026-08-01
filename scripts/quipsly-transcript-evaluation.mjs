#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildTranscriptEvaluationReport,
  parseTranscriptEvaluationCorpus,
} from "../packages/quipsly-media-processing/src/transcript-evaluation.ts";

const options = parseArguments(process.argv.slice(2));
const inputPath = resolve(options.input);
const input = JSON.parse(await readFile(inputPath, "utf8"));
const corpus = parseTranscriptEvaluationCorpus(input);
const report = buildTranscriptEvaluationReport(
  corpus,
  options.generatedAt ?? new Date().toISOString(),
);
const serialized = `${JSON.stringify(report, null, 2)}\n`;

if (options.stdout) {
  process.stdout.write(serialized);
} else {
  const outputPath = resolve(options.output);
  await writeFile(outputPath, serialized, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${outputPath}\n`);
}

function parseArguments(argumentsList) {
  const parsed = {
    input: "",
    output: "",
    stdout: false,
    generatedAt: null,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--") continue;
    if (argument === "--input") parsed.input = argumentsList[++index] ?? "";
    else if (argument === "--output") parsed.output = argumentsList[++index] ?? "";
    else if (argument === "--generated-at") parsed.generatedAt = argumentsList[++index] ?? "";
    else if (argument === "--stdout") parsed.stdout = true;
    else if (argument === "--help" || argument === "-h") {
      process.stdout.write([
        "Usage:",
        "  pnpm quipsly:transcript:evaluate --input PRIVATE_CORPUS.json --output REPORT.json",
        "  pnpm quipsly:transcript:evaluate --input PRIVATE_CORPUS.json --stdout",
        "",
        "The output path is create-only. The aggregate report omits transcript text,",
        "speaker/reviewer identities, policy URLs, and source paths.",
        "",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown transcript evaluation option: ${argument}`);
    }
  }
  if (!parsed.input) throw new Error("--input is required.");
  if (parsed.stdout === Boolean(parsed.output)) {
    throw new Error("Choose exactly one of --output or --stdout.");
  }
  return parsed;
}
