import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(new URL("./quipsly-media-processor-access.sh", import.meta.url), "utf8");

test("media processor access declares every worker control and derivative boundary", () => {
  for (const prefix of [
    "media-vault/control/capture-proxy/",
    "media-vault/control/audio-alignment/",
    "media-vault/control/audio-mastery/",
    "media-vault/control/audio-signal-profile/",
    "media-vault/control/audio-spectral-evidence/",
    "media-vault/proxy/",
    "media-vault/mastering/",
    "media-vault/spectral/",
  ]) assert.match(script, new RegExp(prefix.replaceAll("/", "\\/")));
});

test("mastering output is create-and-read only while control records stay updateable", () => {
  assert.match(script, /"\$\{mastering_folder\}"[\s\S]+roles\/storage\.objectCreator/);
  assert.match(script, /"\$\{mastering_folder\}"[\s\S]+roles\/storage\.objectViewer/);
  assert.doesNotMatch(script, /"\$\{mastering_folder\}"[\s\S]{0,140}roles\/storage\.objectUser/);
  assert.match(script, /"\$\{spectral_folder\}"[\s\S]+roles\/storage\.objectCreator/);
  assert.match(script, /"\$\{spectral_folder\}"[\s\S]+roles\/storage\.objectViewer/);
  assert.doesNotMatch(script, /"\$\{spectral_folder\}"[\s\S]{0,140}roles\/storage\.objectUser/);
  for (const variable of ["alignment_control_folder", "mastery_control_folder", "signal_profile_control_folder", "spectral_control_folder"]) {
    assert.match(script, new RegExp(`\\$\\{${variable}\\}`));
  }
  assert.match(script, /roles\/storage\.objectUser/);
});

test("access activation never grants job execution overrides", () => {
  assert.match(script, /ENABLE_SCHEDULER:-0/);
  assert.match(script, /Processor access is request-driven; Cloud Scheduler remains disabled by contract/);
  assert.match(script, /roles\/run\.jobsExecutor/);
  assert.match(script, /roles\/run\.jobsExecutorWithOverrides/);
  assert.match(script, /if \(\(required && !executor\) \|\| override\)/);
});
