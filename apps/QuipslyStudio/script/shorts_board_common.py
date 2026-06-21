#!/usr/bin/env python3
"""Shared helpers for Quipsly Studio short-form report scripts."""

from __future__ import annotations

import html
import json
import os
import re
from datetime import datetime, timezone
from typing import Any


EXPORT_PATTERNS = [
    re.compile(r"Exported 9:16 short:\s*(.+)", re.IGNORECASE),
    re.compile(r"Export started:\s*(.+)", re.IGNORECASE),
    re.compile(r"Exported(?:\s+short)?:\s*(.+\.mp4)\b", re.IGNORECASE),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "-", value.strip().lower())
    return value.strip("-") or "short"


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def first_text(row: dict[str, Any], keys: list[str], default: str = "") -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return default


def first_number(row: dict[str, Any], keys: list[str], default: float = 0.0) -> float:
    for key in keys:
        value = row.get(key)
        if value is None or value == "":
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def looks_like_short_list(rows: Any) -> bool:
    if not isinstance(rows, list) or not rows:
        return False
    dict_rows = [row for row in rows if isinstance(row, dict)]
    if not dict_rows:
        return False
    signal_keys = {
        "title",
        "segments",
        "reviewStatus",
        "exportStatus",
        "destinations",
        "hookText",
        "overlayText",
        "publishNotes",
        "shortId",
        "clipId",
    }
    return any(signal_keys.intersection(row.keys()) for row in dict_rows[:5])


def find_short_lists(value: Any) -> list[list[dict[str, Any]]]:
    found: list[list[dict[str, Any]]] = []
    if looks_like_short_list(value):
        found.append([row for row in value if isinstance(row, dict)])
    if isinstance(value, dict):
        preferred_keys = [
            "shorts",
            "queue",
            "items",
            "clips",
            "shortClips",
            "socialShorts",
            "reviewQueue",
            "shortsQueue",
        ]
        for key in preferred_keys:
            if key in value and looks_like_short_list(value[key]):
                found.append([row for row in value[key] if isinstance(row, dict)])
        for nested in value.values():
            if isinstance(nested, (dict, list)):
                found.extend(find_short_lists(nested))
    elif isinstance(value, list):
        for nested in value:
            if isinstance(nested, (dict, list)):
                found.extend(find_short_lists(nested))
    return found


def unique_shorts(payload: Any) -> list[dict[str, Any]]:
    lists = find_short_lists(payload)
    if not lists:
        return []
    rows = max(lists, key=len)
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        identity = first_text(row, ["id", "shortId", "clipId", "uuid"], f"index-{index}")
        if identity in seen:
            continue
        seen.add(identity)
        unique.append(row)
    return unique


def extract_strings(value: Any) -> list[str]:
    strings: list[str] = []
    if isinstance(value, str):
        strings.append(value)
    elif isinstance(value, dict):
        for nested in value.values():
            strings.extend(extract_strings(nested))
    elif isinstance(value, list):
        for nested in value:
            strings.extend(extract_strings(nested))
    return strings


def exported_paths(row: dict[str, Any]) -> list[str]:
    paths: list[str] = []
    for key in ["primaryExportPath", "exportPath", "localExportPath", "outputPath", "filePath"]:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            paths.append(value.strip())

    note_strings = extract_strings(row.get("publishNotes")) + extract_strings(row.get("notes"))
    for note in note_strings:
        for pattern in EXPORT_PATTERNS:
            match = pattern.search(note)
            if match:
                candidate = match.group(1).strip().strip("'\"")
                if candidate:
                    paths.append(candidate)

    seen: set[str] = set()
    cleaned: list[str] = []
    for path in paths:
        if path in seen:
            continue
        seen.add(path)
        cleaned.append(path)
    return cleaned


def duration_seconds(row: dict[str, Any]) -> float:
    duration = first_number(row, ["duration", "durationSeconds", "recipeDuration", "exportDuration"], 0.0)
    if duration > 0:
        return duration
    total = 0.0
    for segment in as_list(row.get("segments")):
        if not isinstance(segment, dict):
            continue
        segment_duration = first_number(segment, ["duration", "durationSeconds"], 0.0)
        if segment_duration <= 0:
            start = first_number(segment, ["start", "startSeconds", "sequenceStart"], 0.0)
            end = first_number(segment, ["end", "endSeconds", "sequenceEnd"], 0.0)
            segment_duration = max(0.0, end - start)
        total += segment_duration
    return total


