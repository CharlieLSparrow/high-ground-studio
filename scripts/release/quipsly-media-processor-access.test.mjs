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
    "media-vault/proxy/",
    "media-vault/mastering/",
  ]) assert.match(script, new RegExp(prefix.replaceAll("/", "\\/")));
});

test("mastering output is create-and-read only while control records stay updateable", () => {
  assert.match(script, /"\$\{mastering_folder\}"[\s\S]+roles\/storage\.objectCreator/);
  assert.match(script, /"\$\{mastering_folder\}"[\s\S]+roles\/storage\.objectViewer/);
  assert.doesNotMatch(script, /"\$\{mastering_folder\}"[\s\S]{0,140}roles\/storage\.objectUser/);
  for (const variable of ["alignment_control_folder", "mastery_control_folder", "signal_profile_control_folder"]) {
    assert.match(script, new RegExp(`\\$\\{${variable}\\}`));
  }
  assert.match(script, /roles\/storage\.objectUser/);
});

test("access activation never grants job execution overrides", () => {
  assert.match(script, /roles\/run\.jobsExecutor/);
  assert.match(script, /roles\/run\.jobsExecutorWithOverrides/);
  assert.match(script, /if \(!executor \|\| override\)/);
});
