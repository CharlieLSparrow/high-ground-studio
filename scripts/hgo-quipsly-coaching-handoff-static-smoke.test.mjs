import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const scriptURL = new URL("./hgo-quipsly-coaching-handoff-static-smoke.mjs", import.meta.url);

test("coaching handoff smoke does not depend on process.cwd", async () => {
  const source = await readFile(scriptURL, "utf8");
  assert.doesNotMatch(source, /const root = process\.cwd\(\)/);
  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
});

const root = fileURLToPath(new URL("../", import.meta.url));
const handoff = "scripts/hgo-quipsly-coaching-handoff-static-smoke.mjs";
const lifecycle = "scripts/quipsly-coaching-lifecycle-static-smoke.mjs";

for (const missingBoundary of [null, "booking authentication", "packet authentication"]) {
  test(`coaching source gates allow UI changes but detect ${missingBoundary || "intact application boundaries"}`, (t) => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "quipsly-coaching-source-gates-"));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    for (const script of [handoff, lifecycle]) {
      const source = readFileSync(path.join(root, script), "utf8");
      // Copy only the source files named by the actual checks, never accounts,
      // environments, dependencies, media, or generated build output.
      const paths = [script, ...[...source.matchAll(/"((?:apps|packages|prisma|scripts)\/[^"\n]+)"/g)].map(match => match[1])];
      for (const relative of new Set(paths)) {
        mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
        cpSync(path.join(root, relative), path.join(fixture, relative));
      }
    }
    const page = path.join(fixture, "apps/quipsly/src/app/(app)/coaching/page.tsx");
    mkdirSync(path.dirname(page), { recursive: true });
    writeFileSync(page, 'export default function Coaching() { return <main>Your work</main>; }\n');
    const packet = path.join(fixture, "apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts");
    writeFileSync(packet, readFileSync(packet, "utf8")
      .replaceAll("Sign in before reading a coaching packet.", "Please sign in.")
      .replaceAll("Prepare notes, tasks, and goals from the completed transcript.", "Your follow-up is ready to create."));
    if (missingBoundary) {
      const target = missingBoundary === "booking authentication"
        ? path.join(fixture, "apps/quipsly/src/app/api/coaching/booking-requests/route.ts") : packet;
      writeFileSync(target, readFileSync(target, "utf8").replaceAll("getQuipslySessionFromRequest", "missingSessionBoundary"));
    }
    for (const script of [handoff, lifecycle]) {
      const result = spawnSync(process.execPath, [path.join(fixture, script)], { cwd: fixture, encoding: "utf8" });
      const shouldFail = (script === handoff && missingBoundary === "booking authentication")
        || (script === lifecycle && missingBoundary === "packet authentication");
      assert.equal(result.status, shouldFail ? 1 : 0, result.stdout + result.stderr);
      const report = JSON.parse(result.status === 0 || script === lifecycle ? result.stdout : result.stderr);
      assert.equal(report.ok, !shouldFail);
      if (script === lifecycle && shouldFail) {
        assert.deepEqual(report.checks.filter(check => check.status !== "pass").map(check => check.id),
          ["packetRouteReturnsOrdinaryEditableWork"]);
      }
    }
  });
}

