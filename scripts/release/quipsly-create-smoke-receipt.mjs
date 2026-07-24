#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import {
  createReleaseSmokeReceiptToken,
} from "../../apps/quipsly/src/lib/server/release-smoke-receipt-core.ts";

function usage() {
  process.stderr.write(`Usage:
  QUIPSLY_RELEASE_SMOKE_SECRET=<secret> node --experimental-strip-types \\
    scripts/release/quipsly-create-smoke-receipt.mjs \\
    --revision <cloud-run-revision> --host <hostname>... --route <route-id>... \\
    --out <private-token-file>

The receipt token is written to a newly created mode-0600 file and is never
printed. The secret is read only from QUIPSLY_RELEASE_SMOKE_SECRET.
`);
}

const args = process.argv.slice(2);
let revision = "";
let outputPath = "";
const hosts = [];
const passedRouteIds = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  const value = args[index + 1];
  if (arg === "--revision" && value) {
    revision = value;
    index += 1;
  } else if (arg === "--host" && value) {
    hosts.push(value);
    index += 1;
  } else if (arg === "--route" && value) {
    passedRouteIds.push(value);
    index += 1;
  } else if (arg === "--out" && value) {
    outputPath = value;
    index += 1;
  } else if (arg === "--help" || arg === "-h") {
    usage();
    process.exit(0);
  } else {
    usage();
    process.exit(2);
  }
}

if (!revision || hosts.length === 0 || passedRouteIds.length === 0 || !outputPath) {
  usage();
  process.exit(2);
}

try {
  const token = createReleaseSmokeReceiptToken({
    secret: process.env.QUIPSLY_RELEASE_SMOKE_SECRET,
    revision,
    hosts,
    passedRouteIds,
  });
  writeFileSync(outputPath, token, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Could not create release-smoke receipt."}\n`);
  process.exit(1);
}
