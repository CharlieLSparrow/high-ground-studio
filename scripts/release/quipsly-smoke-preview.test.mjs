import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  validateReleaseSmokeReceiptToken,
} from "../../apps/quipsly/src/lib/server/release-smoke-receipt-core.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const smokeScript = fileURLToPath(new URL("./quipsly-smoke-preview.sh", import.meta.url));
const generatorScript = fileURLToPath(new URL("./quipsly-create-smoke-receipt.mjs", import.meta.url));
const secret = "script-contract-secret-that-is-at-least-thirty-two-bytes";
const revision = "studio-00042-script-contract";
const hosts = ["nest.quipsly.com", "quipsly.com"];
const routeIds = [
  ...RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  ...hosts.map((host) => `public-host:${host}`),
];

test("receipt generator and server validator share one canonical token contract", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "quipsly-receipt-contract-"));
  const outputPath = join(tempDirectory, "receipt.token");
  const args = ["--experimental-strip-types", generatorScript, "--revision", revision];
  for (const host of hosts) args.push("--host", host);
  for (const routeId of routeIds) args.push("--route", routeId);
  args.push("--out", outputPath);

  try {
    const generated = spawnSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        QUIPSLY_RELEASE_SMOKE_SECRET: secret,
      },
    });

    assert.equal(generated.status, 0, generated.stderr);
    assert.equal(generated.stderr, "");
    assert.equal(generated.stdout, "");
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    const token = readFileSync(outputPath, "utf8");
    assert.ok(token.startsWith("qsr1."));

    const validation = validateReleaseSmokeReceiptToken({
      token,
      secret,
      expectedRevision: revision,
      expectedHosts: hosts,
      requiredRouteIds: RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
    });
    assert.equal(validation.ok, true);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("receipt generator fails closed when its explicit secret is missing", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "quipsly-missing-secret-"));
  const outputPath = join(tempDirectory, "receipt.token");
  try {
    const generated = spawnSync(process.execPath, [
      "--experimental-strip-types",
      generatorScript,
      "--revision",
      revision,
      "--host",
      hosts[0],
      "--route",
      routeIds[0],
      "--out",
      outputPath,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key !== "QUIPSLY_RELEASE_SMOKE_SECRET"),
      ),
    });

    assert.notEqual(generated.status, 0);
    assert.match(generated.stderr, /QUIPSLY_RELEASE_SMOKE_SECRET is not configured/);
    assert.equal(generated.stdout, "");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("preview smoke orders route and public-host checks before private receipt generation and final gate", () => {
  execFileSync("bash", ["-n", smokeScript], { cwd: repoRoot, stdio: "pipe" });
  const source = readFileSync(smokeScript, "utf8");
  const lastSignedOutBoundaryCheck = source.indexOf('check_signed_out_boundary "/publishing" "auth-boundary.publishing"');
  const signedInJourney = source.indexOf('node "${REPO_ROOT}/scripts/quipsly-firebase-auth-smoke.mjs"');
  const publicHostLoop = source.indexOf('check_public_host "${configured_host}"');
  const receiptCreation = source.indexOf('"${REPO_ROOT}/scripts/release/quipsly-create-smoke-receipt.mjs"');
  const finalGate = source.indexOf('"${TARGET_URL}/api/beta-readiness"');

  assert.ok(lastSignedOutBoundaryCheck >= 0);
  assert.ok(signedInJourney > lastSignedOutBoundaryCheck);
  assert.ok(publicHostLoop > signedInJourney);
  assert.ok(receiptCreation > publicHostLoop);
  assert.ok(finalGate > receiptCreation);
  assert.match(source, /configured_hosts_csv}" != "\$\{expected_hosts_csv/);
  assert.match(source, /--config "\$\{receipt_curl_config\}"/);
  assert.match(source, /grep -Fqi -- "\$\{required_marker\}"/);
  assert.match(source, /check_json_endpoint "\/api\/mac\/firebase-client-config"/);
  assert.match(source, /QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="\$\{QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY:-\$\{candidate_firebase_api_key\}\}"/);
  assert.match(source, /One source\. Many native outputs\./);
  assert.match(source, /unset receipt_token/);
  assert.match(source, /"auth\.signed-in-journey"/);
  assert.doesNotMatch(source, /check_json_endpoint "\/api\/beta-readiness"/);
  assert.doesNotMatch(source, /echo[^\n]*receipt_token/);
  assert.doesNotMatch(source, /set -x/);
});

test("preview smoke fails before network work when its receipt secret is absent", () => {
  const result = spawnSync("bash", [smokeScript, "https://preview.invalid"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "QUIPSLY_RELEASE_SMOKE_SECRET"),
    ),
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /QUIPSLY_RELEASE_SMOKE_SECRET is required/);
  assert.doesNotMatch(result.stdout, /qsr1\./);
  assert.doesNotMatch(result.stderr, /qsr1\./);
});
