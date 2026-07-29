import assert from "node:assert/strict";
import test from "node:test";

import {
  arraysEqual,
  blocksDigest,
  contentTypeForClip,
  isCanonicalSyntheticSeed,
  manuscriptBlocks,
  matchingReferenceCandidate,
  parseArguments,
  roomAssetIds,
} from "./quipsly-stage-hgo-testflight-rehearsal.mjs";

test("apply mode requires a manuscript and at least one ordered clip", () => {
  const plan = parseArguments([]);
  assert.equal(plan.apply, false);
  assert.deepEqual(plan.clipPaths, []);
  assert.throws(
    () => parseArguments(["--apply", "--clip", "/tmp/lead.mp4"]),
    /--manuscript is required/,
  );
  assert.throws(
    () => parseArguments(["--apply", "--manuscript", "/tmp/book.txt"]),
    /At least one --clip/,
  );
  const apply = parseArguments([
    "--apply",
    "--manuscript",
    "/tmp/book.txt",
    "--clip",
    "/tmp/lead.mp4",
    "--clip",
    "/tmp/second.mp4",
  ]);
  assert.equal(apply.apply, true);
  assert.deepEqual(apply.clipPaths, [
    "/tmp/lead.mp4",
    "/tmp/second.mp4",
  ]);
});

test("manuscript block parsing mirrors the Episode Room import contract", () => {
  const blocks = manuscriptBlocks("A\r\nline\r\n\r\n  B  \r\n\r\n\r\nC");
  assert.deepEqual(blocks, ["A\nline", "B", "C"]);
  assert.equal(blocksDigest(blocks).length, 64);
});

test("watch source types are deliberately limited to browser-playable video", () => {
  assert.equal(contentTypeForClip("lead.mp4"), "video/mp4");
  assert.equal(contentTypeForClip("take.MOV"), "video/quicktime");
  assert.equal(contentTypeForClip("source.webm"), "video/webm");
  assert.throws(
    () => contentTypeForClip("source.mkv"),
    /must be MP4, M4V, MOV, or WebM/,
  );
});

test("only the exact generated rehearsal checklist is replaceable", () => {
  const seed = {
    textBlocks: [
      {
        order: 0,
        body: "# High Ground Odyssey TestFlight Rehearsal",
      },
      {
        order: 1000,
        body: [
          "## Rehearsal checklist",
          "",
          "- Both people join the Quipsly audio room.",
          "- Each person grants their own recording consent.",
          "- Record local audio and iPhone video.",
          "- Pause/resume and switch between front and back cameras.",
          "- End capture, verify upload, then listen to the assembled timeline.",
        ].join("\n"),
      },
    ],
  };
  assert.equal(isCanonicalSyntheticSeed(seed), true);
  seed.textBlocks[1].body += "\nHuman edit";
  assert.equal(isCanonicalSyntheticSeed(seed), false);
});

test("reference candidate matching never confuses proof or recording assets", () => {
  const desk = {
    importedCandidates: [
      {
        assetId: "proof",
        title: "Lead.mp4",
        importRole: "rehearsal-proof",
      },
      {
        assetId: "reference",
        title: "Lead.mp4",
        importRole: "reference-clip",
      },
    ],
  };
  assert.equal(
    matchingReferenceCandidate(desk, { name: "Lead.mp4" })?.assetId,
    "reference",
  );
});

test("watch order comparison and extraction are exact", () => {
  const desk = {
    room: {
      clips: [{ assetId: "lead" }, { assetId: "second" }],
    },
  };
  assert.deepEqual(roomAssetIds(desk), ["lead", "second"]);
  assert.equal(arraysEqual(["lead", "second"], ["lead", "second"]), true);
  assert.equal(arraysEqual(["lead", "second"], ["second", "lead"]), false);
});
