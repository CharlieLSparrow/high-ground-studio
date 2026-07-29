#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

python3 - "$BASE_URL" <<'PY'
import json
import os
import sys
import time
import urllib.parse
import urllib.request

base = sys.argv[1].rstrip("/")
target_nest = os.environ.get("QUIPSLY_NATIVE_SMOKE_BASE_URL", "https://nest.quipsly.com")
smoke_email = os.environ.get("QUIPSLY_NATIVE_SMOKE_EMAIL") or os.environ.get("QUIPSLY_AUTH_SMOKE_EMAIL") or ""
smoke_password = os.environ.get("QUIPSLY_NATIVE_SMOKE_PASSWORD") or os.environ.get("QUIPSLY_AUTH_SMOKE_PASSWORD") or ""

def get_json(path, timeout=5):
    with urllib.request.urlopen(base + path, timeout=timeout) as response:
        body = response.read().decode("utf-8", errors="replace")
    return json.loads(body)

def fail(message, payload=None):
    print(json.dumps({"ok": False, "error": message, "payload": payload}, indent=2, sort_keys=True))
    raise SystemExit(1)

def command(path, values):
    query = urllib.parse.urlencode(values)
    return get_json(f"{path}?{query}")

def wait_for_drain(timeout=8):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = get_json("/state")
        if last.get("agentPendingCommandCount") == 0:
            return last
        time.sleep(0.25)
    return last or {}

def wait_for_native_account(predicate, timeout=24):
    deadline = time.time() + timeout
    last_state = {}
    last_account = {}
    while time.time() < deadline:
        last_state = get_json("/state")
        last_account = last_state.get("nativeAccount") or {}
        if predicate(last_state, last_account):
            return last_state, last_account
        time.sleep(0.5)
    return last_state, last_account

def assert_receipt_safe(receipt):
    values = receipt.get("values") or {}
    for key, value in values.items():
        lowered = str(key).lower()
        sensitive = (
            "password" in lowered
            or "token" in lowered
            or "secret" in lowered
            or "cookie" in lowered
            or "authorization" in lowered
            or "private" in lowered
            or "credential" in lowered
            or ("api" in lowered and "key" in lowered)
        )
        if sensitive and value != "[redacted]":
            fail("Agent receipt exposed a sensitive command value", {"key": key, "value": value})

health = get_json("/health")
if health.get("status") != "ok":
    fail("Agent health failed", health)

workbench_command = get_json("/left_workbench?mode=account")
if workbench_command.get("status") != "left_workbench_commanded":
    fail("Account workbench command was not accepted", workbench_command)

time.sleep(1.2)
state = get_json("/state")
receipt = state.get("agentLastCommandReceipt") or {}
native_account = state.get("nativeAccount")

if state.get("leftWorkbenchMode") != "account":
    fail("Account workbench did not become active", {
        "leftWorkbenchMode": state.get("leftWorkbenchMode"),
        "receipt": receipt,
    })

if state.get("agentPendingCommandCount") != 0:
    fail("Agent command queue did not drain", {
        "pending": state.get("agentPendingCommandCount"),
        "receipt": receipt,
    })

if receipt.get("status") != "handled_by_editor_loop":
    fail("Account command did not reach handled receipt", receipt)
assert_receipt_safe(receipt)

if not isinstance(native_account, dict):
    fail("nativeAccount state is missing", native_account)

for unsafe in ("password", "token", "cookie", "secret", "privateKey", "idToken", "refreshToken"):
    for key in native_account.keys():
        if unsafe.lower() in str(key).lower() and key != "passwordPresent":
            fail("nativeAccount exposes an unsafe-looking key", {"key": key})

required = [
    "baseURL",
    "configuredEmailPresent",
    "hasSavedSession",
    "isVerified",
    "homeNestSlug",
    "freeTierStatus",
    "visibleProjectCount",
    "statusMessage",
    "truth",
]
missing = [key for key in required if key not in native_account]
if missing:
    fail("nativeAccount is missing required proof fields", {"missing": missing, "nativeAccount": native_account})

def accepted_agent_command(response, expected_status):
    return response.get("status") in (
        expected_status,
        "queued_for_view_drain",
        "scheduled_for_editor_main_actor",
        "scheduled_for_editor_main_queue",
    )

redaction_probe = command("/native_account", {
    "action": "status",
    "password": "redaction-probe-only",
})
if not accepted_agent_command(redaction_probe, "native_account_commanded"):
    fail("Native account redaction probe command was not accepted", redaction_probe)
time.sleep(0.6)
state = wait_for_drain()
receipt = state.get("agentLastCommandReceipt") or {}
assert_receipt_safe(receipt)
native_account = state.get("nativeAccount") or {}
if native_account.get("passwordPresent") is True:
    fail("Native account status/redaction probe incorrectly stored password input", native_account)

config_command = command("/native_account", {
    "action": "config",
    "base_url": target_nest,
    "email": smoke_email,
})
if not accepted_agent_command(config_command, "native_account_commanded"):
    fail("Native account config command was not accepted", config_command)
time.sleep(1.2)
state = wait_for_drain()
receipt = state.get("agentLastCommandReceipt") or {}
assert_receipt_safe(receipt)
native_account = state.get("nativeAccount") or {}
if state.get("leftWorkbenchMode") != "account":
    fail("Native account command did not keep Account workbench active", state)
