#!/usr/bin/env python3
"""Audit source-balance proof-window repair preflight outputs.

This validates the current-v006 reference snippets and candidate snippets
rendered by audio_workbench_source_balance_repair_preflight.py. It also writes a
playlist/review guide so humans can compare current vs candidate without hunting
through folders.

It does not approve audio, fail audio, render branches, upload files, or mutate
source media.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def result_duration(result: dict[str, Any]) -> float | None:
    probe = result.get("probe") if isinstance(result.get("probe"), dict) else {}
    value = probe.get("durationSeconds")
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def result_size(result: dict[str, Any]) -> int:
    probe = result.get("probe") if isinstance(result.get("probe"), dict) else {}
    try:
        return int(probe.get("sizeBytes") or 0)
    except (TypeError, ValueError):
        return 0


def audit_result(result: dict[str, Any], expected_duration: float, tolerance: float) -> list[str]:
    warnings: list[str] = []
    path = Path(str(result.get("output") or ""))
    if not result.get("ok"):
        warnings.append("render-result-not-ok")
    if not path.exists():
        warnings.append("output-missing")
    if result_size(result) <= 0:
        warnings.append("output-empty")
    duration = result_duration(result)
    if duration is None:
        warnings.append("duration-missing")
    elif abs(duration - expected_duration) > tolerance:
        warnings.append(f"duration-off-{duration:.3f}s")
    return warnings


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Source-Balance Repair Preflight Audit: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This audit validates proof-only source-balance comparison snippets. It does not approve v006, fail v006, unlock branch inheritance, render branches, upload files, or touch source media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(payload['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(payload['branchRenderReady']).lower()}`",
        f"- Source preflight: `{payload['sourcePreflightMarkdown']}`",
        f"- Render attempted by source preflight: `{str(payload['sourceRenderAttempted']).lower()}`",
        f"- Result count: `{payload['resultCount']}`",
        f"- Pair count: `{payload['pairCount']}`",
        f"- Error count: `{payload['errorCount']}`",
        f"- Warning count: `{payload['warningCount']}`",
        "",
        "## Review path",
        "",
        "Open the playlist and listen in pairs: current v006 first, then candidate. A candidate is only useful if it fixes the audible issue without making cadence, overlap, echo, or noise worse.",
        "",
        f"- Playlist: `{payload['playlistPath']}`",
        "",
        "## Proof pairs",
        "",
    ]
    for pair in payload["pairs"]:
        lines.extend(
            [
                f"### `{pair['flag']}`",
                "",
                f"- Expected duration: `{pair['expectedDurationSeconds']}` seconds",
                f"- Current reference count: `{pair['currentCount']}`",
                f"- Candidate count: `{pair['candidateCount']}`",
                f"- Warning count: `{pair['warningCount']}`",
                "",
                "| Kind | Profile | Duration | Size | Warnings | File |",
                "|---|---|---:|---:|---|---|",
            ]
        )
        for item in pair["items"]:
            lines.append(
                "| {kind} | {profile} | {duration} | {size} | {warnings} | `{file}` |".format(
                    kind=item.get("kind"),
                    profile=item.get("profileId"),
                    duration="n/a" if item.get("durationSeconds") is None else f"{item['durationSeconds']:.3f}",
                    size=item.get("sizeBytes"),
                    warnings=", ".join(item.get("warnings") or []) or "none",
                    file=Path(item.get("output") or "").name,
                )
            )
        lines.append("")
    lines.extend(
        [
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(payload['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(payload['branchStateChanged']).lower()}`",
            f"- Render attempted by this audit: `{str(payload['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(payload['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--duration-tolerance", type=float, default=0.35)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    preflight_path = output_path(outputs.get("latestAudioSourceBalanceRepairPreflight"))
    preflight_md = output_path(outputs.get("latestAudioSourceBalanceRepairPreflightMarkdown"))
    if not preflight_path or not Path(preflight_path).exists():
        raise FileNotFoundError("Missing latestAudioSourceBalanceRepairPreflight")
    preflight = read_json(Path(preflight_path))

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in preflight.get("renderResults") or []:
        grouped[str(result.get("flag") or "unknown")].append(result)

    output_dir = Path(preflight_path).parent
    output_json = output_dir / f"source-balance-repair-preflight-audit-{generated_at}.json"
    output_md = output_dir / f"source-balance-repair-preflight-audit-{generated_at}.md"
    playlist_path = output_dir / f"source-balance-proof-comparison-{generated_at}.m3u"

    pairs: list[dict[str, Any]] = []
    playlist_lines = ["#EXTM3U", f"# Quipsly source-balance proof comparison for {baseline_id}"]
    total_warnings = 0
    total_errors = 0
    for plan in preflight.get("plans") or []:
        flag = str(plan.get("flag") or "unknown")
        expected_duration = float(plan.get("durationSeconds") or 0.0)
        items: list[dict[str, Any]] = []
        current_count = 0
        candidate_count = 0
        pair_warnings = 0
        for result in grouped.get(flag, []):
            warnings = audit_result(result, expected_duration, args.duration_tolerance)
            pair_warnings += len(warnings)
            total_warnings += len(warnings)
            if result.get("kind") == "current-v006-reference":
                current_count += 1
            if result.get("kind") == "candidate-proof":
                candidate_count += 1
            if not result.get("ok"):
                total_errors += 1
            duration = result_duration(result)
            item = {
                "kind": result.get("kind"),
                "profileId": result.get("profileId"),
                "output": result.get("output"),
                "durationSeconds": duration,
                "sizeBytes": result_size(result),
                "warnings": warnings,
            }
            items.append(item)
            if result.get("output"):
                playlist_lines.append(f"#EXTINF:{duration or expected_duration:.3f},{flag} - {item['kind']} - {item['profileId']}")
                playlist_lines.append(str(result["output"]))
        if current_count == 0:
            total_errors += 1
            pair_warnings += 1
        if candidate_count == 0:
            total_errors += 1
            pair_warnings += 1
        pairs.append(
            {
                "flag": flag,
                "expectedDurationSeconds": expected_duration,
                "currentCount": current_count,
                "candidateCount": candidate_count,
                "warningCount": pair_warnings,
                "items": items,
            }
        )

    playlist_path.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")
    payload = {
        "schema": "quipsly.audio-workbench.source-balance-repair-preflight-audit.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourcePreflight": preflight_path,
        "sourcePreflightMarkdown": preflight_md,
        "sourceRenderAttempted": bool(preflight.get("renderAttempted")),
        "resultCount": len(preflight.get("renderResults") or []),
        "pairCount": len(pairs),
        "errorCount": total_errors,
        "warningCount": total_warnings,
        "pairs": pairs,
        "playlistPath": str(playlist_path),
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    write_json(output_json, payload)
    output_md.write_text(build_markdown(payload), encoding="utf-8")

    outputs["latestAudioSourceBalanceRepairPreflightAudit"] = str(output_json)
    outputs["latestAudioSourceBalanceRepairPreflightAuditMarkdown"] = str(output_md)
    outputs["latestAudioSourceBalanceRepairProofPlaylist"] = str(playlist_path)
    history = outputs.setdefault("audioSourceBalanceRepairPreflightAudits", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSourceBalanceRepairPreflightAuditCount"] = len(history)
    manifest["audioSourceBalanceRepairPreflightAuditErrorCount"] = total_errors
    manifest["audioSourceBalanceRepairPreflightAuditWarningCount"] = total_warnings
    manifest["audioSourceBalanceRepairProofPairCount"] = len(pairs)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "playlist": str(playlist_path),
                "pairCount": len(pairs),
                "resultCount": len(preflight.get("renderResults") or []),
                "errorCount": total_errors,
                "warningCount": total_warnings,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
