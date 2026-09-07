import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptDir = fileURLToPath(new URL('.', import.meta.url));
const script = readFileSync(new URL('./run-capture-runtime-ui-smoke.sh', import.meta.url), 'utf8');
const boundary = 'cleanup_smoke_credentials\ntrap - EXIT\n';
assert.equal(script.split(boundary).length, 2, 'Expected one result-verification boundary');
const verification = script.split(boundary)[1];
const expectedClass = 'CaptureRoomRuntimeSmokeTests';
const expectedCase = 'testSignedInCaptureRoomSurfacesAreVisible';
const goodCase = {
  nodeType: 'Test Case',
  nodeIdentifier: `${expectedClass}/${expectedCase}()`,
  result: 'Passed',
};
const goodSummary = { result: 'Passed', passedTests: 1, failedTests: 0, skippedTests: 0, totalTestCount: 1 };

function run(t, { cases = [goodCase], bundle = 'HighGroundCaptureUITests', summary = goodSummary, warnings = [], readFailure = false, malformed = false } = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'quipsly-runtime-results-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const xcrun = path.join(directory, 'xcrun');
  writeFileSync(xcrun, `#!${process.execPath}
if (process.env.QA_READ_FAILURE === 'true') process.exit(29);
if (process.env.QA_MALFORMED === 'true') { process.stdout.write('not JSON'); process.exit(0); }
process.stdout.write(process.argv.includes('summary') ? process.env.QA_SUMMARY : process.env.QA_TREE);
`, { mode: 0o755 });
  return spawnSync('bash', ['-euo', 'pipefail', '-c', verification], {
    encoding: 'utf8', timeout: 15_000,
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      XCRUN: xcrun,
      SCRIPT_DIR: scriptDir,
      RESULT_BUNDLE_PATH: path.join(directory, 'retained.xcresult'),
      TEST_CLASS: expectedClass,
      TEST_CASE: expectedCase,
      QA_READ_FAILURE: String(readFailure),
      QA_MALFORMED: String(malformed),
      QA_SUMMARY: JSON.stringify(summary),
      QA_TREE: JSON.stringify({ testNodes: [{ nodeType: 'UI test bundle', name: bundle, children: [
        ...cases, ...warnings.map(name => ({ nodeType: 'Runtime Warning', name })),
      ] }] }),
    },
  });
}

test('actual runtime shell accepts the exact executed journey and reports warnings', t => {
  const result = run(t);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /verified all 1 planned test identities/);
  assert.match(result.stdout, /"unexpectedRuntimeWarnings": 0/);
});

for (const [name, options] of [
  ['different method', { cases: [{ ...goodCase, nodeIdentifier: `${expectedClass}/testSomethingElse()` }] }],
  ['different class', { cases: [{ ...goodCase, nodeIdentifier: `OtherTests/${expectedCase}()` }] }],
  ['different bundle', { bundle: 'OtherUITests' }],
  ['missing journey', { cases: [] }],
  ['repeated journey', { cases: [goodCase, goodCase] }],
  ['skipped journey despite passing summary', { cases: [{ ...goodCase, result: 'Skipped' }] }],
  ['failed journey despite passing summary', { cases: [{ ...goodCase, result: 'Failed' }] }],
  ['missing identity', { cases: [{ nodeType: 'Test Case', result: 'Passed' }] }],
  ['unreadable bundle', { readFailure: true }],
  ['malformed bundle', { malformed: true }],
]) {
  test(`actual runtime shell rejects ${name} before reporting success`, t => {
    const result = run(t, options);
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /"ok": true|PASS:/);
  });
}

test('runtime shell still rejects incorrect aggregate counts', t => {
  const result = run(t, { summary: { ...goodSummary, skippedTests: 1, totalTestCount: 2 } });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /did not execute exactly one passing test/);
});

test('runtime shell still rejects a new runtime warning', t => {
  const result = run(t, { warnings: ['Unexpected actor isolation violation'] });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unexpected runtime warnings/);
});
