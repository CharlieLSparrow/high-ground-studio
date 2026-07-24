#!/usr/bin/env bash
set -euo pipefail

device_name="${1:-iPhone 17 Pro}"
os_version="${2:-26.2}"

simulator_udid="$(
  node - "${device_name}" "${os_version}" <<'NODE'
const { execFileSync } = require("node:child_process");

const deviceName = process.argv[2];
const osVersion = process.argv[3];
const runtimeSuffix = `iOS-${osVersion.replaceAll(".", "-")}`;
const payload = JSON.parse(execFileSync(
  "xcrun",
  ["simctl", "list", "devices", "available", "--json"],
  { encoding: "utf8" },
));
const candidates = Object.entries(payload.devices ?? {})
  .filter(([runtime]) => runtime.endsWith(runtimeSuffix))
  .flatMap(([, devices]) => Array.isArray(devices) ? devices : [])
  .filter((device) => device?.name === deviceName && device?.isAvailable !== false);

if (candidates.length !== 1 || !/^[0-9A-F-]{36}$/i.test(String(candidates[0]?.udid ?? ""))) {
  process.stderr.write(
    `Expected one available ${deviceName} on iOS ${osVersion}; found ${candidates.length}.\n`,
  );
  process.exit(1);
}
process.stdout.write(candidates[0].udid);
NODE
)"

if [[ ! "${simulator_udid}" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  echo "FAIL Invalid simulator identity." >&2
  exit 1
fi

# The first cold launch of Safari on a fresh hosted runner can exceed XCTest's
# launch timeout even though later launches pass. Boot the exact pinned
# destination and launch Safari once before the serial suite; assertions still
# exercise the real Share Sheet and Quipsly extension in every test.
xcrun simctl boot "${simulator_udid}" >/dev/null 2>&1 || true
xcrun simctl bootstatus "${simulator_udid}" -b
xcrun simctl launch "${simulator_udid}" com.apple.mobilesafari >/dev/null

echo "PASS Prewarmed Safari on ${device_name} iOS ${os_version} (${simulator_udid})."
