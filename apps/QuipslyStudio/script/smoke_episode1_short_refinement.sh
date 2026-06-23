#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 - "$SCRIPT_DIR" <<'PY'
import json
import math
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

script_dir = sys.argv[1]
agentctl = os.path.join(script_dir, "agentctl.sh")


def discover_base_url() -> str:
    if os.environ.get("QUIPSLY_AGENT_URL"):
        return os.environ["QUIPSLY_AGENT_URL"].rstrip("/")
    for port in (8080, 8765, 8766):
        base = f"http://127.0.0.1:{port}"
        try:
            with urllib.request.urlopen(base + "/health", timeout=1.5) as response:
                payload = json.loads(response.read().decode("utf-8", errors="replace"))
            if payload.get("status") == "ok":
                return base
        except Exception:
            continue
    return "http://127.0.0.1:8080"


base_url = discover_base_url()


def get(path: str) -> dict:
    with urllib.request.urlopen(base_url + path, timeout=15) as response:
        return json.loads(response.read().decode("utf-8", errors="replace"))


def run_agentctl(*args: str) -> dict:
    output = subprocess.check_output([agentctl, *args], text=True, timeout=20)
    return json.loads(output)


def clips() -> list[dict]:
    payload = get("/shorts_queue")
    return payload.get("clips") or []


def clip_by_id(clip_id: str) -> dict:
    for clip in clips():
        if clip.get("id") == clip_id:
            return clip
    raise RuntimeError(f"Selected short disappeared from queue: {clip_id}")


def close_enough(actual: float, expected: float) -> bool:
    return math.isclose(float(actual), float(expected), abs_tol=0.001)


def wait_for_value(clip_id: str, field: str, expected: float) -> dict:
    last = None
    for _ in range(120):
        current = clip_by_id(clip_id)
        last = current.get(field)
        if close_enough(last, expected):
            return current
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {field}={expected}; last={last}")


select_index = os.environ.get("QUIPSLY_SHORT_REFINEMENT_INDEX", "2")
select_payload = run_agentctl("shorts-select", "index", select_index)
time.sleep(0.5)
initial_clips = clips()
if not initial_clips:
    raise RuntimeError("No short recipes are available in /shorts_queue.")

selection_projection = select_payload.get("selectionProjection") or {}
target_id_hint = selection_projection.get("id")
target = None
if target_id_hint:
    target = next((clip for clip in initial_clips if clip.get("id") == target_id_hint), None)
if target is None:
    candidates = [
        clip
        for clip in initial_clips
        if float(clip.get("startTime", 0) or 0) > 1
        and float(clip.get("endTime", 0) or 0) - float(clip.get("startTime", 0) or 0) > 5
    ]
    target = candidates[0] if candidates else initial_clips[0]
    run_agentctl("shorts-select", "id", str(target["id"]))

target_id = target["id"]
target_title = target.get("title", "Untitled short")
original_start = float(target.get("startTime", 0))
original_end = float(target.get("endTime", original_start + float(target.get("duration", 0))))
if original_end <= original_start + 0.5:
    raise RuntimeError(f"Target short is too short to nudge safely: {target_title}")

changes = []

try:
    run_agentctl("shorts-nudge-selected", "start", "0.1")
    changed = wait_for_value(target_id, "startTime", original_start + 0.1)
    changes.append({
        "operation": "nudge-start",
        "before": original_start,
        "after": changed.get("startTime"),
    })

    run_agentctl("shorts-nudge-selected", "start", "-0.1")
    restored = wait_for_value(target_id, "startTime", original_start)
    changes.append({
        "operation": "restore-start",
        "after": restored.get("startTime"),
    })

    run_agentctl("shorts-nudge-selected", "end", "-0.1")
    changed = wait_for_value(target_id, "endTime", original_end - 0.1)
    changes.append({
        "operation": "nudge-end",
        "before": original_end,
        "after": changed.get("endTime"),
    })

    run_agentctl("shorts-nudge-selected", "end", "0.1")
    restored = wait_for_value(target_id, "endTime", original_end)
    changes.append({
        "operation": "restore-end",
        "after": restored.get("endTime"),
    })
except Exception:
    # Best-effort restoration keeps the smoke safe even when the endpoint regresses mid-test.
    try:
        run_agentctl("shorts-set-selected", "start", str(original_start))
        run_agentctl("shorts-set-selected", "end", str(original_end))
    except Exception:
        pass
    raise

final_clip = clip_by_id(target_id)
if not close_enough(final_clip.get("startTime"), original_start):
    raise RuntimeError("Start was not restored after smoke test.")
if not close_enough(final_clip.get("endTime"), original_end):
    raise RuntimeError("End was not restored after smoke test.")

print(json.dumps({
    "ok": True,
    "baseUrl": base_url,
    "selected": {
        "id": target_id,
        "title": target_title,
        "startTime": original_start,
        "endTime": original_end,
        "duration": target.get("duration"),
        "reviewStatus": target.get("reviewStatus"),
        "exportStatus": target.get("exportStatus"),
    },
    "selectPayloadStatus": select_payload.get("status"),
    "changes": changes,
    "truth": "Short refinement changed and restored recipe metadata only; source media remains untouched.",
}, indent=2, sort_keys=True))
PY
