#!/usr/bin/env python3
"""Audit the listen-priority snippet pack for review-readiness.

The snippet pack is a reviewer convenience layer: short audio clips cut from the
mastered spine around the highest-risk listen windows. This audit verifies that
layer without approving audio, failing audio, rendering branches, uploading
files, or touching original media.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def ffprobe_duration(path: Path, ffprobe: str) -> float | None:
    result = run_capture(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Listen-Priority Snippet Pack Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This audit verifies the reviewer snippet pack mechanically. It does not approve audio, fail audio, render edit branches, upload files, or mutate original media.",
        "",
        "## Result",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Snippets expected: `{report['expectedSnippetCount']}`",
        f"- Snippets audited: `{report['auditedSnippetCount']}`",
        f"- Errors: `{len(report['errors'])}`",
        f"- Warnings: `{len(report['warnings'])}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Artifacts checked",
        "",
        f"- Snippet pack JSON: `{report['snippetPackPath']}`",
        f"- Snippet pack Markdown: `{report['snippetPackMarkdown']}`",
        f"- Snippet pack HTML: `{report['snippetPackHtml']}`",
        f"- Snippet playlist: `{report['snippetPackPlaylist']}`",
        f"- Snippet open command: `{report['snippetPackOpenCommand']}`",
        f"- Queue: `{report['queuePath']}`",
        f"- Master source: `{report['sourceAudio']}`",
        "",
        "## Clip checks",
        "",
        "| # | Time | Exists | Size | Duration | Status |",
        "|---:|---:|---:|---:|---:|---|",
    ]
    for row in report["snippetChecks"]:
        lines.append(
            "| {priority} | `{centerTimecode}` | `{exists}` | `{sizeBytes}` | `{duration}` | {status} |".format(
                priority=row.get("priority"),
                centerTimecode=row.get("centerTimecode"),
                exists=str(row.get("exists")).lower(),
                sizeBytes=row.get("sizeBytes"),
                duration="" if row.get("actualDurationSeconds") is None else f"{row['actualDurationSeconds']:.3f}s",
                status=row.get("status"),
            )
        )
    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
    if report["warnings"]:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report["warnings"])
    lines.extend(
        [
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--duration-tolerance", type=float, default=1.25)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    ffprobe = shutil.which("ffprobe")

    errors: list[str] = []
    warnings: list[str] = []
    if not ffprobe:
        errors.append("ffprobe is not available on PATH; cannot validate snippet audio durations.")

    pack_path_text = output_path(outputs.get("latestAudioListenPrioritySnippetPack"))
    if not pack_path_text:
        raise SystemExit("latestAudioListenPrioritySnippetPack is not registered")
    pack_path = Path(pack_path_text)
    if not pack_path.exists():
        raise SystemExit(f"latestAudioListenPrioritySnippetPack is missing: {pack_path}")
    pack = read_json(pack_path)

    queue_path_text = output_path(pack.get("queuePath")) or output_path(outputs.get("latestAudioListenPriorityQueue"))
    source_audio_text = output_path(pack.get("sourceAudio")) or output_path(outputs.get("masterM4a")) or output_path(outputs.get("masterWav"))
    html_path = Path(str(pack.get("html"))) if pack.get("html") else None
    playlist_path = Path(str(pack.get("playlist"))) if pack.get("playlist") else None
    markdown_path = Path(str(pack.get("markdown"))) if pack.get("markdown") else None
    open_command_path = Path(str(pack.get("openCommand"))) if pack.get("openCommand") else None

    for label, path_text in [
        ("snippet pack markdown", str(markdown_path) if markdown_path else None),
        ("snippet pack html", str(html_path) if html_path else None),
        ("snippet playlist", str(playlist_path) if playlist_path else None),
        ("snippet open command", str(open_command_path) if open_command_path else None),
        ("listen-priority queue", queue_path_text),
        ("source audio", source_audio_text),
    ]:
        if not path_text:
            errors.append(f"Missing registered {label} path.")
            continue
        path = Path(path_text)
        if not path.exists():
            errors.append(f"Registered {label} is missing: {path}")
        elif path.is_file() and path.stat().st_size <= 0:
            errors.append(f"Registered {label} is empty: {path}")

    if pack.get("baselineId") != baseline_id:
        errors.append(f"Snippet pack baselineId {pack.get('baselineId')} does not match manifest baselineId {baseline_id}.")
    if pack.get("approvalStatus") != manifest.get("approvalStatus"):
        errors.append("Snippet pack approvalStatus does not match current manifest approvalStatus.")
    if bool(pack.get("branchInheritanceReady")) != bool(manifest.get("branchInheritanceReady")):
        errors.append("Snippet pack branchInheritanceReady does not match current manifest.")
    if bool(pack.get("branchRenderReady")) != bool(manifest.get("branchRenderReady")):
        errors.append("Snippet pack branchRenderReady does not match current manifest.")
    if pack.get("originalMediaMutated") is not False:
        errors.append("Snippet pack does not explicitly preserve originalMediaMutated=false.")
    if pack.get("approvalStateChanged") is not False or pack.get("branchStateChanged") is not False:
        errors.append("Snippet pack unexpectedly reports approval or branch state changes.")

    snippets = list(pack.get("snippets") or [])
    failures = list(pack.get("failures") or [])
    expected_count = int(pack.get("snippetCount") or len(snippets))
    if expected_count != len(snippets):
        errors.append(f"snippetCount {expected_count} does not match snippet rows {len(snippets)}.")
    if int(pack.get("renderFailureCount") or 0) != len(failures):
        errors.append("renderFailureCount does not match failure rows.")
    if failures:
        errors.append(f"Snippet pack contains {len(failures)} render failures.")

    playlist_text = playlist_path.read_text(encoding="utf-8") if playlist_path and playlist_path.exists() else ""
    snippet_checks: list[dict[str, Any]] = []
    for row in snippets:
        snippet_path_text = row.get("snippetPath")
        priority = row.get("priority")
        center = row.get("centerTimecode")
        status = "ok"
        actual_duration: float | None = None
        size_bytes = 0
        exists = False
        if not snippet_path_text:
            errors.append(f"Snippet #{priority} at {center} has no snippetPath.")
            status = "missing path"
        else:
            snippet_path = Path(str(snippet_path_text))
            exists = snippet_path.exists()
            if not exists:
                errors.append(f"Snippet #{priority} at {center} missing file: {snippet_path}")
                status = "missing file"
            else:
                size_bytes = snippet_path.stat().st_size
                if size_bytes <= 0:
                    errors.append(f"Snippet #{priority} at {center} is empty: {snippet_path}")
                    status = "empty"
                if str(snippet_path) not in playlist_text:
                    warnings.append(f"Snippet #{priority} at {center} is not referenced in the playlist.")
                if ffprobe:
                    actual_duration = ffprobe_duration(snippet_path, ffprobe)
                    if actual_duration is None:
                        errors.append(f"Snippet #{priority} at {center} has no ffprobe duration: {snippet_path}")
                        status = "duration unreadable"
                    elif actual_duration < 0.45:
                        errors.append(f"Snippet #{priority} at {center} is too short to review: {actual_duration:.3f}s")
                        status = "too short"
                    else:
                        declared = row.get("durationSeconds")
                        try:
                            declared_float = float(declared)
                        except (TypeError, ValueError):
                            declared_float = None
                        if declared_float is not None and abs(declared_float - actual_duration) > args.duration_tolerance:
                            warnings.append(
                                f"Snippet #{priority} at {center} duration differs from packet: packet {declared_float:.3f}s, actual {actual_duration:.3f}s."
                            )
        snippet_checks.append(
            {
                "priority": priority,
                "centerTimecode": center,
                "snippetPath": snippet_path_text,
                "exists": exists,
                "sizeBytes": size_bytes,
                "packetDurationSeconds": row.get("durationSeconds"),
                "actualDurationSeconds": actual_duration,
                "status": status,
            }
        )

    report = {
        "schema": "quipsly.audio-workbench.listen-priority-snippet-pack-audit.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "snippetPackPath": str(pack_path),
        "snippetPackMarkdown": str(markdown_path) if markdown_path else None,
        "snippetPackHtml": str(html_path) if html_path else None,
        "snippetPackPlaylist": str(playlist_path) if playlist_path else None,
        "snippetPackOpenCommand": str(open_command_path) if open_command_path else None,
        "queuePath": queue_path_text,
        "sourceAudio": source_audio_text,
        "expectedSnippetCount": expected_count,
        "auditedSnippetCount": len(snippet_checks),
        "snippetChecks": snippet_checks,
        "errors": errors,
        "warnings": warnings,
        "passed": len(errors) == 0,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    md_path = baseline_dir / f"audio-listen-priority-snippet-pack-audit-{slug}-{generated_at}.md"
    json_path = baseline_dir / f"audio-listen-priority-snippet-pack-audit-{slug}-{generated_at}.json"
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    write_json(json_path, report)

    outputs["latestAudioListenPrioritySnippetPackAudit"] = str(json_path)
    outputs["latestAudioListenPrioritySnippetPackAuditMarkdown"] = str(md_path)
    history = outputs.setdefault("audioListenPrioritySnippetPackAudits", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioListenPrioritySnippetPackAuditCount"] = len(history)
    manifest["audioListenPrioritySnippetPackLatestAuditPassed"] = bool(report["passed"])
    manifest["audioListenPrioritySnippetPackLatestAuditErrorCount"] = len(errors)
    manifest["audioListenPrioritySnippetPackLatestAuditWarningCount"] = len(warnings)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(json_path),
                "passed": report["passed"],
                "errors": len(errors),
                "warnings": len(warnings),
                "auditedSnippetCount": len(snippet_checks),
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
