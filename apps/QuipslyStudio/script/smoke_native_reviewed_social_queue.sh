#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_NATIVE_REVIEWED_SOCIAL_QUEUE_SESSION:-episode-3-premiere-rescue}"
TMP_ROOT="${TMPDIR:-/tmp}/quipsly-native-reviewed-social-queue-smoke"
OUT_DIR="$TMP_ROOT/output"
BASENAME="native-reviewed-smoke"
rm -rf "$TMP_ROOT"
mkdir -p "$OUT_DIR"

"$ROOT_DIR/script/agentctl.sh" health >/dev/null

python3 - "$BASE_URL" "$SESSION_NAME" "$OUT_DIR" "$BASENAME" <<'PY'
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

base_url, session_name, output_dir, basename = sys.argv[1:]


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


command("/load_session?name=" + urllib.parse.quote(session_name))
state = wait_for(lambda s: s.get("activeSessionName") == session_name and s.get("laneCount", 0) > 0, timeout=40)
if state.get("activeSessionName") != session_name:
    raise SystemExit(f"session did not load: active={state.get('activeSessionName')}")

counts = state.get("shortReviewCounts") or {}
keep_count = int(counts.get("keep") or 0)
if keep_count < 1:
    raise SystemExit("native reviewed queue smoke needs at least one short marked Keep")

command(
    "/reviewed_social_queue_generate?directory="
    + urllib.parse.quote(output_dir)
    + "&basename="
    + urllib.parse.quote(basename)
)
state = wait_for(
    lambda s: (s.get("socialPublicationQueue") or {}).get("status") in {"generated", "failed", "blocked"},
    timeout=30,
)
queue = state.get("socialPublicationQueue") or {}
if queue.get("status") != "generated":
    raise SystemExit(f"native reviewed queue did not generate: {queue}")

queue_path = Path(queue.get("outputPath") or "")
manifest_path = queue_path / f"{basename}-reviewed-social-queue.json"
if not manifest_path.exists():
    raise SystemExit(f"manifest missing: {manifest_path}")
manifest = json.loads(manifest_path.read_text())
clips = manifest.get("clips") or []
if manifest.get("model") != "quipsly-reviewed-social-publication-queue":
    raise SystemExit(f"wrong manifest model: {manifest.get('model')}")
if manifest.get("clipCount") != keep_count:
    raise SystemExit(f"clip count mismatch: manifest={manifest.get('clipCount')} keep={keep_count}")
for clip in clips:
    if clip.get("reviewStatus") != "keep":
        raise SystemExit(f"non-keep clip leaked into reviewed queue: {clip}")
    path = Path(clip.get("clipPath") or "")
    if not path.exists() or path.stat().st_size <= 0:
        raise SystemExit(f"copied derivative short missing or empty: {path}")

print(json.dumps({
    "status": "pass",
    "session": session_name,
    "keepCount": keep_count,
    "manifestPath": str(manifest_path),
    "queuePath": str(queue_path),
    "clipTitles": [clip.get("title") for clip in clips],
    "truth": "The native app endpoint generated a reviewed social queue from keep-status exported derivative shorts only."
}, indent=2, sort_keys=True))
PY
