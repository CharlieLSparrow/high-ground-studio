#!/usr/bin/env python3
"""Export timeline markers for external editor/human audio review.

This is a non-approval handoff tool. It turns the current Audio Workbench
machine evidence into editor-neutral CSV/JSON/Markdown markers, plus a VLC-style
review playlist for the full listening copy. It must not approve audio, render
branches, copy huge media, or mutate source media.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def seconds_value(value: Any, fallback: float | None = None) -> float | None:
    try:
        if value is None:
            return fallback
        return float(value)
    except (TypeError, ValueError):
        return fallback


def seconds_to_clock(seconds: float | None) -> str:
    if seconds is None:
        return ""
    if seconds < 0:
        seconds = 0.0
    whole = int(seconds)
    millis = int(round((seconds - whole) * 1000))
    if millis >= 1000:
        whole += 1
        millis -= 1000
    hours = whole // 3600
    minutes = (whole % 3600) // 60
    secs = whole % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def seconds_to_smpte(seconds: float | None, fps: int = 30) -> str:
    if seconds is None:
        return ""
    if seconds < 0:
        seconds = 0.0
    total_frames = int(round(seconds * fps))
    frames = total_frames % fps
    total_seconds = total_frames // fps
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:{frames:02d}"


def compact_text(parts: list[Any], limit: int = 900) -> str:
    text = " | ".join(str(part).strip() for part in parts if part not in (None, "", [], {}))
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def proof_path_summary(proof_paths: dict[str, Any] | None) -> str:
    if not isinstance(proof_paths, dict):
        return ""
    items = []
    for key in ("rawAligned", "sourceAwareMix", "masteredSpine", "speakerSplitDiagnostic"):
        value = proof_paths.get(key)
        if value:
            items.append(f"{key}={value}")
    return " | ".join(items)


def marker(
    *,
    marker_id: str,
    category: str,
    severity: str,
    name: str,
    start: float | None,
    duration: float | None,
    comment: str,
    source: str,
    proof_paths: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if duration is None or duration <= 0:
        duration = 5.0
    end = None if start is None else start + duration
    return {
        "markerId": marker_id,
        "category": category,
        "severity": severity,
        "name": name,
        "sequenceStartSeconds": start,
        "sequenceEndSeconds": end,
        "durationSeconds": duration,
        "timecodeIn": seconds_to_clock(start),
        "timecodeOut": seconds_to_clock(end),
        "smpte30In": seconds_to_smpte(start),
        "smpte30Out": seconds_to_smpte(end),
        "comment": comment,
        "source": source,
        "proofPaths": proof_paths or {},
    }


def load_optional(path_text: str | None) -> dict[str, Any] | None:
    if not path_text:
        return None
    path = Path(path_text)
    if not path.exists():
        return None
    return load_json(path)


def workorder_markers(workorder: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not workorder:
        return []
    output: list[dict[str, Any]] = []
    for index, item in enumerate(workorder.get("items") or [], start=1):
        start = seconds_value(item.get("sequenceStartSeconds"))
        duration = 35.0
        proof_paths = item.get("proofPaths") if isinstance(item.get("proofPaths"), dict) else {}
        comment = compact_text(
            [
                item.get("warning"),
                "Listen for: " + "; ".join(item.get("listenFor") or []),
                "Pass: " + str(item.get("passCondition") or ""),
                "Fail: " + str(item.get("failCondition") or ""),
                "Safe next: " + str(item.get("safeNextAction") or ""),
                proof_path_summary(proof_paths),
            ]
        )
        output.append(
            marker(
                marker_id=str(item.get("id") or f"LW-{index:03d}"),
                category="critical-listen",
                severity="review-required",
                name=f"Critical listen: {item.get('windowLabel') or 'proof window'}",
                start=start,
                duration=duration,
                comment=comment,
                source="proof-window-listen-workorder",
                proof_paths=proof_paths,
            )
        )
    return output


def bleed_markers(bleed_audit: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not bleed_audit:
        return []
    output: list[dict[str, Any]] = []
    count = 1
    for window in bleed_audit.get("proofWindows") or []:
        warnings = window.get("warnings") or []
        if not warnings:
            continue
        start = seconds_value(window.get("sequenceStartSeconds"))
        duration = seconds_value(window.get("durationSeconds"), 35.0)
        comment = compact_text(
            [
                "Bleed/suppression warning: " + "; ".join(warnings),
                window.get("charlieNote"),
                window.get("homerNote"),
                bleed_audit.get("nextSafestAction"),
            ]
        )
        output.append(
            marker(
                marker_id=f"BA-{count:03d}",
                category="bleed-check",
                severity="review-required",
                name=f"Bleed check: {window.get('label') or 'proof window'}",
                start=start,
                duration=duration,
                comment=comment,
                source="bleed-management-audit",
            )
        )
        count += 1
    return output


def silence_markers(quality_report: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not quality_report:
        return []
    output: list[dict[str, Any]] = []
    artifacts = quality_report.get("artifacts") or {}
    master_wav = artifacts.get("masterWav") if isinstance(artifacts, dict) else None
    silence = master_wav.get("silence") if isinstance(master_wav, dict) else None
    if not isinstance(silence, dict):
        return []
    longest = silence.get("longestWindow") or {}
    start = seconds_value(longest.get("start"))
    duration = seconds_value(longest.get("duration")) or seconds_value(silence.get("longestSilenceSeconds"))
    if start is None or duration is None:
        return []
    advisories = master_wav.get("advisories") or quality_report.get("advisories") or []
    output.append(
        marker(
            marker_id="QA-001",
            category="edit-advisory",
            severity="review-skip-candidate",
            name="Longest sync-spine silence",
            start=start,
            duration=duration,
            comment=compact_text(
                [
                    f"Longest detected silence is {duration:.3f}s. This may be valid sync-layer truth, but edit branches should review or skip it.",
                    "; ".join(advisories),
                ]
            ),
            source="audio-workbench-qc",
        )
    )
    return output


def approval_gate_marker(manifest: dict[str, Any]) -> dict[str, Any]:
    approval = manifest.get("approvalStatus") or "unknown"
    return marker(
        marker_id="GATE-001",
        category="approval-gate",
        severity="locked",
        name="Human listen approval still required",
        start=0.0,
        duration=5.0,
        comment=compact_text(
            [
                f"Approval status: {approval}",
                f"Branch inheritance ready: {bool(manifest.get('branchInheritanceReady'))}",
                f"Branch render ready: {bool(manifest.get('branchRenderReady'))}",
                "Do not use this as publication approval until a human listen decision is recorded.",
            ]
        ),
        source="manifest-approval-state",
    )


def write_csv(path: Path, markers: list[dict[str, Any]]) -> None:
    fields = [
        "markerId",
        "category",
        "severity",
        "name",
        "timecodeIn",
        "timecodeOut",
        "smpte30In",
        "smpte30Out",
        "sequenceStartSeconds",
        "sequenceEndSeconds",
        "durationSeconds",
        "comment",
        "source",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in markers:
            writer.writerow({field: item.get(field, "") for field in fields})


def write_playlist(path: Path, master_m4a: str | None, markers: list[dict[str, Any]]) -> None:
    lines = ["#EXTM3U"]
    if not master_m4a:
        lines.append("# No master M4A found")
    else:
        for item in markers:
            start = item.get("sequenceStartSeconds")
            end = item.get("sequenceEndSeconds")
            if start is None or end is None:
                continue
            title = f"{item.get('markerId')} {item.get('name')} ({item.get('timecodeIn')} - {item.get('timecodeOut')})"
            lines.append(f"#EXTINF:{int(max(1, round(float(end) - float(start))))},{title}")
            lines.append(f"#EXTVLCOPT:start-time={float(start):.3f}")
            lines.append(f"#EXTVLCOPT:stop-time={float(end):.3f}")
            lines.append(master_m4a)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        f"# Editor Marker Packet: {packet['baselineId']}",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        "This packet exports review markers for Premiere, other editors, and agent-visible review. It does not approve audio, render branches, copy huge media, or mutate originals.",
        "",
        "## Approval truth",
        "",
        f"- Approval status: `{packet['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(packet['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(packet['branchRenderReady']).lower()}`",
        f"- Human listen still required: `{str(packet['humanListenStillRequired']).lower()}`",
        "",
        "## Files",
        "",
        f"- CSV markers: `{packet['outputs']['csv']}`",
        f"- JSON markers: `{packet['outputs']['json']}`",
        f"- VLC cue playlist: `{packet['outputs']['playlist']}`",
        f"- Master WAV: `{packet['masterWav']}`",
        f"- Listening M4A: `{packet['masterM4a']}`",
        "",
        "## Marker summary",
        "",
        f"- Total markers: `{packet['markerCount']}`",
    ]
    for category, count in sorted(packet.get("categoryCounts", {}).items()):
        lines.append(f"- {category}: `{count}`")
    lines.extend(
        [
            "",
            "## Markers",
            "",
            "| ID | Category | Severity | Time | Duration | Name |",
            "|---|---|---|---:|---:|---|",
        ]
    )
    for item in packet["markers"]:
        lines.append(
            f"| `{item['markerId']}` | `{item['category']}` | `{item['severity']}` | `{item['timecodeIn']}` | `{item['durationSeconds']}` | {item['name']} |"
        )
    lines.extend(
        [
            "",
            "## Usage",
            "",
            "1. Import or reference the CSV in an editor or spreadsheet while listening to the WAV/M4A spine.",
            "2. Use the VLC playlist for quick jumping through the full listening copy if VLC is available.",
            "3. Treat markers as review prompts, not verdicts. A warning only becomes a blocker after human listening confirms it.",
            "4. If all critical markers pass by ear, record the human listen decision before branch inheritance.",
            "",
            "```bash",
            f"open '{packet['outputs']['markdown']}'",
            f"open '{packet['outputs']['csv']}'",
            f"open '{packet['outputs']['playlist']}'",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    proof_workorder = load_optional(output_path(outputs.get("proofWindowListenWorkorder")))
    bleed_audit = load_optional(output_path(outputs.get("latestBleedManagementAudit")))
    quality_report = load_optional(output_path(outputs.get("qualityReport")))

    markers = [approval_gate_marker(manifest)]
    markers.extend(workorder_markers(proof_workorder))
    markers.extend(bleed_markers(bleed_audit))
    markers.extend(silence_markers(quality_report))
    markers.sort(key=lambda item: (item.get("sequenceStartSeconds") is None, item.get("sequenceStartSeconds") or 0.0, item.get("markerId") or ""))

    category_counts: dict[str, int] = {}
    for item in markers:
        category = str(item.get("category") or "unknown")
        category_counts[category] = category_counts.get(category, 0) + 1

    base_name = f"audio-editor-marker-packet-{slug}-{generated_at}"
    output_json = baseline_dir / f"{base_name}.json"
    output_md = baseline_dir / f"{base_name}.md"
    output_csv = baseline_dir / f"{base_name}.csv"
    output_playlist = baseline_dir / f"{base_name}.m3u"

    master_wav = output_path(outputs.get("masterWav"))
    master_m4a = output_path(outputs.get("masterM4a"))
    packet = {
        "schema": "quipsly.audio-workbench.editor-marker-packet.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "masterWav": master_wav,
        "masterM4a": master_m4a,
        "markerCount": len(markers),
        "categoryCounts": category_counts,
        "markers": markers,
        "outputs": {
            "json": str(output_json),
            "markdown": str(output_md),
            "csv": str(output_csv),
            "playlist": str(output_playlist),
        },
        "originalMediaMutated": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "hugeMediaCopied": False,
    }

    write_json(output_json, packet)
    write_csv(output_csv, markers)
    write_playlist(output_playlist, master_m4a, markers)
    output_md.write_text(render_markdown(packet) + "\n", encoding="utf-8")

    outputs["latestEditorMarkerPacket"] = str(output_json)
    outputs["latestEditorMarkerPacketMarkdown"] = str(output_md)
    outputs["latestEditorMarkerPacketCsv"] = str(output_csv)
    outputs["latestEditorMarkerPacketPlaylist"] = str(output_playlist)
    history = outputs.setdefault("editorMarkerPackets", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["editorMarkerPacketCount"] = len(history)
    manifest["editorMarkerPacketGeneratedAt"] = generated_at
    manifest["editorMarkerPacketMarkerCount"] = len(markers)
    manifest["editorMarkerPacketHumanListenStillRequired"] = packet["humanListenStillRequired"]
    manifest["editorMarkerPacketApprovalStateChanged"] = False
    manifest["editorMarkerPacketBranchStateChanged"] = False
    manifest["editorMarkerPacketHugeMediaCopied"] = False
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Wrote {output_csv}")
    print(f"Wrote {output_playlist}")
    print(f"Marker count: {len(markers)}")
    print(f"Human listen still required: {packet['humanListenStillRequired']}")


if __name__ == "__main__":
    main()
