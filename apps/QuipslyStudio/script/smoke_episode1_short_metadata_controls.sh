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
    output = subprocess.check_output([agentctl, *args], text=True, timeout=25)
    return json.loads(output)


def clips() -> list[dict]:
    return get("/shorts_queue").get("clips") or []


def state() -> dict:
    return get("/state")


def clip_by_id(clip_id: str) -> dict:
    for clip in clips():
        if clip.get("id") == clip_id:
            return clip
    raise RuntimeError(f"Short disappeared from queue: {clip_id}")


def close_enough(actual: float, expected: float, tolerance: float = 0.75) -> bool:
    return math.isclose(float(actual), float(expected), abs_tol=tolerance)


def wait_for_clip_field(clip_id: str, field: str, expected) -> dict:
    last = None
    for _ in range(120):
        current = clip_by_id(clip_id)
        last = current.get(field)
        if last == expected:
            return current
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {field}={expected!r}; last={last!r}")


def wait_for_playhead(expected: float) -> dict:
    last = None
    for _ in range(80):
        payload = state()
        last = payload.get("playhead")
        if last is not None and close_enough(float(last), expected):
            return payload
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for playhead near {expected}; last={last}")


select_index = os.environ.get("QUIPSLY_SHORT_METADATA_INDEX", "2")
select_payload = run_agentctl("shorts-select", "index", select_index)
projection = select_payload.get("selectionProjection") or {}
target_id = projection.get("id")
if not target_id:
    raise RuntimeError("shorts-select did not return a selectionProjection.id")

target = clip_by_id(target_id)
original_title = target.get("title") or "Untitled short"
target_start = float(target.get("startTime") or 0)
temporary_title = f"{original_title} [agent smoke rename]"
changes = []

try:
    run_agentctl("shorts-rename-selected", temporary_title)
    renamed = wait_for_clip_field(target_id, "title", temporary_title)
    changes.append({
        "operation": "rename",
        "after": renamed.get("title"),
    })

    run_agentctl("shorts-set-selected", "title", original_title)
    restored = wait_for_clip_field(target_id, "title", original_title)
    changes.append({
        "operation": "restore-title",
        "after": restored.get("title"),
    })

    away_time = target_start + 7.0
    run_agentctl("seek", str(away_time))
    wait_for_playhead(away_time)

    run_agentctl("shorts-cue-selected")
    cue_state = wait_for_playhead(target_start)
    changes.append({
        "operation": "cue-selected",
        "fromPlayhead": away_time,
        "expectedPlayhead": target_start,
        "actualPlayhead": cue_state.get("playhead"),
        "lastMediaAction": cue_state.get("lastMediaAction"),
    })
except Exception:
    try:
        run_agentctl("shorts-set-selected", "title", original_title)
    except Exception:
        pass
    raise

final_clip = clip_by_id(target_id)
if final_clip.get("title") != original_title:
    raise RuntimeError("Title was not restored after metadata smoke.")

print(json.dumps({
    "ok": True,
    "baseUrl": base_url,
    "selected": {
        "id": target_id,
        "title": original_title,
        "startTime": target_start,
        "duration": final_clip.get("duration"),
        "reviewStatus": final_clip.get("reviewStatus"),
        "exportStatus": final_clip.get("exportStatus"),
    },
    "changes": changes,
    "truth": "Short metadata controls updated and restored recipe metadata only; cue moved the shared editor playhead; source media remains untouched.",
}, indent=2, sort_keys=True))
PY
