#!/usr/bin/env python3
"""Build a live Quipsly OS operator-board payload from the latest return brief.

This is intentionally read-only. It exists so agent-facing CLI calls do not
depend on the running app's last in-memory status snapshot when local runway
artifacts have been regenerated on disk.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-return-brief.json")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def string(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def load_return_brief(pointer_path: Path) -> tuple[dict[str, Any], Path]:
    pointer = load_json(pointer_path)
    json_path_value = string(pointer.get("jsonPath"))
    json_path = Path(json_path_value) if json_path_value else pointer_path
    target = load_json(json_path) if json_path != pointer_path else {}
    return ({**pointer, **target} if target else pointer), json_path


def related_paths(raw_row: dict[str, Any]) -> list[dict[str, str]]:
    paths = raw_row.get("relatedPaths") if isinstance(raw_row.get("relatedPaths"), list) else []
    rows: list[dict[str, str]] = []
    for index, item in enumerate(paths, 1):
        if not isinstance(item, dict):
            continue
        path = string(item.get("path"))
        if not path:
            continue
        rows.append({
            "id": f"{string(item.get('field')) or 'surface'}-{index}",
            "field": string(item.get("field")) or "surface",
            "path": path,
            "pathExists": Path(path).exists(),
        })
    return rows


def normalize_open_target(item: dict[str, Any]) -> dict[str, Any]:
    path = string(item.get("path"))
    return {
        "lane": string(item.get("lane")),
        "label": string(item.get("label")),
        "path": path,
        "pathExists": Path(path).exists() if path else False,
        "openCommand": string(item.get("openCommand")),
    }


def build(pointer_path: Path = DEFAULT_POINTER) -> dict[str, Any]:
    brief, source_path = load_return_brief(pointer_path)
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    raw_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    counts = brief.get("counts") if isinstance(brief.get("counts"), dict) else {}
    open_targets = [
        normalize_open_target(item)
        for item in (brief.get("openTargets") if isinstance(brief.get("openTargets"), list) else [])
        if isinstance(item, dict)
    ]
    rows: list[dict[str, Any]] = []
    for index, raw_row in enumerate(raw_rows, 1):
        if not isinstance(raw_row, dict):
            continue
        lane = string(raw_row.get("lane")) or f"Quipsly lane {index}"
        path = string(raw_row.get("path"))
        lane_open_targets = [item for item in open_targets if item.get("lane") == lane]
        rows.append({
            "id": lane,
            "lane": lane,
            "label": string(raw_row.get("label")),
            "status": string(raw_row.get("status")),
            "readiness": string(raw_row.get("readiness")),
            "nextMove": string(raw_row.get("nextMove")),
            "microAction": string(raw_row.get("operatorMicroAction") or raw_row.get("microAction")),
            "path": path,
            "pathExists": Path(path).exists() if path else False,
            "openCommand": string(raw_row.get("openCommand")),
            "safety": string(raw_row.get("safety")),
            "relatedPaths": related_paths(raw_row),
            "firstOpenTarget": lane_open_targets[0] if lane_open_targets else {},
            "openTargets": lane_open_targets[:6],
        })
    first_safe_action = brief.get("firstSafeAction") if isinstance(brief.get("firstSafeAction"), dict) else {}
    pointer_counts = brief.get("latestPointerContractValidationCounts") if isinstance(brief.get("latestPointerContractValidationCounts"), dict) else {}
    return {
        "model": "quipsly-os-operator-board",
        "status": string(brief.get("status")) or "missing-return-brief",
        "generatedAt": string(brief.get("generatedAt") or brief.get("updatedAt")),
        "firstSafeAction": first_safe_action,
        "counts": counts,
        "pointerContractValidation": {
            "status": string(brief.get("latestPointerContractValidationStatus")),
            "htmlPath": string(brief.get("latestPointerContractValidationHtml")),
            "jsonPath": string(brief.get("latestPointerContractValidationJson")),
            "counts": pointer_counts,
        },
        "studioSyncDecisionAid": {
            "status": string(brief.get("latestStudioSyncDecisionAidStatus")),
            "htmlPath": string(brief.get("latestStudioSyncDecisionAidHtml")),
            "jsonPath": string(brief.get("latestStudioSyncDecisionAidJson")),
            "counts": brief.get("latestStudioSyncDecisionAidCounts") if isinstance(brief.get("latestStudioSyncDecisionAidCounts"), dict) else {},
            "humanAsk": string(brief.get("latestStudioSyncDecisionAidHumanAsk")),
            "nextSafestAction": string(brief.get("latestStudioSyncDecisionAidNextSafestAction")),
        },
        "boardPath": string(brief.get("productionConveyorPath")),
        "returnBriefPath": string(brief.get("htmlPath")),
        "pointerPath": str(pointer_path),
        "sourceReturnBriefJsonPath": str(source_path),
        "rowCount": len(rows),
        "availableRows": sum(1 for row in rows if row.get("pathExists")),
        "openTargetCount": len(open_targets),
        "topOpenTargets": open_targets[:12],
        "truth": "Live disk view of the latest return brief. Rows are reversible micro-actions, not external publication claims.",
        "rows": rows,
    }


def main() -> int:
    print(json.dumps(build(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
