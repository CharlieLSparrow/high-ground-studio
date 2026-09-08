import assert from "node:assert/strict";
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {test} from "node:test";
import {syncPrismaClients} from "./sync-prisma-pnpm-clients.mjs";

const current = "enum TransactionalEmailKind {\n BOOKING_CONFIRMED\n BOOKING_RESCHEDULED\n}\n";
const stale = "enum TransactionalEmailKind {\n BOOKING_CONFIRMED\n}\n";

test("manual schema generation uses the same workspace synchronization as installation", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["db:generate"], "node scripts/prisma-generate-workspace-clients.mjs");
  assert.equal(pkg.scripts["db:generate"], pkg.scripts.postinstall);
});
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "quipsly-prisma-sync-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(path.join(root, "prisma"));
  writeFileSync(path.join(root, "prisma/schema.prisma"), current);
  return root;
}
function payload(root, relative, schema, marker) {
  const dir = path.join(root, relative, ".prisma/client");
  mkdirSync(dir, {recursive: true});
  writeFileSync(path.join(dir, "schema.prisma"), schema);
  writeFileSync(path.join(dir, "default.js"), marker);
  if (relative.includes(".pnpm")) {
    mkdirSync(path.join(root, relative, "@prisma/client"), {recursive: true});
    writeFileSync(path.join(root, relative, "@prisma/client/package.json"), "{}");
  }
  return dir;
}

test("fresh peer-client payload replaces stale root and alphabetically earlier clients", (t) => {
  const root = fixture(t);
  const oldRoot = payload(root, "node_modules", stale, "old root");
  const oldPeer = payload(root, "node_modules/.pnpm/@prisma+client@7.7.0_a/node_modules", stale, "old peer");
  const fresh = payload(root, "node_modules/.pnpm/@prisma+client@7.7.0_z/node_modules", current, "current payload");
  assert.equal(syncPrismaClients(root).synced, 2);
  for (const dir of [oldRoot, oldPeer, fresh]) {
    assert.equal(readFileSync(path.join(dir, "schema.prisma"), "utf8"), current);
    assert.equal(readFileSync(path.join(dir, "default.js"), "utf8"), "current payload");
  }
});

test("stale clients cannot become the source merely because familiar models still exist", (t) => {
  const root = fixture(t);
  const old = payload(root, "node_modules", stale, "untouched");
  assert.throws(() => syncPrismaClients(root), /No generated Prisma client matches/);
  assert.equal(readFileSync(path.join(old, "default.js"), "utf8"), "untouched");
});

test("hoisted installs work without a pnpm virtual store", (t) => {
  const root = fixture(t);
  payload(root, "node_modules", current, "current");
  assert.deepEqual(syncPrismaClients(root), {synced: 0, source: "node_modules/.prisma/client", targets: 1});
});

test("line-ending differences do not reject an otherwise identical schema", (t) => {
  const root = fixture(t);
  payload(root, "node_modules", current.replaceAll("\n", "\r\n"), "current");
  assert.equal(syncPrismaClients(root).targets, 1);
});
