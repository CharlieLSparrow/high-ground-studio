#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_REVIEW_DECISION_SMOKE_SESSION:-episode-3-premiere-rescue}"
TITLE="Codex review decision import smoke"
TMP_DIR="${TMPDIR:-/tmp}/quipsly-review-decision-import-smoke"
mkdir -p "$TMP_DIR"
DECISIONS_JSON="$TMP_DIR/review-shorts-decisions.json"

"$ROOT_DIR/script/agentctl.sh" health >/dev/null

python3 - "$BASE_URL" "$SESSION_NAME" "$TITLE" "$DECISIONS_JSON" "$ROOT_DIR" <<'PY'
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

base_url, session_name, title, decisions_path, root_dir = sys.argv[1:]
created_id = ""


def get_json(path, timeout=30):
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path, timeout=30):
    return get_json(path, timeout=timeout)


def wait_for(predicate, timeout=20, interval=0.25):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json('/state')
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def cleanup():
    global created_id
    if created_id:
        try:
            command('/shorts_queue_remove?id=' + urllib.parse.quote(created_id))
        except Exception as error:
            print(f"Warning: could not remove temporary short {created_id}: {error}", file=sys.stderr)

try:
    command('/load_session?name=' + urllib.parse.quote(session_name))
    state = wait_for(lambda s: s.get('activeSessionName') == session_name and s.get('laneCount', 0) > 0)
    if state.get('activeSessionName') != session_name:
        raise SystemExit(f"session did not load: active={state.get('activeSessionName')}")

    # Remove stale smoke candidates from interrupted runs.
    queue = command('/shorts_queue')
    for clip in queue.get('clips') or []:
        if clip.get('title') == title:
            command('/shorts_queue_remove?id=' + urllib.parse.quote(clip.get('id', '')))

    command('/shorts_queue_add_range?start=420&end=432&title=' + urllib.parse.quote(title))
    command('/shorts_queue_select?title=' + urllib.parse.quote(title))
    state = wait_for(lambda s: (s.get('selectedShortClip') or {}).get('title') == title)
    selected = state.get('selectedShortClip') or {}
    created_id = selected.get('id') or ''
    if not created_id:
        raise SystemExit('temporary short was not created/selected')

    payload = {
        'model': 'quipsly-review-shorts-decisions',
        'version': '2026-06-18.review-shorts-decisions.v1',
        'exportedAt': '2026-06-18T00:00:00Z',
        'sourceManifest': 'smoke-review-shorts-manifest.json',
        'decisions': [
            {
                'candidateId': f'{session_name}::{title}',
                'title': title,
                'status': 'keep',
                'notes': 'Smoke import proves review packet decisions can return to the native short queue.',
                'video': 'smoke.mp4',
                'updatedAt': '2026-06-18T00:00:00Z'
            }
        ]
    }
    Path(decisions_path).write_text(json.dumps(payload, indent=2))

    dry = subprocess.run(
        [str(Path(root_dir) / 'script' / 'import_review_short_decisions.py'), decisions_path],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if dry.returncode != 0:
        raise SystemExit(f'dry-run import failed: {dry.stderr or dry.stdout}')
    dry_payload = json.loads(dry.stdout)
    if dry_payload.get('plannedCount') != 1 or dry_payload.get('dryRun') is not True:
        raise SystemExit(f'dry-run import did not plan exactly one decision: {dry.stdout}')

    applied = subprocess.run(
        [str(Path(root_dir) / 'script' / 'import_review_short_decisions.py'), decisions_path, '--execute'],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if applied.returncode != 0:
        raise SystemExit(f'execute import failed: {applied.stderr or applied.stdout}')
    applied_payload = json.loads(applied.stdout)
    if applied_payload.get('appliedCount') != 1 or applied_payload.get('failedCount') != 0:
        raise SystemExit(f'execute import did not apply exactly one decision: {applied.stdout}')

    state = wait_for(
        lambda s: (s.get('selectedShortClip') or {}).get('title') == title
        and (s.get('selectedShortClip') or {}).get('reviewStatus') == 'keep'
        and 'Smoke import proves' in ((s.get('selectedShortClip') or {}).get('notes') or ''),
        timeout=20,
    )
    selected = state.get('selectedShortClip') or {}
    if selected.get('reviewStatus') != 'keep':
        raise SystemExit(f"reviewStatus was not imported: {selected}")
    if 'Smoke import proves' not in (selected.get('notes') or ''):
        raise SystemExit(f"notes were not imported: {selected}")

    print(json.dumps({
        'status': 'pass',
        'session': session_name,
        'temporaryShortId': created_id,
        'reviewStatus': selected.get('reviewStatus'),
        'truth': 'Review decisions import updates short recipe review fields only; source media and timeline decisions remain untouched.'
    }, indent=2, sort_keys=True))
finally:
    cleanup()
PY
