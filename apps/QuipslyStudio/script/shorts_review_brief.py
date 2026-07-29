#!/usr/bin/env python3
"""Compact current-short review brief for Quipsly Studio.

This is an agent/human cockpit card, not an edit engine. It reads live editor
state plus local refinement-queue evidence and explains the next safe review
move without approving, exporting, publishing, or mutating media.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8080"
DEFAULT_QUEUE_PATH = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/shorts-command-room/"
    "cut-quality-refinement-queue/quipsly-studio-shorts-cut-quality-refinement-queue.json"
)


def fetch_json(base_url: str, path: str, timeout: float = 4.0) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    with urllib.request.urlopen(url, timeout=timeout) as response:
        payload = response.read().decode("utf-8", errors="replace")
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object from {path}")
    return data


def read_json_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "status": "missing",
            "truth": "Missing local refinement queue. No review, export, publication, or receipt state is implied.",
            "items": [],
        }
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {"status": "invalid", "items": []}


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value
    return str(value)


def number(value: Any, fallback: float = 0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def active_episode_number(session_name: str) -> int | None:
    match = re.search(r"episode[-_ ]?0*([0-9]+)", session_name.lower())
    if not match:
        return None
    try:
        return int(match.group(1))
    except Exception:
        return None


def short_label(short_id: str) -> str:
    return short_id if short_id else "selected-short"


def queue_scope(queue: dict[str, Any], active_episode: int | None) -> dict[str, Any]:
    items = queue.get("items") if isinstance(queue.get("items"), list) else []
    normalized: list[dict[str, Any]] = [item for item in items if isinstance(item, dict)]
    matching = [
        item for item in normalized
        if active_episode is not None and int(number(item.get("episode"), -1)) == active_episode
    ]
    visible = matching if matching else normalized
    return {
        "status": queue.get("status") or "available",
        "queuePath": str(DEFAULT_QUEUE_PATH),
        "totalTargets": len(normalized),
        "activeEpisode": active_episode,
        "mode": "current-episode" if matching else "global",
        "visibleTargets": [
            {
                "episode": int(number(item.get("episode"), 0)),
                "shortId": text(item.get("shortId") or item.get("id")),
                "title": text(item.get("title")),
                "lane": text(item.get("lane")),
                "score": int(number(item.get("score"), 0)),
                "readinessLevel": text(item.get("readinessLevel")),
                "craftFocus": item.get("craftFocus") if isinstance(item.get("craftFocus"), list) else [],
                "nextSafestAction": text(item.get("nextSafestAction")),
            }
            for item in visible[:3]
        ],
    }


def selected_short_from_state(state: dict[str, Any]) -> dict[str, Any]:
    selected = state.get("selectedShortClip")
    return selected if isinstance(selected, dict) else {}


def build_payload(base_url: str, queue_path: Path) -> dict[str, Any]:
    state = fetch_json(base_url, "/state")
    try:
        quality = fetch_json(base_url, "/selected_short_quality")
    except Exception as exc:
        quality = {
            "status": "selected_short_quality_unavailable",
            "error": str(exc),
            "truth": "Could not read selected-short quality. State readback may still identify the selected short.",
        }

    queue = read_json_file(queue_path)
    session_name = text(state.get("activeSessionName"))
    active_episode = active_episode_number(session_name)
    selected = selected_short_from_state(state)
    selected_id = text(quality.get("selectedShortId") or state.get("selectedShortClipId") or selected.get("id"))
    selected_title = text(quality.get("title") or selected.get("title"))
    duration = number(quality.get("recipeDuration") or selected.get("recipeDuration") or selected.get("duration"), 0)
    next_review_action = text(quality.get("nextReviewAction"))
    next_safe_action = text(quality.get("nextSafeAction"))
    if not next_review_action:
        next_review_action = "Select a short with script/agentctl.sh shorts-review-next, then rerun this brief."
    if not next_safe_action:
        next_safe_action = "Review selected short before Keep, Refine, Reject, export, or publication handoff."

    checklist = quality.get("reviewChecklist") if isinstance(quality.get("reviewChecklist"), list) else []
    blockers = []
    for row in checklist:
        if not isinstance(row, dict):
            continue
        status = text(row.get("status")).lower()
        if status in {"needs_work", "needs_metadata", "missing", "not_proven", "unknown", "review_long"}:
            blockers.append({
                "id": text(row.get("id")),
                "label": text(row.get("label")),
                "status": text(row.get("status")),
                "nextAction": text(row.get("nextAction")),
            })

    scoped_queue = queue_scope(queue, active_episode)
    queue_mode = scoped_queue["mode"]
    if queue_mode == "current-episode":
        scope_sentence = f"Refinement queue has Episode {active_episode} targets; show those first."
    elif active_episode is None:
        scope_sentence = "Refinement queue is global because the active session name does not expose an episode number."
    else:
        scope_sentence = f"No Episode {active_episode} refinement targets found; show global next-best targets without pretending they belong to this session."

    payload = {
        "status": "shorts_review_brief",
        "schema": "quipsly.studio.shorts-review-brief.v1",
        "model": "quipslystudio-shorts-review-brief",
        "baseUrl": base_url,
        "activeSessionName": session_name,
        "activeEpisode": active_episode,
        "leftWorkbench": state.get("leftWorkbenchMode") or state.get("leftWorkbench") or "",
        "shortQueueCount": state.get("shortClipQueueCount") or 0,
        "selectedShort": {
            "id": selected_id,
            "title": selected_title,
            "durationSeconds": duration,
            "reviewStatus": quality.get("reviewStatus") or selected.get("reviewStatus") or "",
            "exportStatus": quality.get("exportStatus") or selected.get("exportStatus") or "",
            "reviewClassLabel": quality.get("reviewClassLabel") or "",
        },
        "nextReviewAction": next_review_action,
        "nextSafeAction": next_safe_action,
        "reviewBlockers": blockers[:5],
        "refinementQueue": scoped_queue,
        "scopeSentence": scope_sentence,
        "safeCommands": {
            "showThisBriefJson": "script/agentctl.sh shorts-review-brief --json",
            "showThisBriefMarkdown": "script/agentctl.sh shorts-review-brief --markdown",
            "selectedShortQuality": "script/agentctl.sh selected-short-quality",
            "draftPlatformPacket": "script/agentctl.sh selected-short-platform-packet --all",
            "draftPlatformPacketBatch": "script/agentctl.sh shorts-platform-packet-batch --limit 5",
            "selectNextShort": "script/agentctl.sh shorts-review-next",
            "selectCutRiskShort": "script/agentctl.sh shorts-review-next-cut-risk any",
            "cueSelectedShort": f"script/agentctl.sh ship-short-cue id {short_label(selected_id)}",
            "openRefinementQueue": "script/agentctl.sh studio-shorts-cut-quality-refinement-queue --limit 5 --json",
        },
        "truth": (
            "Read-only current-short review brief. Shorts remain metadata recipes over whole synced sources; "
            "this command does not edit, approve, export, upload, publish, or mutate source media."
        ),
    }
    return payload


def markdown(payload: dict[str, Any]) -> str:
    selected = payload["selectedShort"]
    queue = payload["refinementQueue"]
    lines = [
        "# Quipsly Studio Shorts Review Brief",
        "",
        f"- Session: `{payload['activeSessionName'] or 'unknown'}`",
        f"- Active episode: `{payload['activeEpisode'] if payload['activeEpisode'] is not None else 'unknown'}`",
        f"- Workbench: `{payload['leftWorkbench'] or 'unknown'}`",
        f"- Queue count: `{payload['shortQueueCount']}`",
        "",
        "## Selected short",
        "",
        f"- Title: **{selected['title'] or 'None selected'}**",
        f"- ID: `{selected['id'] or 'none'}`",
        f"- Duration: `{selected['durationSeconds']:.1f}s`",
        f"- Review: `{selected['reviewStatus'] or 'unknown'}`",
        f"- Export: `{selected['exportStatus'] or 'unknown'}`",
        f"- Class: `{selected['reviewClassLabel'] or 'unknown'}`",
        "",
        "## Next move",
        "",
        f"- Review action: {payload['nextReviewAction']}",
        f"- Safe action: {payload['nextSafeAction']}",
        "",
        "## Review blockers",
        "",
    ]
    blockers = payload.get("reviewBlockers") or []
    if blockers:
        for blocker in blockers:
            lines.append(f"- {blocker['label'] or blocker['id']}: `{blocker['status']}`. {blocker['nextAction']}")
    else:
        lines.append("- No selected-short blocker was reported by the quality passport.")
    lines.extend([
        "",
        "## Refinement queue",
        "",
        f"- Scope: `{queue['mode']}`",
        f"- Total targets: `{queue['totalTargets']}`",
        f"- Scope note: {payload['scopeSentence']}",
    ])
    for item in queue.get("visibleTargets", []):
        focus = ", ".join(item.get("craftFocus") or [])
        lines.append(f"- Episode {item['episode']} / {item['title']}: score `{item['score']}`, focus `{focus or 'review'}`")
    lines.extend([
        "",
        "## Safe commands",
        "",
    ])
    for label, command in payload["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {payload['truth']}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--queue-path", type=Path, default=DEFAULT_QUEUE_PATH)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = build_payload(args.base_url, args.queue_path)
    except Exception as exc:
        print(json.dumps({
            "status": "shorts_review_brief_failed",
            "error": str(exc),
            "truth": "No edit, export, approval, publication, or media mutation was attempted.",
        }, indent=2, sort_keys=True))
        raise SystemExit(1)

    if args.markdown:
        print(markdown(payload))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
