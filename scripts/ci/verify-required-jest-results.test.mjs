import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyRequiredJestResults } from './verify-required-jest-results.mjs';

const root = path.resolve('apps/quipsly');
const suites = ['src/access.integration.test.ts', 'src/notes.integration.test.ts'];
const report = () => ({
  success: true, wasInterrupted: false,
  testResults: suites.map((name) => ({
    name: path.resolve(root, name), status: 'passed',
    assertionResults: [{ fullName: 'persists scoped work', status: 'passed' }],
  })),
});

test('accepts every selected suite with executed passing assertions', () => {
  assert.deepEqual(verifyRequiredJestResults(report(), root, suites), { suites: 2, assertions: 2 });
});

for (const [name, mutate] of [
  ['skipped test despite green aggregate', (r) => { r.testResults[0].assertionResults[0].status = 'pending'; }],
  ['todo test', (r) => { r.testResults[0].assertionResults[0].status = 'todo'; }],
  ['failed test', (r) => { r.testResults[0].assertionResults[0].status = 'failed'; }],
  ['empty suite', (r) => { r.testResults[0].assertionResults = []; }],
  ['missing suite', (r) => { r.testResults.pop(); }],
  ['substituted suite with same totals', (r) => { r.testResults[0].name = path.resolve(root, 'unrelated.test.ts'); }],
  ['duplicated suite with same totals', (r) => { r.testResults[0] = r.testResults[1]; }],
  ['extra suite', (r) => { r.testResults.push(r.testResults[0]); }],
  ['skipped suite', (r) => { r.testResults[0].status = 'pending'; }],
  ['interruption', (r) => { r.wasInterrupted = true; }],
  ['failed run', (r) => { r.success = false; }],
  ['missing results', (r) => { delete r.testResults; }],
]) {
  test(`rejects ${name}`, () => {
    const value = report();
    mutate(value);
    assert.throws(() => verifyRequiredJestResults(value, root, suites));
  });
}

test('requires a nonempty unique selection', () => {
  assert.throws(() => verifyRequiredJestResults(report(), root, []));
  assert.throws(() => verifyRequiredJestResults(report(), root, [suites[0], suites[0]]));
});

test('CLI fails on absent/malformed receipts and on a green run containing a skip', (t) => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'quipsly-jest-proof-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const filename = path.join(temp, 'results.json');
  const invoke = () => spawnSync(process.execPath, [
    new URL('./verify-required-jest-results.mjs', import.meta.url).pathname,
    filename, root, ...suites,
  ], { encoding: 'utf8' });
  assert.equal(invoke().status, 1);
  writeFileSync(filename, '{');
  assert.equal(invoke().status, 1);
  const value = report();
  value.testResults[0].assertionResults[0].status = 'pending';
  writeFileSync(filename, JSON.stringify(value));
  assert.equal(invoke().status, 1);
  writeFileSync(filename, JSON.stringify(report()));
  const passed = invoke();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /2 suites, 2 executed tests, no skips/);
});
