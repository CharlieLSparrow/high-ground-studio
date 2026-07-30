#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-capture-launcher-smoke.XXXXXX")"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

"$ROOT_DIR/script/studioctl.sh" verify-app >"$WORK_DIR/app.txt"
"$ROOT_DIR/script/agentctl.sh" health >"$WORK_DIR/health.json"
"$ROOT_DIR/script/agentctl.sh" commands >"$WORK_DIR/commands.json"
"$ROOT_DIR/script/agentctl.sh" capture-open-setup >"$WORK_DIR/open.json"
"$ROOT_DIR/script/agentctl.sh" capture-status >"$WORK_DIR/status.json"
"$ROOT_DIR/script/agentctl.sh" state >"$WORK_DIR/editor-state.json"
sleep 0.6
"$ROOT_DIR/script/agentctl.sh" capture-status >"$WORK_DIR/status-after-editor-read.json"
"$ROOT_DIR/script/studioctl.sh" warn-duplicates >"$WORK_DIR/duplicates.txt"

python3 - \
  "$WORK_DIR/app.txt" \
  "$WORK_DIR/health.json" \
  "$WORK_DIR/commands.json" \
  "$WORK_DIR/open.json" \
  "$WORK_DIR/status.json" \
  "$WORK_DIR/status-after-editor-read.json" \
  "$WORK_DIR/duplicates.txt" <<'PY'
import json
import pathlib
import sys

app_path, health_path, commands_path, open_path, status_path, status_after_path, duplicates_path = sys.argv[1:]


def read_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


app_text = pathlib.Path(app_path).read_text(encoding="utf-8")
health = read_json(health_path)
commands = read_json(commands_path)
opened = read_json(open_path)
status = read_json(status_path)
status_after = read_json(status_after_path)
duplicates_text = pathlib.Path(duplicates_path).read_text(encoding="utf-8")

checks = {
    "canonicalBundleVerified": (
        "bundleId=com.highground.QuipslyMac" in app_text
        and "canonicalPids=" in app_text
    ),
    "agentHealthy": health.get("status") == "ok",
    "routesAdvertised": (
        "GET /capture_open_setup" in commands.get("commands", [])
        and "GET /capture_status" in commands.get("commands", [])
    ),
    "windowOpened": (
        opened.get("status") == "capture_setup_opened"
        and opened.get("windowCount") == 1
        and opened.get("windowVisible") is True
    ),
    "sideEffectBoundaryDeclared": (
        "does not request permission" in opened.get("truth", "")
        and "start recording" in opened.get("truth", "")
        and "upload" in opened.get("truth", "")
        and "publish" in opened.get("truth", "")
    ),
    "captureProjectionIsDurable": (
        status.get("projectTitle") == "Episode Capture Setup"
        and status_after.get("projectTitle") == "Episode Capture Setup"
        and status.get("projectionOwnership") == "episode-capture-setup"
        and status_after.get("projectionOwnership") == "episode-capture-setup"
        and status.get("captureStatusUrl")
            == "http://127.0.0.1:8080/capture_status"
        and status_after.get("captureStatusUrl")
            == "http://127.0.0.1:8080/capture_status"
        and status.get("capture", {}).get("availableInputs") is not None
        and all(
            int(route.get("inputChannels") or 0) > 0
            for route in status.get("capture", {}).get("availableInputs", [])
        )
        and status_after.get("capture", {}).get("captureGroupID")
            == status.get("capture", {}).get("captureGroupID")
        and status.get("capture", {}).get("availableOutputs") is not None
        and all(
            int(route.get("outputChannels") or 0) > 0
            for route in status.get("capture", {}).get("availableOutputs", [])
        )
        and status.get("capture", {}).get("availableVideoDevices") is not None
    ),
    "noDuplicateBundleRunning": (
        "warning=" not in duplicates_text
        and "noncanonicalPids=" in duplicates_text
    ),
}

failed = [name for name, passed in checks.items() if not passed]
receipt = {
    "schema": "quipsly-capture-setup-launcher-smoke-v1",
    "boundary": (
        "The exact signed Mac app exposes a visible human Capture action and "
        "a semantic setup launcher. Opening setup alone has no capture or "
        "external side effect."
    ),
    "checks": checks,
    "passed": not failed,
}
print(json.dumps(receipt, indent=2, sort_keys=True))
if failed:
    raise SystemExit("failed checks: " + ", ".join(failed))
PY
