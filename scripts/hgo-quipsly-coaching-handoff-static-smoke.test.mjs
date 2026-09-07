import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
