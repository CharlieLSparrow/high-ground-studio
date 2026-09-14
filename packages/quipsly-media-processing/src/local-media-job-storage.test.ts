import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalMediaJobStorage } from "./local-media-job-storage.js";

test("local control storage has one CAS winner and keeps generation-bound reads/deletes", async () => {
  const root = await mkdtemp(join(tmpdir(), "quipsly-local-media-cas-"));
  try {
    const storage = new LocalMediaJobStorage(root);
    const name = "control/queue/job.json";
    const initial = await storage.saveJsonIfAbsent(name, { phase: "queued" });
    assert.deepEqual(await storage.saveJsonIfAbsent(name, { phase: "wrong" }), initial);
    const race = await Promise.allSettled(Array.from({ length: 8 }, (_, worker) => storage.saveJson(name, { worker }, initial.generation)));
    assert.equal(race.filter((row) => row.status === "fulfilled").length, 1);
    assert.ok(race.filter((row) => row.status === "rejected").every((row: any) => row.reason.code === 412));
    await assert.rejects(storage.loadJson(name, initial.generation), { code: 412 });
    await assert.rejects(storage.deleteObject(name, initial.generation), { code: 412 });
    const latest = await storage.loadJson(name);
    assert.deepEqual(await storage.listQueueObjectsUnder("control/queue/", 1), [{ name, generation: latest.generation }]);
    await storage.deleteObject(name, latest.generation);
    assert.deepEqual(await storage.listQueueObjectsUnder("control/queue/", 1), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("local media rejects traversal/symlinks and keeps derivative bytes and lineage immutable", async () => {
  const root = await mkdtemp(join(tmpdir(), "quipsly-local-media-bytes-"));
  try {
    const storage = new LocalMediaJobStorage(root);
    for (const name of ["../escape", "/absolute", "foo/../escape", "foo\\escape"]) await assert.rejects(storage.loadJson(name));
    await storage.saveJsonIfAbsent("initial.json", {});
    await symlink(tmpdir(), join(root, "jobs", "escape"));
    await assert.rejects(storage.saveJsonIfAbsent("escape/no.json", {}), /symlinks/);
    const source = join(root, "source");
    await writeFile(source, "123456789");
    const name = "media-vault/derived/test/listening.m4a";
    const output = await storage.uploadProxy(source, name, "audio/mp4", { quipslySourceSha256: "original" });
    assert.equal(output.crc32c, "4waSgw=="); // Published CRC32C check vector: e3069283.
    assert.equal((await storage.uploadProxy(source, name, "audio/mp4", { quipslySourceSha256: "original" })).generation, output.generation);
    await assert.rejects(storage.uploadProxy(source, "media-vault/recordings/source.caf", "audio/mp4", {}), /derived/);
    await assert.rejects(storage.uploadProxy(source, name, "audio/mp4", { quipslySourceSha256: "different" }), /lineage/);
    await writeFile(source, "different bytes");
    await assert.rejects(storage.uploadProxy(source, name, "audio/mp4", { quipslySourceSha256: "original" }), /different bytes/);
    assert.equal((await readFile(join(root, "objects", name))).toString(), "123456789");
    await writeFile(join(root, "objects", name), "987654321");
    await assert.rejects(storage.objectEvidence(name, output.generation), /verified receipt/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