def command_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def classify_short(row: dict[str, Any], output_dir: str, index: int) -> dict[str, Any]:
    short_id = first_text(row, ["id", "shortId", "clipId", "uuid"], f"short-{index}")
    title = first_text(row, ["title", "name", "label"], f"Short {index}")
    review_status = first_text(row, ["reviewStatus", "status"], "draft")
    export_status = first_text(row, ["exportStatus", "localExportStatus"], "unknown")
    text_status = first_text(row, ["textReviewStatus", "captionReviewStatus", "overlayBurnInStatus"], "unknown")
    listen_status = first_text(row, ["listenThroughStatus", "audioReviewStatus"], "unknown")
    visual_status = first_text(row, ["visualReviewStatus", "contactSheetStatus"], "unknown")
    destinations = [str(item) for item in as_list(row.get("destinations")) if str(item).strip()]
    paths = exported_paths(row)
    primary_path = paths[0] if paths else ""
    primary_exists = bool(primary_path and os.path.exists(primary_path))
    primary_size = os.path.getsize(primary_path) if primary_exists else 0
    duration = duration_seconds(row)
    lower = json.dumps(row, sort_keys=True, default=str).lower()

    rejected = any(word in review_status.lower() for word in ["reject", "rejected"])
    kept = any(word in review_status.lower() for word in ["keep", "kept", "approved", "ready"])
    exported = primary_exists or "exported" in export_status.lower() or "completed" in export_status.lower()
    export_started = "start" in export_status.lower() or "progress" in export_status.lower() or "running" in export_status.lower()
    visual_done = "visualreview" in lower or "contact sheet" in lower or any(word in visual_status.lower() for word in ["done", "review", "pass"])
    listen_done = "listenthrough" in lower or any(word in listen_status.lower() for word in ["done", "review", "pass", "approved"])
    text_done = any(word in text_status.lower() for word in ["approved", "done", "review", "pass"]) or "textreview" in lower

    if rejected:
        stage = "rejected-learning-data"
        next_action = "Leave it as learning data unless we intentionally revive it."
    elif not primary_path:
        stage = "missing-export"
        next_action = "Export this short locally so we have an actual file to watch and hear."
    elif not primary_exists:
        stage = "export-path-missing-file"
        next_action = "Re-export locally. The queue references a path, but the file is not present."
    elif not exported and export_started:
        stage = "export-started-needs-confirmation"
        next_action = "Confirm the export finished, then generate visual and audio evidence."
    elif not visual_done:
        stage = "exported-needs-visual-review"
        next_action = "Generate a contact sheet or preview the short before deciding."
    elif not listen_done:
        stage = "exported-needs-listen-through"
        next_action = "Listen through the exported file and sanity-check audio."
    elif not text_done:
        stage = "needs-text-review"
        next_action = "Check hook, captions, overlay placement, and platform copy."
    elif kept:
        stage = "ready-for-social-queue"
        next_action = "Move this toward the social publishing queue when Tower is ready."
    else:
        stage = "ready-for-local-quality-decision"
        next_action = "Make the practical call: keep, refine, or reject based on the exported file."

    basename = slugify(title)
    select_command = f"script/agentctl.sh shorts-select id {command_quote(short_id)}"
    export_command = f"{select_command} && script/agentctl.sh shorts-export-selected {command_quote(output_dir)} {command_quote(basename)}"
    contact_sheet_command = (
        f"script/agentctl.sh shorts-contact-sheet {command_quote(primary_path)}"
        if primary_path
        else ""
    )
    audio_sanity_command = (
        f"script/agentctl.sh shorts-audio-sanity {command_quote(primary_path)} {duration:.2f}"
        if primary_path
        else ""
    )
    listen_command = f"script/agentctl.sh shorts-listen-through {command_quote('Listened locally; note result here.')}"
    keep_command = f"script/agentctl.sh shorts-review {command_quote(short_id)} keep {command_quote('Kept after local export review.')}"
    refine_command = f"script/agentctl.sh shorts-review {command_quote(short_id)} refine {command_quote('Needs one concrete improvement after local review.')}"

    return {
        "id": short_id,
        "title": title,
        "index": index,
        "stage": stage,
        "nextAction": next_action,
        "reviewStatus": review_status,
        "exportStatus": export_status,
        "visualReviewStatus": visual_status,
        "listenThroughStatus": listen_status,
        "textReviewStatus": text_status,
        "destinations": destinations,
        "durationSeconds": round(duration, 3),
        "segmentCount": len(as_list(row.get("segments"))),
        "primaryExportPath": primary_path,
        "primaryExportExists": primary_exists,
        "primaryExportBytes": primary_size,
        "allExportedPaths": paths,
        "commands": {
            "select": select_command,
            "exportLocal": export_command,
            "contactSheet": contact_sheet_command,
            "audioSanity": audio_sanity_command,
            "listenThrough": listen_command,
            "keep": keep_command,
            "refine": refine_command,
        },
    }


def stage_rank(stage: str) -> int:
    ranks = {
        "missing-export": 10,
        "export-path-missing-file": 15,
        "export-started-needs-confirmation": 20,
        "exported-needs-visual-review": 30,
        "exported-needs-listen-through": 40,
        "needs-text-review": 50,
        "ready-for-local-quality-decision": 60,
        "ready-for-social-queue": 70,
        "rejected-learning-data": 90,
    }
    return ranks.get(stage, 80)