if native_account.get("baseURL") != target_nest.rstrip("/"):
    fail("Native account base URL did not update", native_account)
if native_account.get("passwordPresent") is True:
    fail("Native account command left a password present after config check", native_account)

credentialed = bool(smoke_email and smoke_password)
credential_result = {
    "credentialed": credentialed,
    "truth": "Set QUIPSLY_NATIVE_SMOKE_EMAIL and QUIPSLY_NATIVE_SMOKE_PASSWORD to prove native Firebase sign-in and saved-session refresh without printing secrets.",
}
cleared_after = False

if credentialed:
    sign_in = command("/native_account", {
        "action": "sign_in",
        "base_url": target_nest,
        "email": smoke_email,
        "password": smoke_password,
    })
    if not accepted_agent_command(sign_in, "native_account_commanded"):
        fail("Native account sign-in command was not accepted", sign_in)

    state, native_account = wait_for_native_account(
        lambda _state, account: (
            account.get("hasSavedSession")
            and account.get("isVerified")
            and account.get("homeNestSlug")
            and account.get("freeTierStatus") == "ACTIVE"
            and not account.get("isBusy")
        ),
        timeout=30,
    )

    receipt = state.get("agentLastCommandReceipt") or {}
    assert_receipt_safe(receipt)
    if native_account.get("passwordPresent") is True:
        fail("Native account sign-in left passwordPresent true", native_account)
    if not native_account.get("hasSavedSession"):
        fail("Native account did not save a refresh session", native_account)
    if not native_account.get("isVerified"):
        fail("Native account did not verify with Nest", native_account)
    if not native_account.get("homeNestSlug"):
        fail("Native account did not receive Home Nest truth", native_account)
    if native_account.get("freeTierStatus") != "ACTIVE":
        fail("Native account did not receive active free-tier truth", native_account)

    saved = command("/native_account", {
        "action": "check_saved",
        "base_url": target_nest,
        "email": smoke_email,
    })
    if not accepted_agent_command(saved, "native_account_commanded"):
        fail("Native account saved-session command was not accepted", saved)

    state, native_account = wait_for_native_account(
        lambda _state, account: (
            account.get("isVerified")
            and account.get("homeNestSlug")
            and account.get("freeTierStatus") == "ACTIVE"
            and not account.get("isBusy")
        ),
        timeout=30,
    )

    receipt = state.get("agentLastCommandReceipt") or {}
    assert_receipt_safe(receipt)
    if not native_account.get("isVerified"):
        fail("Native saved-session refresh did not verify", native_account)
    verified_native_account = dict(native_account)

    if os.environ.get("QUIPSLY_NATIVE_SMOKE_CLEAR_AFTER") == "1":
        clear_values = {
            "action": "clear",
            "base_url": target_nest,
            "email": smoke_email,
        }
        if os.environ.get("QUIPSLY_NATIVE_SMOKE_CLEAR_EMAIL_AFTER") == "1":
            clear_values["clear_email"] = "1"
        clear = command("/native_account", clear_values)
        if not accepted_agent_command(clear, "native_account_commanded"):
            fail("Native account clear command was not accepted", clear)

        state, native_account = wait_for_native_account(
            lambda _state, account: (
                not account.get("hasSavedSession")
                and not account.get("isBusy")
                and _state.get("agentPendingCommandCount") == 0
            ),
            timeout=18,
        )

        receipt = state.get("agentLastCommandReceipt") or {}
        assert_receipt_safe(receipt)
        if native_account.get("hasSavedSession"):
            fail("Native account clear did not remove saved session", native_account)
        cleared_after = True

    credential_result = {
        "credentialed": True,
        "hasSavedSession": verified_native_account.get("hasSavedSession"),
        "isVerified": verified_native_account.get("isVerified"),
        "homeNestSlug": verified_native_account.get("homeNestSlug"),
        "freeTierStatus": verified_native_account.get("freeTierStatus"),
        "visibleProjectCount": verified_native_account.get("visibleProjectCount"),
        "clearedAfter": cleared_after,
        "truth": "Native Firebase email/password sign-in and saved-session refresh both verified through Nest without printing secrets.",
    }

print(json.dumps({
    "ok": True,
    "baseURL": native_account.get("baseURL"),
    "leftWorkbenchMode": state.get("leftWorkbenchMode"),
    "pending": state.get("agentPendingCommandCount"),
    "receiptStatus": receipt.get("status"),
    "nativeAccount": {
        "configuredEmailPresent": native_account.get("configuredEmailPresent"),
        "hasSavedSession": native_account.get("hasSavedSession"),
        "isVerified": native_account.get("isVerified"),
        "homeNestSlug": native_account.get("homeNestSlug"),
        "freeTierStatus": native_account.get("freeTierStatus"),
        "visibleProjectCount": native_account.get("visibleProjectCount"),
        "statusMessage": native_account.get("statusMessage"),
    },
    "credentialedSmoke": credential_result,
    "truth": "Native Account workbench opens, drains through the editor loop, and exposes redacted account readiness state.",
}, indent=2, sort_keys=True))
PY
