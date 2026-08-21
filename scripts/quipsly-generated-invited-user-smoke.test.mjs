import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generated = readFileSync(
  new URL("./quipsly-generated-invited-user-smoke.mjs", import.meta.url),
  "utf8",
);
const auth = readFileSync(
  new URL("./quipsly-firebase-auth-smoke.mjs", import.meta.url),
  "utf8",
);

test("generated invite smoke requires an exact project visibility allowlist", () => {
  assert.match(
    generated,
    /QUIPSLY_AUTH_SMOKE_ASSERT_EXACT_PROJECT_VISIBILITY: "1"/,
  );
  assert.match(auth, /allowedProjectSlugs = new Set/);
  assert.match(
    auth,
    /\/api\/mac\/session-check disclosed unrelated project slug/,
  );
  assert.match(auth, /exactProjectVisibility = "pass"/);
  assert.match(auth, /\/api\/mac\/session-check:exact-project-allowlist/);
});

test("exact visibility cannot silently skip native identity evidence", () => {
  assert.match(
    auth,
    /Exact project visibility requires the native session-check projection/,
  );
  assert.match(
    auth,
    /Exact project visibility requires QUIPSLY_AUTH_SMOKE_EXPECT_PROJECT_SLUG/,
  );
});
