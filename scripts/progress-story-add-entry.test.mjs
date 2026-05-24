import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const scriptPath = "scripts/progress-story-add-entry.mjs";

function createStoryFile() {
  const directory = mkdtempSync(join(tmpdir(), "progress-story-"));
  const file = join(directory, "progress-story.json");

  writeFileSync(
    file,
    `${JSON.stringify(
      {
        updatedAt: "2026-05-24T00:00:00.000Z",
        intro: "Existing story.",
        entries: [
          {
            id: "existing-entry",
            date: "2026-05-23",
            title: "Existing entry",
            kicker: "Already there",
            mood: "Steady",
            summary: "Already present.",
            body: ["Already present."],
            commits: [{ sha: "abc1234", label: "feat: existing" }],
            links: [{ label: "Docs", href: "docs/example.md" }],
            tags: ["Existing"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  return file;
}

test("adds a progress story entry without reformatting tag chips", () => {
  const file = createStoryFile();
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--file",
      file,
      "--id",
      "public-updates-live",
      "--date",
      "2026-05-24",
      "--title",
      "Public updates are live",
      "--kicker",
      "The build journal has a public home",
      "--mood",
      "Visible",
      "--summary",
      "The team can read a short story for each meaningful release.",
      "--body",
      "The same progress data now powers the public and internal pages.",
      "--body",
      "Future agents can keep the story updated with one command.",
      "--commit",
      "4bd64a2=feat(web): publish build updates page",
      "--link",
      "Build updates=https://app.highgroundodyssey.com/updates",
      "--tag",
      "Updates",
      "--tag",
      "Team",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Added progress story entry: public-updates-live/);

  const text = readFileSync(file, "utf8");
  const story = JSON.parse(text);
  assert.equal(story.entries[0].id, "public-updates-live");
  assert.equal(story.entries[0].commits[0].sha, "4bd64a2");
  assert.equal(story.entries[0].links[0].label, "Build updates");
  assert.deepEqual(story.entries[0].tags, ["Updates", "Team"]);
  assert.match(text, /"tags": \["Updates", "Team"\]/);
});

test("refuses to overwrite an entry id unless replace is explicit", () => {
  const file = createStoryFile();
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--file",
      file,
      "--id",
      "existing-entry",
      "--title",
      "Existing entry",
      "--summary",
      "This should fail.",
      "--commit",
      "abc1234=feat: existing",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /already has entry id "existing-entry"/);
});
