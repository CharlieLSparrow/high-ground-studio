#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("./quipsly-live-invited-user-smoke.sh", import.meta.url),
  "utf8",
);

assert.match(source, /^set -euo pipefail$/m);
assert.match(source, /^umask 077$/m);
assert.match(
  source,
  /"\$\{BASE_URL%\/\}\/api\/mac\/firebase-client-config"/,
);
assert.match(source, /curl -fsS --max-time 20/);
assert.match(source, /-o "\$\{FIREBASE_CONFIG_FILE\}"/);
assert.match(source, /Invite smoke target must be a clean HTTPS Quipsly origin or HTTP loopback\./);
assert.match(source, /url\.pathname !== "\/"/);
assert.match(source, /\(!loopback && url\.port\)/);
assert.match(
  source,
  /"\$\{TMPDIR:-\/private\/tmp\}"\/quipsly-invited-user-smoke\.\*/,
);
assert.match(source, /wait "\$\{PROXY_PID\}"/);
assert.match(
  source,
  /Firebase client configuration did not contain a usable API key\./,
);
assert.match(
  source,
  /NEXT_PUBLIC_FIREBASE_API_KEY="\$\{FIREBASE_API_KEY\}"/g,
);
assert.match(
  source,
  /QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="\$\{FIREBASE_API_KEY\}"/g,
);
assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}/);
assert.doesNotMatch(source, /echo\s+["']?\$\{?FIREBASE_API_KEY/);

const nextPublicAssignments = source.match(
  /NEXT_PUBLIC_FIREBASE_API_KEY="\$\{FIREBASE_API_KEY\}"/g,
) ?? [];
const smokeAssignments = source.match(
  /QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="\$\{FIREBASE_API_KEY\}"/g,
) ?? [];
assert.equal(nextPublicAssignments.length, 2);
assert.equal(smokeAssignments.length, 2);

process.stdout.write(
  "PASS live invited-user smoke discovers the Firebase client key without printing or pinning it.\n",
);
