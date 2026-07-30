#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTCTL="$ROOT_DIR/script/agentctl.sh"
BASE_URL="$("$AGENTCTL" agent-url)"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-native-account-smoke.XXXXXX")"
APP_BUNDLE="$ROOT_DIR/DerivedData/Build/Products/Debug/QuipslyMac.app"
EXPECTED_KEYCHAIN_GROUP="585GUXMY5M.com.highground.QuipslyMac"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

codesign -d --entitlements :- "$APP_BUNDLE" \
  >"$WORK_DIR/app-entitlements.plist" 2>/dev/null
actual_keychain_group="$(
  /usr/libexec/PlistBuddy \
    -c "Print :keychain-access-groups:0" \
    "$WORK_DIR/app-entitlements.plist" 2>/dev/null || true
)"

"$AGENTCTL" health >"$WORK_DIR/health.json"
"$AGENTCTL" commands >"$WORK_DIR/commands.json"
"$AGENTCTL" native-account status >"$WORK_DIR/status.json"
"$AGENTCTL" state >"$WORK_DIR/state.json"

denied_status="$(
  curl \
    --silent \
    --show-error \
    --output "$WORK_DIR/denied.json" \
    --write-out '%{http_code}' \
    "$BASE_URL/native_account?action=clear"
)"

set +e
"$AGENTCTL" native-account clear \
  >"$WORK_DIR/unsafe-cli.stdout" \
  2>"$WORK_DIR/unsafe-cli.stderr"
unsafe_cli_status=$?
set -e

python3 - \
  "$WORK_DIR/health.json" \
  "$WORK_DIR/commands.json" \
  "$WORK_DIR/status.json" \
  "$WORK_DIR/state.json" \
  "$WORK_DIR/denied.json" \
  "$WORK_DIR/unsafe-cli.stderr" \
  "$denied_status" \
  "$unsafe_cli_status" \
  "$actual_keychain_group" \
  "$EXPECTED_KEYCHAIN_GROUP" <<'PY'
import json
import pathlib
import sys

(
    health_path,
    commands_path,
    status_path,
    state_path,
    denied_path,
    unsafe_cli_stderr_path,
    denied_status,
    unsafe_cli_status,
    actual_keychain_group,
    expected_keychain_group,
) = sys.argv[1:]


def read_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def collect_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from collect_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from collect_keys(child)


health = read_json(health_path)
commands = read_json(commands_path)
status = read_json(status_path)
state = read_json(state_path)
denied = read_json(denied_path)
unsafe_cli_stderr = pathlib.Path(unsafe_cli_stderr_path).read_text(
    encoding="utf-8"
).strip()

expected_route = "GET /native_account?action=status|google|check_saved"
command_list = commands.get("commands", [])
native_account = state.get("nativeAccount")
forbidden_secret_keys = {
    "password",
    "token",
    "idToken",
    "accessToken",
    "customToken",
    "refreshToken",
    "handoffCode",
    "pkceVerifier",
}
observed_keys = set(collect_keys({"status": status, "nativeAccount": native_account}))

checks = {
    "dataProtectionKeychainEntitled": (
        actual_keychain_group == expected_keychain_group
    ),
    "agentHealthy": health.get("status") == "ok",
    "routeAdvertised": expected_route in command_list,
    "statusCommandAcknowledged": (
        status.get("status") == "native_account_commanded"
        and status.get("action") == "status"
    ),
    "redactedStatePresent": (
        isinstance(native_account, dict)
        and isinstance(native_account.get("hasSavedSession"), bool)
        and isinstance(native_account.get("isVerified"), bool)
        and isinstance(native_account.get("passwordPresent"), bool)
    ),
    "noSecretValuesExposed": forbidden_secret_keys.isdisjoint(observed_keys),
    "unsafeHttpActionDenied": (
        denied_status == "400"
        and denied.get("error") == "native_account_action_not_allowed"
        and denied.get("allowedActions") == ["check_saved", "google", "status"]
    ),
    "unsafeCliActionDenied": (
        unsafe_cli_status == "2"
        and "accepts only status, google, or check-saved" in unsafe_cli_stderr
    ),
}

failed = [name for name, passed in checks.items() if not passed]
receipt = {
    "schema": "quipsly-native-account-control-smoke-v1",
    "boundary": (
        "The canonical local AgentServer may start Google handoff or inspect "
        "redacted session state, but it cannot receive credentials, expose "
        "tokens, or perform destructive account actions."
    ),
    "baseURL": health.get("agentManualUrl", "").removesuffix("/agent_manual"),
    "checks": checks,
    "passed": not failed,
}
print(json.dumps(receipt, indent=2, sort_keys=True))
if failed:
    raise SystemExit("failed checks: " + ", ".join(failed))
PY
