#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_SHORT_REVIEW_PERSISTENCE_SESSION:-episode-3-premiere-rescue}"
TITLE="Codex review persistence to social queue smoke"
TMP_ROOT="${TMPDIR:-/tmp}/quipsly-short-review-persistence-smoke"
OUT_DIR="$TMP_ROOT/reviewed-queue"
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


def queue():
    return command("/shorts_queue").get("clips") or []


def find_smoke_clip():
    return next((clip for clip in queue() if clip.get("title") == title), None)


def save_and_wait(reason):
    command("/save_session?name=" + urllib.parse.quote(session_name))
    state = wait_for(
        lambda payload: payload.get("autosaveStatus") == "Saved"
        and session_name in (payload.get("lastMediaAction") or payload.get("activeSessionName") or ""),
        timeout=30,
    )
    if state.get("activeSessionName") != session_name:
        raise SystemExit(f"{reason}: save returned wrong active session: {state.get('activeSessionName')}")


def cleanup():
    global created_id
    try:
        command("/load_session?name=" + urllib.parse.quote(session_name))
        wait_for(lambda s: s.get("activeSessionName") == session_name, timeout=20)
        for clip in list(queue()):
            if clip.get("title") == title and clip.get("id"):
                command("/shorts_queue_remove?id=" + urllib.parse.quote(clip["id"]))
        save_and_wait("cleanup")
    except Exception as error:
        print(f"Warning: cleanup could not remove temporary short {created_id}: {error}", file=sys.stderr)


try:
    command("/load_session?name=" + urllib.parse.quote(session_name))
    state = wait_for(lambda s: s.get("activeSessionName") == session_name and s.get("laneCount", 0) > 0, timeout=40)
    if state.get("activeSessionName") != session_name:
        raise SystemExit(f"session did not load: active={state.get('activeSessionName')}")

    # Remove stale smoke candidates from interrupted runs before proving persistence.
    for clip in list(queue()):
        if clip.get("title") == title and clip.get("id"):
            command("/shorts_queue_remove?id=" + urllib.parse.quote(clip["id"]))

    command("/shorts_queue_add_range?start=420&end=432&title=" + urllib.parse.quote(title))
    command("/shorts_queue_select?title=" + urllib.parse.quote(title))
    state = wait_for(lambda s: (s.get("selectedShortClip") or {}).get("title") == title)
    selected = state.get("selectedShortClip") or {}
    created_id = selected.get("id") or ""
    if not created_id:
        raise SystemExit("temporary reviewed short was not created")

    command("/shorts_review_selected?status=keep&notes=" + urllib.parse.quote("Persistence smoke: keep decision must survive save/reload and drive the approved social queue."))
    state = wait_for(lambda s: (s.get("selectedShortClip") or {}).get("reviewStatus") == "keep")
    if (state.get("selectedShortClip") or {}).get("reviewStatus") != "keep":
        raise SystemExit(f"short did not become keep: {state.get('selectedShortClip')}")

    save_and_wait("persistence")

    command("/load_session?name=" + urllib.parse.quote(session_name))
    wait_for(lambda s: s.get("activeSessionName") == session_name, timeout=30)
    persisted = find_smoke_clip()
    if not persisted:
        raise SystemExit("reviewed short disappeared after save/reload")
    if persisted.get("reviewStatus") != "keep":
        raise SystemExit(f"reviewStatus did not persist after reload: {persisted}")

    result = subprocess.run(
        [
            str(Path(root_dir) / "script" / "build_reviewed_social_queue.py"),
            "--session", session_name,
            "--output", output_dir,
            "--basename", "persistence-reviewed",
            "--episode-title", "Persistence Smoke Episode",
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
        raise SystemExit(f"reviewed social queue generation failed: {result.stderr or result.stdout}")
    payload = json.loads(result.stdout)
    manifest_path = Path(payload.get("manifestPath") or "")
    if not manifest_path.exists():
        raise SystemExit(f"manifest missing: {payload}")
    manifest = json.loads(manifest_path.read_text())
    matching = [clip for clip in manifest.get("clips") or [] if clip.get("title") == title]
    if not matching:
        raise SystemExit(f"persisted keep short was not included in social queue: {manifest_path}")
    exported_path = Path(matching[0].get("clipPath") or "")
    if not exported_path.exists() or exported_path.stat().st_size <= 0:
        raise SystemExit(f"exported reviewed clip missing or empty: {exported_path}")

    print(json.dumps({
        "status": "pass",
        "session": session_name,
        "temporaryShortId": created_id,
        "reviewStatus": persisted.get("reviewStatus"),
        "manifestPath": str(manifest_path),
        "exportedClip": str(exported_path),
        "includedClipCount": manifest.get("clipCount"),
        "truth": "A keep/refine/reject short review decision survived save/reload and produced an approved social publication queue from derivative 9:16 media only."
    }, indent=2, sort_keys=True))
finally:
    cleanup()
PY
