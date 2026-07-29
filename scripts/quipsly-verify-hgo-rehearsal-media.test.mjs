import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticatedHeaders,
  contentTypeFor,
  matchingFixture,
  parseArguments,
} from "./quipsly-verify-hgo-rehearsal-media.mjs";

test("apply mode requires a local fixture without weakening plan mode", () => {
  const plan = parseArguments([]);
  assert.equal(plan.apply, false);
  assert.equal(plan.mediaPath, "");
  assert.equal(plan.projectSlug, "high-ground-odyssey-rehearsal");
  assert.throws(
    () => parseArguments(["--apply"]),
    /--media is required with --apply/,
  );
  const apply = parseArguments([
    "--apply",
    "--media",
    "/private/tmp/rehearsal.m4a",
    "--duration-seconds",
    "13.2",
  ]);
  assert.equal(apply.apply, true);
  assert.equal(apply.durationSeconds, 13.2);
});

test("fixture matching is scoped to its explicit rehearsal role", () => {
  const desk = {
    importedCandidates: [
      {
        assetId: "ordinary",
        title: "Quipsly Capture Rehearsal System Check.m4a",
        importRole: "reference-clip",
      },
      {
        assetId: "fixture",
        title: "Quipsly Capture Rehearsal System Check.m4a",
        importRole: "rehearsal-proof",
      },
    ],
  };
  assert.equal(
    matchingFixture(
      desk,
      "Quipsly Capture Rehearsal System Check.m4a",
    )?.assetId,
    "fixture",
  );
});

test("auth headers keep both mobile bearer and Nest browser session boundaries", () => {
  assert.deepEqual(
    authenticatedHeaders(
      { idToken: "id-token", sessionCookie: "session=cookie" },
      { Accept: "application/json" },
    ),
    {
      Authorization: "Bearer id-token",
      Cookie: "session=cookie",
      Accept: "application/json",
    },
  );
});

test("rehearsal media accepts only expected audio types", () => {
  assert.equal(contentTypeFor("proof.m4a"), "audio/mp4");
  assert.equal(contentTypeFor("proof.wav"), "audio/wav");
  assert.throws(
    () => contentTypeFor("proof.mov"),
    /must be M4A, WAV, MP3, or AAC/,
  );
});
