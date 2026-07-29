#!/usr/bin/env python3
"""Create a reviewer companion for master/source balance listen checks.

The master/source balance audit is intentionally machine-shaped. This companion
turns that evidence into a human listen map: what the warning means, what to
listen for, and what safe reviewer outcome should be chosen. It does not approve
audio, fail audio, render branches, upload files, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def format_db(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:.1f} dBFS"
    return "n/a"


def flag_label(flag: str) -> str:
    labels = {
        "master_loud_without_registered_source": "Master has audible energy without a currently registered contribution source",
        "master_loud_with_aligned_source_but_no_contribution": "Master has audible energy from an aligned source that the contribution gate did not retain",
        "charlie_homer_overlap_present": "Charlie and Homer overlap is preserved",
    }
    return labels.get(flag, flag.replace("_", " "))


def flag_listen_instruction(flag: str) -> str:
    instructions = {
        "master_loud_without_registered_source": "Listen for phantom echo, room/noise bed, clipped-off speech, or a useful reaction that the current threshold model failed to classify.",
        "master_loud_with_aligned_source_but_no_contribution": "Listen for a suppressed-but-useful source, a threshold mismatch, or benign retained bleed/room tone.",
        "charlie_homer_overlap_present": "Listen for whether the overlap sounds natural and human, not chopped or phasey.",
    }
    return instructions.get(flag, "Listen for whether the warning is audible, distracting, or actually harmless.")


def flag_safe_action(flag: str) -> str:
    actions = {
        "master_loud_without_registered_source": "If harmless, mark pass. If it sounds like echo/noise or missing classification, mark needs-proof or needs-repair with the timestamp.",
        "master_loud_with_aligned_source_but_no_contribution": "If the source should have stayed audible, mark needs-repair. If the master sounds right, mark pass and keep the threshold warning as model feedback.",
        "charlie_homer_overlap_present": "If the overlap keeps conversation feel, pass. If it smears voices or creates echo, mark needs-repair.",
    }
    return actions.get(flag, "Use pass, needs-proof, or needs-repair based on the audible result.")


def queue_balance_items(queue: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in queue.get("queue") or []:
        if "audio-master-source-balance-audit" in (item.get("sources") or []):
            items.append(item)
    return items


def summarize_rows(rows: list[dict[str, Any]], audit_flag_counts: dict[str, Any]) -> dict[str, Any]:
    flag_counts: Counter[str] = Counter()
    severity_counts: Counter[str] = Counter()
    rows_by_flag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        severity_counts[str(row.get("severity", "unknown"))] += 1
        for flag in row.get("flags") or []:
            flag_counts[flag] += 1
            rows_by_flag[flag].append(row)
    full_flag_counts = {
        str(flag): int(count)
        for flag, count in (audit_flag_counts or {}).items()
        if isinstance(count, int)
    }
    all_flags = sorted(set(full_flag_counts) | set(flag_counts))
    return {
        "flagCountsInFocusRows": dict(flag_counts),
        "flagCountsInFullAudit": full_flag_counts,
        "severityCountsInFocusRows": dict(severity_counts),
        "flags": {
            flag: {
                "label": flag_label(flag),
                "listenFor": flag_listen_instruction(flag),
                "safeAction": flag_safe_action(flag),
                "fullAuditCount": full_flag_counts.get(flag, 0),
                "focusRowCount": flag_counts.get(flag, 0),
                "exampleTimes": [row.get("time") for row in rows_by_flag[flag][:8]],
            }
            for flag in all_flags
        },
    }


def build_markdown(payload: dict[str, Any]) -> str:
    audit = payload["audit"]
    paths = payload["paths"]
    queue_items = payload["queueBalanceItems"]
    focus_rows = payload["focusRows"]
    summary = payload["summary"]
    speaker_rows = []
    for speaker in audit.get("speakerSummaries") or []:
        speaker_rows.append(
            "| {speaker} | {activeSeconds:.3f}s | {masterAudibleWhenActivePercent:.1f}% | {sourceMedian} | {masterMedian} |".format(
                speaker=speaker.get("speaker", "unknown"),
                activeSeconds=float(speaker.get("activeSeconds") or 0.0),
                masterAudibleWhenActivePercent=float(speaker.get("masterAudibleWhenActivePercent") or 0.0),
                sourceMedian=format_db(speaker.get("sourceMedianActiveDbfs")),
                masterMedian=format_db(speaker.get("masterMedianDuringSpeakerActiveDbfs")),
            )
        )

    flag_sections: list[str] = []
    for flag, info in summary["flags"].items():
        flag_sections.extend(
            [
                f"### {info['label']}",
                "",
                f"- Machine flag: `{flag}`",
                f"- Full-audit count: `{info['fullAuditCount']}`; representative focus-row count: `{info['focusRowCount']}`",
                f"- Listen for: {info['listenFor']}",
                f"- Safe action: {info['safeAction']}",
                f"- Example focus times: {', '.join(f'`{time}`' for time in info['exampleTimes'] if time) or '`none`'}",
                "",
            ]
        )

    queue_rows = []
    for item in queue_items[:24]:
        queue_rows.append(
            "| {priority} | {time} | {title} | {classes} |".format(
                priority=item.get("priority", ""),
                time=item.get("time", ""),
                title=str(item.get("title", "")).replace("|", "/"),
                classes=", ".join(item.get("classifications") or []),
            )
        )

    focus_rows_md = []
    for row in focus_rows[:24]:
        focus_rows_md.append(
            "| {time} | {flags} | {master} | {charlie} | {homer} | {reference} |".format(
                time=row.get("time", ""),
                flags=", ".join(row.get("flags") or []),
                master=format_db(row.get("masterDbfs")),
                charlie=format_db(row.get("charlieContributionDbfs")),
                homer=format_db(row.get("homerContributionDbfs")),
                reference=format_db(row.get("referenceContributionDbfs")),
            )
        )

    lines = [
        f"# Episode 4 Source-Balance Listen Companion",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This companion translates machine source-balance warnings into a human listen path. It does not approve audio, fail audio, render branches, upload files, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Baseline: `{payload['baselineId']}`",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Package ready for human listen: `{str(payload['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(payload['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(payload['branchRenderReady']).lower()}`",
        "",
        "## Why this exists",
        "",
        "The earlier scary failure mode was a mastered spine that visually looked like it mostly contained Charlie and barely carried Homer. The current audit proves active contribution windows from Charlie, Homer, and the reference clip are audible in the master, then routes suspicious unexplained-energy windows into human review instead of hiding them in a side report.",
        "",
        "## Speaker survival summary",
        "",
        "| Speaker/source | Contribution active time | Master audible during active windows | Source median while active | Master median while active |",
        "|---|---:|---:|---:|---:|",
        *speaker_rows,
        "",
        "## Machine warning summary",
        "",
        f"- Compared windows: `{audit.get('comparedWindowCount')}` at `{audit.get('windowSeconds')}` seconds each.",
        f"- Machine warning count: `{audit.get('machineWarningCount')}`.",
        f"- Audit focus rows: `{len(focus_rows)}`.",
        f"- Listen-priority queue items from this audit: `{len(queue_items)}`.",
        "",
        "Flag counts across the full audit:",
        "",
        *[f"- `{flag}`: `{count}`" for flag, count in sorted((audit.get("flagCounts") or {}).items())],
        "",
        "## What each warning means",
        "",
        *flag_sections,
        "## Source-balance items in the listen-priority queue",
        "",
        "These are the source-balance warnings already routed into the primary review queue/reel.",
        "",
        "| Priority | Time | Queue title | Classifications |",
        "|---:|---:|---|---|",
        *queue_rows,
        "",
        "## Representative audit focus rows",
        "",
        "These rows preserve raw machine evidence. Use them to diagnose the threshold model only after listening; do not treat them as automatic failures.",
        "",
        "| Time | Flags | Master | Charlie contribution | Homer contribution | Reference contribution |",
        "|---:|---|---:|---:|---:|---:|",
        *focus_rows_md,
        "",
        "## Reviewer decision rule",
        "",
        "- Mark `pass` when the moment sounds natural, intentional, or harmless even if the threshold model flagged it.",
        "- Mark `needs-proof` when you cannot tell whether the warning is audible from the review snippet alone.",
        "- Mark `needs-repair` when you hear distracting echo, park noise, missing speaker energy, chopped cadence, or a source that should clearly have been retained or muted differently.",
        "",
        "## Open the actual review surfaces",
        "",
        "```bash",
        *[f"open {shell_quote(path)}" for path in paths.get("openFirst") or [] if path],
        "```",
        "",
        "## Guardrail",
        "",
        "This companion can make the listen smarter. It cannot pretend anyone listened. The v006 spine remains locked until reviewer notes or an explicit human-listen decision prove it should inherit into branch renders.",
        "",
    ]
    return "\n".join(lines)


def build_open_command(payload: dict[str, Any]) -> str:
    paths = payload["paths"]
    lines = [
        "#!/bin/zsh",
        "set -euo pipefail",
        "echo 'Opening Episode 4 source-balance listen companion...'",
        f"open {shell_quote(payload['markdownPath'])}",
    ]
    for path in paths.get("openFirst") or []:
        if path:
            lines.append(f"open {shell_quote(path)}")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    audit_path = output_path(outputs.get("latestAudioMasterSourceBalanceAudit"))
    queue_path = output_path(outputs.get("latestAudioListenPriorityQueue"))
    if not audit_path:
        raise FileNotFoundError("Manifest is missing outputs.latestAudioMasterSourceBalanceAudit")
    if not queue_path:
        raise FileNotFoundError("Manifest is missing outputs.latestAudioListenPriorityQueue")

    audit = read_json(Path(audit_path))
    queue = read_json(Path(queue_path))
    focus_rows = audit.get("focusRows") or []
    queue_items = queue_balance_items(queue)
    summary = summarize_rows(focus_rows, audit.get("flagCounts") or {})

    output_json = baseline_dir / f"audio-source-balance-listen-companion-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-source-balance-listen-companion-{slug}-{generated_at}.md"
    output_command = baseline_dir / f"OPEN_SOURCE_BALANCE_LISTEN_COMPANION-{slug}-{generated_at}.command"

    open_first = [
        output_path(outputs.get("latestAudioListenPriorityReviewReelOpenCommand")),
        output_path(outputs.get("latestAudioListenPriorityConsoleHtml")),
        output_path(outputs.get("latestAudioMasterSourceBalanceAuditMarkdown")),
    ]

    payload = {
        "schema": "quipsly.audio-workbench.source-balance-listen-companion.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "auditPath": audit_path,
        "queuePath": queue_path,
        "focusRowCount": len(focus_rows),
        "queueBalanceItemCount": len(queue_items),
        "summary": summary,
        "focusRows": focus_rows,
        "queueBalanceItems": queue_items,
        "paths": {
            "openFirst": [path for path in open_first if path],
            "auditMarkdown": output_path(outputs.get("latestAudioMasterSourceBalanceAuditMarkdown")),
            "queueMarkdown": output_path(outputs.get("latestAudioListenPriorityQueueMarkdown")),
            "reviewReelMarkdown": output_path(outputs.get("latestAudioListenPriorityReviewReelMarkdown")),
            "reviewReelOpenCommand": output_path(outputs.get("latestAudioListenPriorityReviewReelOpenCommand")),
            "listenPriorityConsoleHtml": output_path(outputs.get("latestAudioListenPriorityConsoleHtml")),
        },
        "audit": audit,
        "markdownPath": str(output_md),
        "openCommandPath": str(output_command),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    output_json.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    output_md.write_text(build_markdown(payload), encoding="utf-8")
    output_command.write_text(build_open_command(payload), encoding="utf-8")
    os.chmod(output_command, 0o755)

    outputs["latestAudioSourceBalanceListenCompanion"] = str(output_json)
    outputs["latestAudioSourceBalanceListenCompanionMarkdown"] = str(output_md)
    outputs["latestAudioSourceBalanceListenCompanionOpenCommand"] = str(output_command)
    history = outputs.setdefault("audioSourceBalanceListenCompanions", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSourceBalanceListenCompanionCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "openCommand": str(output_command),
                "focusRowCount": len(focus_rows),
                "queueBalanceItemCount": len(queue_items),
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
