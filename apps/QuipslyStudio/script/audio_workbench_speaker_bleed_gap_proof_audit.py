#!/usr/bin/env python3
"""Create a focused speaker bleed/gap proof audit for the current audio baseline.

This turns the broad source-activity CSV into a compact review/control packet for
Charlie/Homer bleed management. It does not approve audio, fail audio, render
branches, upload files, or mutate source media. It helps humans and Codex see
where the source-aware cleanup did work, where bleed may remain, and where a
future v007 repair should focus if listening fails.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter
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


def parse_float(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    if math.isnan(parsed) or math.isinf(parsed):
        return None
    return parsed


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return f"{minutes:02d}:{secs:06.3f}"


def mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def row_delta(row: dict[str, Any], aligned_key: str, contribution_key: str) -> float | None:
    aligned = row.get(aligned_key)
    contribution = row.get(contribution_key)
    if aligned is None or contribution is None:
        return None
    return contribution - aligned


def load_activity_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for raw in reader:
            flags = [flag for flag in (raw.get("flags") or "").split(";") if flag]
            row = {
                "start": parse_float(raw.get("start")) or 0.0,
                "end": parse_float(raw.get("end")) or 0.0,
                "timecode": raw.get("timecode") or timecode(parse_float(raw.get("start")) or 0.0),
                "priority": parse_float(raw.get("priority")),
                "flags": flags,
                "charlieAlignedDbfs": parse_float(raw.get("charlieAlignedDbfs")),
                "charlieContributionDbfs": parse_float(raw.get("charlieContributionDbfs")),
                "homerAlignedDbfs": parse_float(raw.get("homerAlignedDbfs")),
                "homerContributionDbfs": parse_float(raw.get("homerContributionDbfs")),
                "referenceAlignedDbfs": parse_float(raw.get("referenceAlignedDbfs")),
                "referenceContributionDbfs": parse_float(raw.get("referenceContributionDbfs")),
            }
            row["charlieDeltaDb"] = row_delta(row, "charlieAlignedDbfs", "charlieContributionDbfs")
            row["homerDeltaDb"] = row_delta(row, "homerAlignedDbfs", "homerContributionDbfs")
            rows.append(row)
    return rows


def rows_with_flag(rows: list[dict[str, Any]], flag: str) -> list[dict[str, Any]]:
    return [row for row in rows if flag in row.get("flags", [])]


def sort_rows_for_flag(flag: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if flag == "charlie_echo_bleed_may_remain_under_homer":
        return sorted(rows, key=lambda row: (row.get("charlieContributionDbfs") is None, -(row.get("charlieContributionDbfs") or -999.0)))
    if flag == "homer_noise_bleed_may_remain_under_charlie":
        return sorted(rows, key=lambda row: (row.get("homerContributionDbfs") is None, -(row.get("homerContributionDbfs") or -999.0)))
    if flag == "charlie_loss_or_overgate_risk":
        return sorted(rows, key=lambda row: (row.get("charlieDeltaDb") is None, row.get("charlieDeltaDb") or 0.0))
    if flag == "homer_loss_or_overgate_risk":
        return sorted(rows, key=lambda row: (row.get("homerDeltaDb") is None, row.get("homerDeltaDb") or 0.0))
    return sorted(rows, key=lambda row: row.get("start", 0.0))


def compact_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "start": row.get("start"),
        "end": row.get("end"),
        "timecode": row.get("timecode"),
        "flags": row.get("flags") or [],
        "charlieAlignedDbfs": row.get("charlieAlignedDbfs"),
        "charlieContributionDbfs": row.get("charlieContributionDbfs"),
        "charlieDeltaDb": row.get("charlieDeltaDb"),
        "homerAlignedDbfs": row.get("homerAlignedDbfs"),
        "homerContributionDbfs": row.get("homerContributionDbfs"),
        "homerDeltaDb": row.get("homerDeltaDb"),
    }


def summarize_flag(rows: list[dict[str, Any]], flag: str, speaker: str, limit: int) -> dict[str, Any]:
    selected = rows_with_flag(rows, flag)
    if speaker == "charlie":
        deltas = [row["charlieDeltaDb"] for row in selected if row.get("charlieDeltaDb") is not None]
        contribution = [row["charlieContributionDbfs"] for row in selected if row.get("charlieContributionDbfs") is not None]
    elif speaker == "homer":
        deltas = [row["homerDeltaDb"] for row in selected if row.get("homerDeltaDb") is not None]
        contribution = [row["homerContributionDbfs"] for row in selected if row.get("homerContributionDbfs") is not None]
    else:
        deltas = []
        contribution = []
    top_rows = [compact_row(row) for row in sort_rows_for_flag(flag, selected)[:limit]]
    return {
        "flag": flag,
        "speaker": speaker,
        "count": len(selected),
        "meanDeltaDb": mean(deltas),
        "loudestContributionDbfs": max(contribution) if contribution else None,
        "quietestContributionDbfs": min(contribution) if contribution else None,
        "topRows": top_rows,
    }


def nearby_queue_items(queue: list[dict[str, Any]], start: float, end: float, radius: float = 6.0) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for item in queue:
        try:
            time_sec = float(item.get("timeSec"))
        except (TypeError, ValueError):
            continue
        if start - radius <= time_sec <= end + radius:
            matches.append(
                {
                    "priority": item.get("priority"),
                    "riskPriority": item.get("riskPriority"),
                    "timeSec": time_sec,
                    "time": item.get("time"),
                    "title": item.get("title"),
                    "classifications": item.get("classifications") or [],
                }
            )
    return matches


def build_focus_windows(rows: list[dict[str, Any]], queue: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    focus: list[dict[str, Any]] = []
    seen: set[float] = set()
    priority_flags = [
        ("charlie_loss_or_overgate_risk", "Charlie may have been over-gated"),
        ("homer_loss_or_overgate_risk", "Homer may have been over-gated"),
        ("charlie_echo_bleed_may_remain_under_homer", "Charlie echo may remain under Homer"),
        ("homer_noise_bleed_may_remain_under_charlie", "Homer park noise may remain under Charlie"),
        ("overlap_preserved", "Natural overlap/reaction preserved"),
    ]
    for flag, reason in priority_flags:
        for row in sort_rows_for_flag(flag, rows_with_flag(rows, flag))[: max(2, limit // len(priority_flags))]:
            start = float(row.get("start") or 0.0)
            if start in seen:
                continue
            seen.add(start)
            focus.append(
                {
                    "start": start,
                    "end": row.get("end"),
                    "timecode": row.get("timecode") or timecode(start),
                    "reason": reason,
                    "row": compact_row(row),
                    "nearbyQueueItems": nearby_queue_items(queue, start, float(row.get("end") or start)),
                }
            )
            if len(focus) >= limit:
                return sorted(focus, key=lambda item: item["start"])
    return sorted(focus, key=lambda item: item["start"])


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Bleed/Gap Proof Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet focuses the broad source-activity map on the actual cleanup promise: keep speech/laughter/reactions, suppress non-contributing echo and park noise, preserve sync, and avoid making the conversation sound chopped. It is machine evidence only, not human approval.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Rows scanned: `{report['rowCount']}`",
        f"- Focus windows: `{len(report['focusWindows'])}`",
        "",
        "## Flag summary",
        "",
        "| Flag | Count | Mean suppression | Loudest contribution | Interpretation |",
        "|---|---:|---:|---:|---|",
    ]
    interpretations = {
        "charlie_echo_bleed_may_remain_under_homer": "Potential Charlie phone echo still audible while Homer leads.",
        "homer_noise_bleed_may_remain_under_charlie": "Potential Homer park/noise still audible while Charlie leads.",
        "charlie_loss_or_overgate_risk": "Charlie was active before treatment and quieter after; listen for chopped reaction/speech.",
        "homer_loss_or_overgate_risk": "Homer was active before treatment and quieter after; listen for chopped reaction/speech.",
        "overlap_preserved": "Likely useful overlap/reaction retained; listen for naturalness.",
        "dead_air_or_between_sources": "Full synced spine can include quiet gaps; edit branches should skip/cover as needed.",
    }
    for summary in report["flagSummaries"]:
        mean_delta = summary.get("meanDeltaDb")
        loudest = summary.get("loudestContributionDbfs")
        lines.append(
            "| `{flag}` | `{count}` | `{mean_delta}` | `{loudest}` | {meaning} |".format(
                flag=summary["flag"],
                count=summary["count"],
                mean_delta="" if mean_delta is None else f"{mean_delta:.2f} dB",
                loudest="" if loudest is None else f"{loudest:.2f} dBFS",
                meaning=interpretations.get(summary["flag"], "Review context."),
            )
        )
    lines.extend(["", "## First-pass focus windows", ""])
    for item in report["focusWindows"]:
        row = item["row"]
        queue = item.get("nearbyQueueItems") or []
        lines.extend(
            [
                f"### {item['timecode']} - {item['reason']}",
                "",
                f"- Window: `{timecode(float(item['start']))}` to `{timecode(float(item['end'] or item['start']))}`",
                f"- Flags: `{', '.join(row.get('flags') or [])}`",
                f"- Charlie aligned/contribution/delta: `{fmt_db(row.get('charlieAlignedDbfs'))}` / `{fmt_db(row.get('charlieContributionDbfs'))}` / `{fmt_delta(row.get('charlieDeltaDb'))}`",
                f"- Homer aligned/contribution/delta: `{fmt_db(row.get('homerAlignedDbfs'))}` / `{fmt_db(row.get('homerContributionDbfs'))}` / `{fmt_delta(row.get('homerDeltaDb'))}`",
            ]
        )
        if queue:
            lines.append("- Nearby listen-priority queue items:")
            for q in queue:
                lines.append(f"  - `#{q.get('priority')}` `{q.get('time')}` {q.get('title')}")
        else:
            lines.append("- Nearby listen-priority queue items: none")
        lines.append("")
    lines.extend(
        [
            "## Interpretation",
            "",
            "- This audit proves the cleanup is inspectable and points to exact listen windows. It does not prove the episode sounds good enough to approve.",
            "- If any focus window sounds chopped or echo/noise-heavy, keep v006 locked and make a scoped v007 repair for that window only.",
            "- If the focus windows pass human listening, use the guarded listen-decision flow to unlock branch inheritance instead of hand-editing manifest truth.",
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def fmt_db(value: Any) -> str:
    return "" if value is None else f"{float(value):.2f} dBFS"


def fmt_delta(value: Any) -> str:
    return "" if value is None else f"{float(value):.2f} dB"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--focus-limit", type=int, default=16)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    activity_csv_text = output_path(outputs.get("sourceActivityCsv"))
    if not activity_csv_text or not Path(activity_csv_text).exists():
        raise SystemExit("sourceActivityCsv is not registered or missing")
    queue_path_text = output_path(outputs.get("latestAudioListenPriorityQueue"))
    queue_packet = read_json(Path(queue_path_text)) if queue_path_text and Path(queue_path_text).exists() else {"queue": []}
    queue = list(queue_packet.get("queue") or [])

    rows = load_activity_rows(Path(activity_csv_text))
    flag_counter: Counter[str] = Counter()
    for row in rows:
        flag_counter.update(row.get("flags") or [])

    flag_specs = [
        ("charlie_echo_bleed_may_remain_under_homer", "charlie"),
        ("homer_noise_bleed_may_remain_under_charlie", "homer"),
        ("charlie_loss_or_overgate_risk", "charlie"),
        ("homer_loss_or_overgate_risk", "homer"),
        ("overlap_preserved", "both"),
        ("dead_air_or_between_sources", "none"),
    ]
    summaries = [summarize_flag(rows, flag, speaker, limit=6) for flag, speaker in flag_specs]
    focus_windows = build_focus_windows(rows, queue, max(4, args.focus_limit))

    report = {
        "schema": "quipsly.audio-workbench.speaker-bleed-gap-proof-audit.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourceActivityCsv": activity_csv_text,
        "sourceActivityMarkdown": output_path(outputs.get("sourceActivityMarkdown")),
        "listenPriorityQueue": queue_path_text,
        "rowCount": len(rows),
        "flagCounts": dict(flag_counter),
        "flagSummaries": summaries,
        "focusWindows": focus_windows,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    md_path = baseline_dir / f"audio-speaker-bleed-gap-proof-audit-{slug}-{generated_at}.md"
    json_path = baseline_dir / f"audio-speaker-bleed-gap-proof-audit-{slug}-{generated_at}.json"
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    write_json(json_path, report)

    outputs["latestSpeakerBleedGapProofAudit"] = str(json_path)
    outputs["latestSpeakerBleedGapProofAuditMarkdown"] = str(md_path)
    history = outputs.setdefault("speakerBleedGapProofAudits", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["speakerBleedGapProofAuditCount"] = len(history)
    manifest["speakerBleedGapProofFocusWindowCount"] = len(focus_windows)
    manifest["speakerBleedGapProofFlagCounts"] = dict(flag_counter)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(json_path),
                "rowCount": len(rows),
                "focusWindowCount": len(focus_windows),
                "flagCounts": dict(flag_counter),
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
