#!/usr/bin/env python3
"""Fallback helpers for shorts that exist in the review ledger but not stale indexes.

These helpers keep valid local shorts reviewable when a generated workbench or
transcript workorder index has drifted. They create metadata glue only. They do
not mutate source media, render exports, record review decisions, publish,
upload, schedule, delete, overwrite exports, or create receipt truth.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_LEDGER_POINTER = Path("review-board/latest-studio-short-review-decision-ledger.json")
DEFAULT_LEDGER_PATH = Path("review-board/studio-short-review-decision-ledger/studio-short-review-decision-ledger.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def load_decision_ledger(root: Path = DEFAULT_RELEASE_ROOT) -> tuple[dict[str, Any], Path | None]:
    pointer_path = root / LATEST_LEDGER_POINTER
    if pointer_path.exists():
        pointer = load_json(pointer_path)
        pointed = Path(str(pointer.get("jsonPath") or ""))
        if pointed.exists():
            return load_json(pointed), pointed
    default_path = root / DEFAULT_LEDGER_PATH
    if default_path.exists():
        return load_json(default_path), default_path
    return {}, None


def ledger_item(root: Path, short_id: str) -> dict[str, Any]:
    ledger, _ = load_decision_ledger(root)
    for item in ledger.get("items", []) if isinstance(ledger.get("items"), list) else []:
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            return item
    return {}


def ledger_item_to_workbench_item(item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    media_path = str(item.get("mediaPath") or item.get("path") or "")
    return {
        "shortId": short_id,
        "episode": item.get("episode", ""),
        "version": item.get("episodeVersion") or item.get("version", ""),
        "rank": item.get("rank") or item.get("shortIndex") or 999,
        "title": item.get("humanTitle") or item.get("title") or short_id,
        "readinessLevel": "ledger-only-review",
        "mediaPath": media_path,
        "path": media_path,
        "mediaUri": item.get("fileUri") or item.get("mediaUri") or "",
        "durationSeconds": item.get("durationSeconds"),
        "durationLabel": item.get("durationLabel", ""),
        "aspect": item.get("aspect", ""),
        "width": item.get("width", 0),
        "height": item.get("height", 0),
        "hasAudio": bool(item.get("hasAudio")),
        "hasVideo": bool(item.get("hasVideo")),
        "reviewSource": item.get("reviewSource", "short-review-decision-ledger"),
        "platformChecks": item.get("platformChecks") if isinstance(item.get("platformChecks"), list) else [],
        "editorQuestions": item.get("editorQuestions") if isinstance(item.get("editorQuestions"), list) else [],
        "truth": "Synthetic one-short workbench item generated from the local review ledger so review tools can inspect otherwise valid media. It does not mutate media or create publication truth.",
    }


def fallback_workbench_for_short(root: Path, short_id: str) -> Path | None:
    item = ledger_item(root, short_id)
    if not item:
        return None
    workbench_item = ledger_item_to_workbench_item(item)
    media_path = str(workbench_item.get("mediaPath") or "")
    if not media_path or not Path(media_path).exists():
        return None
    out_path = root / "shorts-command-room" / "cut-quality-workbench" / "single-short-fallbacks" / f"{short_id}-from-review-ledger.json"
    write_json(out_path, {
        "schema": "quipsly.studio.single-short-fallback-workbench.v1",
        "generatedAt": utc_now(),
        "source": "studio-short-review-ledger-fallback",
        "items": [workbench_item],
        "truth": "Fallback workbench metadata only. It does not mutate source media, render exports, record review decisions, publish, upload, schedule, delete, overwrite exports, or create receipt truth.",
    })
    return out_path


def fallback_transcript_workorder_for_short(root: Path, short_id: str) -> dict[str, Any]:
    item = ledger_item(root, short_id)
    if not item:
        return {}
    media_path = str(item.get("mediaPath") or item.get("path") or "")
    if not media_path or not Path(media_path).exists():
        return {}
    workorder_dir = root / "shorts-command-room" / "transcript-workorders" / short_id
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "version": item.get("episodeVersion") or item.get("version"),
        "title": item.get("humanTitle") or item.get("title") or short_id,
        "kind": "ledger-only-short-transcript-intake",
        "status": "transcript-needed",
        "mediaPath": media_path,
        "plannedSidecars": {
            "asrDraftTranscript": str(workorder_dir / f"{short_id}-asr-draft-transcript.json"),
            "captionDraftSrt": str(workorder_dir / f"{short_id}-caption-draft.srt"),
            "captionDraftVtt": str(workorder_dir / f"{short_id}-caption-draft.vtt"),
            "normalizedTranscriptReviewOnly": str(workorder_dir / f"{short_id}-normalized-transcript.json"),
            "rawProviderOutput": str(workorder_dir / f"{short_id}-raw-asr-output.json"),
        },
        "truth": "Fallback transcript workorder metadata only. It prepares local intake for an existing ledger short and does not create transcript truth.",
    }