for (const missingBoundary of [null, "native scheduling command", "calendar update status", "Nest task authorization", "tag assignment eligibility"]) {
  test(`scheduling source checks tolerate presentation changes and detect ${missingBoundary || "intact wiring"}`, t => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), "quipsly-scheduling-source-gates-"));
    t.after(() => rmSync(fixture, { recursive: true, force: true }));
    const scheduling = "scripts/quipsly-coaching-scheduling-static-smoke.mjs";
    const capture = "scripts/quipsly-mobile-capture-contract-smoke.mjs";
    for (const script of [scheduling, capture]) {
      const source = readFileSync(path.join(root, script), "utf8");
      const paths = [script, ...[...source.matchAll(/"((?:apps|packages|prisma|scripts|docs)\/[^"\n]+)"/g)].map(match => match[1])];
      for (const relative of new Set(paths)) {
        mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
        cpSync(path.join(root, relative), path.join(fixture, relative));
      }
    }
    const route = path.join(fixture, "apps/quipsly/src/app/api/coaching/runway/route.ts");
    const nestQuery = path.join(fixture, "apps/quipsly/src/lib/server/nest-project-follow-through.ts");
    const workTags = path.join(fixture, "apps/quipsly/src/lib/server/work-tags.ts");
    // Product wording and retaining already-assigned archived tags are not an
    // authorization contract. Check the canonical eligibility guard's wiring.
    writeFileSync(workTags, readFileSync(workTags, "utf8")
      .replaceAll("Choose available tags from this Nest. Archived tags can stay only on work that already uses them.", "Choose an available tag.")
      .replaceAll("assignableOrRetainedTagWhere(input.entityKind, entityId)", missingBoundary === "tag assignment eligibility" ? "missingTagEligibility()" : "assignableOrRetainedTagWhere(input.entityKind, entityId)"));
    if (missingBoundary === "Nest task authorization") {
      writeFileSync(nestQuery, readFileSync(nestQuery, "utf8").replaceAll("personalOrSharedSessionTaskAccessWhere(actorUserId)", "unscopedTaskQuery()"));
    }
    writeFileSync(route, readFileSync(route, "utf8")
      .replaceAll("Session time updated.", "Appointment updated.")
      .replaceAll("Booking canceled in Quipsly. Cancel external calendar/invite/payment evidence separately", "Canceled here. Provider status is separate.")
      .replaceAll("externalCalendarUpdated: false", missingBoundary === "calendar update status" ? "calendarFlagRemoved: false" : "externalCalendarUpdated: false"));
    const native = path.join(fixture, "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureCoachingHome.swift");
    writeFileSync(native, readFileSync(native, "utf8")
      .replaceAll("The client space and its existing work stay available.", "Your shared work stays here.")
      .replaceAll("CaptureCoachingSaveReschedule", "RescheduleButtonRenamed")
      .replaceAll("performAction(command.body)", missingBoundary === "native scheduling command" ? "disconnectedCommand()" : "performAction(command.body)"));
    for (const script of [scheduling, capture]) {
      const result = spawnSync(process.execPath, [path.join(fixture, script), "--source-only", "--json"], {
        cwd: fixture, encoding: "utf8", timeout: 15_000,
      });
      const expectedFailure = (script === scheduling && missingBoundary === "calendar update status")
        || (script === capture && ["native scheduling command", "Nest task authorization", "tag assignment eligibility"].includes(missingBoundary));
      assert.equal(result.status, expectedFailure ? 1 : 0, result.stdout + result.stderr);
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.checks.filter(check => check.status === "fail").map(check => check.id ?? check.name),
        expectedFailure ? [script === scheduling ? "rescheduleAndCancelAreQuipslyFirst" : missingBoundary === "Nest task authorization" ? "nestProjectCanonicalFollowThrough" : missingBoundary === "tag assignment eligibility" ? "canonicalWorkSessionProjectTags" : "nativeCoachingSchedulingManagementParity"] : []);
    }
  });
}

test("release gate reports the underlying failed assertion without dumping raw provider output", () => {
  const source = readFileSync(path.join(root, "scripts/hgo-quipsly-release-readiness.mjs"), "utf8");
  const body = source.split("  for (const check of checks) {\n")[1]?.split("  if (report.deployBlocked)")[0];
  assert.ok(body);
  const lines = [];
  vm.runInNewContext(`for (const check of checks) {\n${body}`, {
    console: { log: line => lines.push(line) },
    checks: [{ id: "source-gate", status: "fail", summary: "Source contract", command: "node scripts/source-gate.mjs",
      stdout: "private output must not be dumped", stderr: "private provider data",
      payload: { checks: [{ id: "unchanged", status: "pass", summary: "Already passed" },
        { name: "missingBoundary", status: "fail", summary: "Canonical command missing" }] } }],
  });
  assert.deepEqual(lines, ["FAIL source-gate: Source contract", "  - missingBoundary: Canonical command missing", "  Reproduce: node scripts/source-gate.mjs"]);
});
