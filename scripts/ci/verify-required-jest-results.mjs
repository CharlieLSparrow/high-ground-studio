#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jest can exit successfully when integration suites opt out. Verify the
// selected files and individual assertions, not only aggregate success/counts.
export function verifyRequiredJestResults(report, root, suites) {
  if (!suites.length) throw new Error('No required suites were supplied.');
  const expected = suites.map((suite) => path.resolve(root, suite));
  if (new Set(expected).size !== expected.length) throw new Error('Duplicate required suite.');
  if (report?.success !== true || report.wasInterrupted !== false || !Array.isArray(report.testResults)) {
    throw new Error('Jest did not report a successful, uninterrupted run.');
  }
  if (report.testResults.length !== expected.length) throw new Error('Required suite inventory does not match results.');
  let assertions = 0;
  for (const file of expected) {
    const matches = report.testResults.filter((result) => result.name === file);
    const result = matches[0];
    if (matches.length !== 1 || result.status !== 'passed') {
      throw new Error(`Required suite did not pass exactly once: ${path.relative(root, file)}`);
    }
    if (!Array.isArray(result.assertionResults) || !result.assertionResults.length
      || result.assertionResults.some((assertion) => assertion.status !== 'passed')) {
      throw new Error(`Required suite contains missing, skipped, or failed tests: ${path.relative(root, file)}`);
    }
    assertions += result.assertionResults.length;
  }
  return { suites: expected.length, assertions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [reportPath, root, ...suites] = process.argv.slice(2);
    if (!reportPath || !root) throw new Error('Usage: verify-required-jest-results.mjs <report.json> <test-root> <suite...>');
    const result = verifyRequiredJestResults(JSON.parse(readFileSync(reportPath, 'utf8')), root, suites);
    console.log(`PASS Required Jest results: ${result.suites} suites, ${result.assertions} executed tests, no skips.`);
  } catch (error) {
    console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
