import assert from "node:assert/strict";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { FfmpegInterruptionRepairEngine } from "./interruption-repair-ffmpeg.js";

test("losslessly remuxes a prematurely ended WebM and verifies full decode", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "quipsly-repair-test-"));
  try {
    const complete = join(scratch, "complete.webm");
    const interrupted = join(scratch, "interrupted.webm");
    const repaired = join(scratch, "repaired.webm");
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
      "sine=frequency=440:duration=2", "-c:a", "libopus", complete,
    ]);
    const fullSize = (await stat(complete)).size;
    const source = await open(complete, "r");
    const target = await open(interrupted, "wx", 0o600);
    try {
      const retainedSize = fullSize - 256;
      const buffer = Buffer.alloc(retainedSize);
      const { bytesRead } = await source.read(buffer, 0, buffer.length, 0);
      assert.equal(bytesRead, retainedSize);
      await target.write(buffer);
    } finally {
      await source.close();
      await target.close();
    }

    const repairedEvidence = await new FfmpegInterruptionRepairEngine()
      .repair(interrupted, repaired);
    assert.equal(repairedEvidence.technical.hasAudio, true);
    assert.equal(repairedEvidence.technical.hasVideo, false);
    assert.equal(repairedEvidence.technical.audioCodec, "opus");
    assert.equal(repairedEvidence.technical.decodedToEnd, true);
    assert.equal(repairedEvidence.technical.packetPayloadReencoded, false);
    assert.ok(repairedEvidence.technical.durationSeconds > 1.5);
    assert.match(repairedEvidence.sha256, /^[0-9a-f]{64}$/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

function run(executable: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`${executable} failed (${code}): ${stderr}`)));
  });
}

