#!/usr/bin/env python3
"""Normalize stale Studio360 latest-pointer handoff fields.

This is metadata-only maintenance for current `latest-*.json` front doors. It
does not render, proxy, repair, park, upload, publish, delete, overwrite source
media, or create external receipt truth.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.latest-pointer-handoff-normalization.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio360-pointer-normalization")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def normalize_payload(pointer_name: str, payload: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    changed: list[str] = []
    normalized = dict(payload)

    if pointer_name == "latest-360-proof-render.json":
        defaults = {
            "humanAsk": "Open the latest proof render and inspect framing, audio, duration, and aspect before promoting this path to additional renders.",
            "agentSafeParallelWork": "Codex may summarize proof metadata, compare proof outputs, and improve review packets. Do not run full renders, upload, publish, delete, overwrite, mutate originals, or create receipts.",
        }
    elif pointer_name == "latest-360-proof-render-ledger.json":
        defaults = {
            "humanAsk": "Review the proof-render ledger and decide which proof output, if any, is safe to use as the basis for more render work.",
            "agentSafeParallelWork": "Codex may summarize ledger entries, compare aspects/statuses, and prepare review notes. Do not render, upload, publish, delete, overwrite, mutate originals, or create receipts.",
            "firstSafeAction": {
                "label": "Open Studio360 proof-render ledger JSON",
                "command": f"open {json.dumps(str(Path(str(payload.get('jsonPath') or ''))))}" if payload.get("jsonPath") else "",
                "path": str(payload.get("jsonPath") or ""),
                "safety": "Opens local proof-render ledger metadata only. No render, upload, publication, overwrite, or source mutation.",
            },
        }
    elif pointer_name == "latest-360-proxy-prep.json":
        defaults = {
            "status": normalized.get("status") or "proxy-prep-ready",
            "humanAsk": "Open the managed proxy evidence and confirm it is usable for 360 reframe review before treating this source group as proof-ready.",
            "agentSafeParallelWork": "Codex may summarize proxy metadata, route it into reframe packets, and improve diagnostics. Do not delete, overwrite, upload, publish, mutate originals, or create receipt truth.",
            "nextSafestAction": "Open the proxy for reframe/keyframe review, then generate 16:9 and 9:16 export recipes from metadata.",
        }
    elif pointer_name == "latest-360-proxy-prep-failure.json":
        defaults = {
            "status": normalized.get("status") or "proxy-prep-failure-needs-review",
            "humanAsk": "Review this proxy-prep failure before retrying. Confirm source availability, ffmpeg support, and whether a companion/proxy route is safer.",
            "agentSafeParallelWork": "Codex may summarize the failure, prepare retry diagnostics, and improve source-routing notes. Do not delete, overwrite, repair, upload, publish, mutate originals, or mark a repair decision.",
            "nextSafestAction": "Use a matching LRV/proxy companion, re-download or repair the original, or park this source as needing media repair before 360 reframe/export work.",
        }
    else:
        defaults = {}

    defaults.update({
        "metadataOnlyNormalization": True,
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    })

    for key, value in defaults.items():
        current = normalized.get(key)
        if current is None or current == "" or current == []:
            normalized[key] = value
            changed.append(key)

    if changed:
        normalized["handoffNormalizedAt"] = iso_now()
        normalized["handoffNormalizationTruth"] = (
            "Metadata-only latest-pointer handoff normalization. No render, proxy, repair, "
            "upload, publication, deletion, overwrite, source mutation, or receipt creation occurred."
        )
    return normalized, changed


def run(root: Path) -> dict[str, Any]:
    pointer_names = [
        "latest-360-proof-render-ledger.json",
        "latest-360-proof-render.json",
        "latest-360-proxy-prep-failure.json",
        "latest-360-proxy-prep.json",
    ]
    session_dir = root / "LatestPointerNormalizations" / stamp()
    rows: list[dict[str, Any]] = []
    for name in pointer_names:
        path = root / name
        before = load_json(path)
        if not before:
            rows.append({"pointer": name, "path": str(path), "status": "missing", "changedFields": []})
            continue
        after, changed = normalize_payload(name, before)
        if changed:
            write_json(path, after)
        rows.append({
            "pointer": name,
            "path": str(path),
            "status": "updated" if changed else "already-current",
            "changedFields": changed,
            "schema": after.get("schema") or "",
        })
    counts = {
        "pointersChecked": len(rows),
        "pointersUpdated": sum(1 for row in rows if row["status"] == "updated"),
        "pointersMissing": sum(1 for row in rows if row["status"] == "missing"),
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio360-pointer-handoffs-normalized",
        "studio360Root": str(root),
        "sessionDir": str(session_dir),
        "counts": counts,
        "rows": rows,
        "humanAsk": "Use this report to confirm stale Studio360 latest pointers now explain the human decision and agent-safe parallel work.",
        "agentSafeParallelWork": "Codex may rerun the latest-surface audit and OS validation. Do not render, proxy, repair, upload, publish, delete, overwrite, mutate originals, or create receipts.",
        "nextSafestAction": "Run quipsly-latest-surface-audit and quipsly-os-validation to confirm the normalized pointers are discoverable and safe.",
        "truth": "Metadata-only latest-pointer normalization. No media, source files, external accounts, publication state, or receipts were changed.",
    }
    session_dir.mkdir(parents=True, exist_ok=False)
    json_path = session_dir / "studio360-latest-pointer-normalization.json"
    markdown_path = session_dir / "START-HERE-studio360-latest-pointer-normalization.md"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    payload.update({
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
    })
    write_json(json_path, payload)
    write_json(root / "latest-360-pointer-normalization.json", {
        "schema": "quipsly.studio360.latest-pointer-normalization.latest.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "sessionDir": str(session_dir),
        "counts": counts,
        "truth": payload["truth"],
        "firstSafeAction": {
            "label": "Open Studio360 latest-pointer normalization report",
            "command": f"open {json.dumps(str(markdown_path))}",
            "path": str(markdown_path),
            "safety": "Opens local metadata-normalization report only. No render, proxy, repair, upload, publish, delete, overwrite, source mutation, or receipt creation.",
        },
    })
    return payload


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio360 latest-pointer handoff normalization",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        f"- Pointers checked: `{payload['counts']['pointersChecked']}`",
        f"- Pointers updated: `{payload['counts']['pointersUpdated']}`",
        f"- Missing pointers: `{payload['counts']['pointersMissing']}`",
        "",
        "## Rows",
        "",
    ]
    for row in payload["rows"]:
        lines.append(f"- `{row['pointer']}`: `{row['status']}` changed `{', '.join(row['changedFields']) or 'none'}`")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize stale Studio360 latest-pointer handoff metadata.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    payload = run(Path(args.root).expanduser())
    print(json.dumps({
        "status": payload["status"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "counts": payload["counts"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
