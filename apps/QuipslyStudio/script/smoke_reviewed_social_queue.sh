#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_REVIEWED_SOCIAL_QUEUE_SMOKE_SESSION:-episode-3-premiere-rescue}"
TITLE="Codex reviewed social queue smoke"
TMP_ROOT="${TMPDIR:-/tmp}/quipsly-reviewed-social-queue-smoke"
OUT_DIR="$TMP_ROOT/output"
rm -rf "$TMP_ROOT"
mkdir -p "$OUT_DIR"

"$ROOT_DIR/script/agentctl.sh" health >/dev/null

python3 - "$BASE_URL" "$SESSION_NAME" "$TITLE" "$OUT_DIR" "$ROOT_DIR" <<'PY'
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

base_url, session_name, title, output_dir, root_dir = sys.argv[1:]
created_id = ""


def get_json(path, timeout=30):
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path, timeout=30):
    return get_json(path, timeout=timeout)


def wait_for(predicate, timeout=30, interval=0.25):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def cleanup():
    if created_id:
        try:
            command("/shorts_queue_remove?id=" + urllib.parse.quote(created_id))
        except Exception as error:
            print(f"Warning: could not remove temporary short {created_id}: {error}", file=sys.stderr)


try:
    command("/load_session?name=" + urllib.parse.quote(session_name))
    state = wait_for(lambda s: s.get("activeSessionName") == session_name and s.get("laneCount", 0) > 0, timeout=40)
    if state.get("activeSessionName") != session_name:
        raise SystemExit(f"session did not load: active={state.get('activeSessionName')}")

    queue = command("/shorts_queue")
    for clip in queue.get("clips") or []:
        if clip.get("title") == title and clip.get("id"):
            command("/shorts_queue_remove?id=" + urllib.parse.quote(clip["id"]))

    command("/shorts_queue_add_range?start=420&end=432&title=" + urllib.parse.quote(title))
    command("/shorts_queue_select?title=" + urllib.parse.quote(title))
    state = wait_for(lambda s: (s.get("selectedShortClip") or {}).get("title") == title)
    selected = state.get("selectedShortClip") or {}
    created_id = selected.get("id") or ""
    if not created_id:
        raise SystemExit("temporary reviewed-social smoke short was not created")

    command("/shorts_queue_update_selected?field=review_status&value=keep")
    command("/shorts_queue_update_selected?field=notes&value=" + urllib.parse.quote("Smoke proves reviewed shorts can become a social publication queue."))
    state = wait_for(lambda s: (s.get("selectedShortClip") or {}).get("reviewStatus") == "keep")
    if (state.get("selectedShortClip") or {}).get("reviewStatus") != "keep":
        raise SystemExit(f"temporary short did not become keep: {state.get('selectedShortClip')}")

    result = subprocess.run(
        [
            str(Path(root_dir) / "script" / "build_reviewed_social_queue.py"),
            "--session", session_name,
            "--output", output_dir,
            "--basename", "smoke-reviewed",
            "--episode-title", "Smoke Episode",
            "--include-status", "keep",
            "--agent-url", base_url,
            "--wait-seconds", "30",
            "--export-timeout", "240",
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise SystemExit(f"reviewed social queue failed: {result.stderr or result.stdout}")
    payload = json.loads(result.stdout)
    manifest_path = Path(payload.get("manifestPath") or "")
    if not manifest_path.exists():
        raise SystemExit(f"manifest missing: {payload}")
    manifest = json.loads(manifest_path.read_text())
    clips = manifest.get("clips") or []
    matching = [clip for clip in clips if clip.get("title") == title]
    if not matching:
        raise SystemExit(f"smoke short missing from manifest: {manifest_path}")
    exported = Path(matching[0].get("clipPath") or "")
    if not exported.exists() or exported.stat().st_size <= 0:
        raise SystemExit(f"exported clip missing or empty: {exported}")

    print(json.dumps({
        "status": "pass",
        "session": session_name,
        "manifestPath": str(manifest_path),
        "exportedClip": str(exported),
        "clipCount": manifest.get("clipCount"),
        "temporaryShortId": created_id,
        "truth": "Reviewed keep-status native shorts can be rendered into a social publication queue without changing source media or edit decisions."
    }, indent=2, sort_keys=True))
finally:
    cleanup()
PY
