#!/usr/bin/env python3
"""Build a speaker-activity review board for a conformed audio baseline.

The board joins the source activity map, speaker-gap automation, listen-priority
queue, and bleed/gap proof audit into a single reviewer/agent surface. It is
for inspecting speaker-aware cleanup and deciding what to listen for. It does
not approve audio, fail audio, render branches, upload files, or mutate original
media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(outputs: dict[str, Any], key: str) -> Path | None:
    value = outputs.get(key)
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def fmt_seconds(value: Any) -> str:
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return "unknown"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours}:{minutes:02d}:{secs:05.2f}"
    return f"{minutes}:{secs:05.2f}"


def fmt_db(value: Any) -> str:
    try:
        return f"{float(value):.1f} dBFS"
    except (TypeError, ValueError):
        return "n/a"


def nearest_queue_item(queue: list[dict[str, Any]], start: float, tolerance: float = 20.0) -> dict[str, Any] | None:
    best: tuple[float, dict[str, Any]] | None = None
    for item in queue:
        try:
            time_sec = float(item.get("timeSec"))
        except (TypeError, ValueError):
            continue
        distance = abs(time_sec - start)
        if distance <= tolerance and (best is None or distance < best[0]):
            best = (distance, item)
    return best[1] if best else None


def compact_profile(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "purpose": profile.get("purpose"),
        "gapAction": profile.get("gapAction"),
        "editableParameters": profile.get("editableParameters") or {},
        "filter": profile.get("filter"),
    }


def build_rows(bleed_audit: dict[str, Any], queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in bleed_audit.get("focusWindows") or []:
        row = item.get("row") if isinstance(item.get("row"), dict) else {}
        start = float(item.get("start") or row.get("start") or 0.0)
        nearest = nearest_queue_item(queue, start)
        flags = row.get("flags") or []
        rows.append(
            {
                "start": start,
                "end": float(item.get("end") or row.get("end") or start),
                "timecode": item.get("timecode") or row.get("timecode") or fmt_seconds(start),
                "reason": item.get("reason") or "Review speaker cleanup",
                "flags": flags,
                "charlieAlignedDbfs": row.get("charlieAlignedDbfs"),
                "charlieContributionDbfs": row.get("charlieContributionDbfs"),
                "charlieDeltaDb": row.get("charlieDeltaDb"),
                "homerAlignedDbfs": row.get("homerAlignedDbfs"),
                "homerContributionDbfs": row.get("homerContributionDbfs"),
                "homerDeltaDb": row.get("homerDeltaDb"),
                "nearestQueueTitle": nearest.get("title") if nearest else None,
                "nearestQueueTime": nearest.get("time") if nearest else None,
                "listenQuestions": nearest.get("listenQuestions") if nearest else [],
                "safeActionsIfFails": nearest.get("safeActionsIfFails") if nearest else [],
            }
        )
    rows.sort(key=lambda row: row["start"])
    return rows


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Speaker Activity Review Board",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This board explains the speaker-aware cleanup state for human and agent review. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Source activity summary",
        "",
        f"- Activity windows scanned: `{report['activitySummary'].get('windowCount')}`",
        f"- High-priority activity windows: `{report['activitySummary'].get('highPriorityCount')}`",
        f"- Activity flag counts: `{report['activitySummary'].get('flagCounts')}`",
        f"- Bleed/gap focus windows: `{report['focusWindowCount']}`",
        f"- Listen-priority queue items: `{report['listenPriorityQueueCount']}`",
        "",
        "## Automation profiles",
        "",
    ]
    for speaker, profile in report.get("automationProfiles", {}).items():
        params = profile.get("editableParameters") or {}
        lines.extend(
            [
                f"### {speaker.title()}",
                "",
                f"- Purpose: {profile.get('purpose')}",
                f"- Gap action: {profile.get('gapAction')}",
                f"- Editable parameters: `{params}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Listen focus windows",
            "",
            "| Time | Reason | Flags | Charlie aligned/contrib | Homer aligned/contrib | Closest queue item |",
            "|---|---|---|---:|---:|---|",
        ]
    )
    for row in report.get("focusRows", []):
        flags = ", ".join(row.get("flags") or []) or "none"
        charlie = f"{fmt_db(row.get('charlieAlignedDbfs'))} / {fmt_db(row.get('charlieContributionDbfs'))}"
        homer = f"{fmt_db(row.get('homerAlignedDbfs'))} / {fmt_db(row.get('homerContributionDbfs'))}"
        queue = row.get("nearestQueueTitle") or "not in nearest queue window"
        lines.append(f"| {row.get('timecode')} | {row.get('reason')} | {flags} | {charlie} | {homer} | {queue} |")
    lines.extend(
        [
            "",
            "## How to use this board",
            "",
            "1. Start with windows that mention over-gating, echo, bleed, park noise, or unexplained master energy.",
            "2. Compare the listening M4A/review reel against source-balance A/B proof snippets for the same timecode.",
            "3. If the master sounds natural, export pass notes and keep v006 locked until the guarded approval command is run.",
            "4. If a window sounds chopped, echo-heavy, or missing Homer/Charlie, export needs-repair notes and route only that window to v007/focused-proof repair.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for row in report.get("focusRows", []):
        flags = ", ".join(row.get("flags") or []) or "none"
        questions = "<br>".join(html.escape(q) for q in row.get("listenQuestions") or []) or "No linked queue question."
        rows.append(
            "<tr>"
            f"<td><strong>{html.escape(str(row.get('timecode')))}</strong><br><span>{fmt_seconds(row.get('start'))} to {fmt_seconds(row.get('end'))}</span></td>"
            f"<td>{html.escape(str(row.get('reason')))}<br><code>{html.escape(flags)}</code></td>"
            f"<td>Aligned {html.escape(fmt_db(row.get('charlieAlignedDbfs')))}<br>Contrib {html.escape(fmt_db(row.get('charlieContributionDbfs')))}<br>Delta {html.escape(fmt_db(row.get('charlieDeltaDb')))}</td>"
            f"<td>Aligned {html.escape(fmt_db(row.get('homerAlignedDbfs')))}<br>Contrib {html.escape(fmt_db(row.get('homerContributionDbfs')))}<br>Delta {html.escape(fmt_db(row.get('homerDeltaDb')))}</td>"
            f"<td>{html.escape(str(row.get('nearestQueueTitle') or 'No nearby queue item'))}<br>{questions}</td>"
            "</tr>"
        )
    profile_cards = []
    for speaker, profile in report.get("automationProfiles", {}).items():
        params = html.escape(json.dumps(profile.get("editableParameters") or {}, sort_keys=True))
        profile_cards.append(
            f"<section class='card'><h3>{html.escape(speaker.title())}</h3>"
            f"<p><strong>Purpose:</strong> {html.escape(str(profile.get('purpose')))}</p>"
            f"<p><strong>Gap action:</strong> {html.escape(str(profile.get('gapAction')))}</p>"
            f"<p><strong>Editable parameters:</strong> <code>{params}</code></p></section>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Episode 4 Speaker Activity Review Board</title>
<style>
:root {{ color-scheme: dark; --bg:#121814; --panel:#1c261f; --ink:#f4ecd5; --muted:#b9ad95; --gold:#f2c94c; --green:#78d891; --clay:#d66b4d; --line:#334335; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; background:radial-gradient(circle at top left,#263c2d,#121814 55%); color:var(--ink); }}
main {{ max-width:1200px; margin:0 auto; padding:32px; }}
h1 {{ margin:0 0 8px; font-size:34px; }}
p, li {{ color:var(--muted); line-height:1.5; }}
.badges {{ display:flex; flex-wrap:wrap; gap:10px; margin:18px 0 26px; }}
.badge {{ padding:9px 12px; border:1px solid var(--line); border-radius:999px; background:rgba(255,255,255,.04); }}
.badge strong {{ color:var(--gold); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
.card {{ background:rgba(28,38,31,.86); border:1px solid var(--line); border-radius:18px; padding:18px; box-shadow:0 12px 30px rgba(0,0,0,.22); }}
.card h3 {{ margin-top:0; color:var(--green); }}
table {{ width:100%; border-collapse:separate; border-spacing:0 8px; }}
th {{ color:var(--gold); text-align:left; font-size:12px; letter-spacing:.08em; text-transform:uppercase; }}
td {{ background:rgba(28,38,31,.9); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:12px; vertical-align:top; }}
td:first-child {{ border-left:1px solid var(--line); border-radius:14px 0 0 14px; }}
td:last-child {{ border-right:1px solid var(--line); border-radius:0 14px 14px 0; }}
code {{ color:var(--gold); white-space:normal; }}
span {{ color:var(--muted); font-size:12px; }}
</style>
</head>
<body><main>
<h1>Speaker Activity Review Board</h1>
<p>Human and agent visibility into Episode 4 speaker-aware cleanup. This board explains what the gate/ducking pipeline tried to preserve or suppress, where review is risky, and what to listen for before any branch inheritance is unlocked.</p>
<div class="badges">
  <div class="badge"><strong>Approval</strong> {html.escape(str(report['approvalStatus']))}</div>
  <div class="badge"><strong>Package Ready</strong> {str(report['packageReadyForHumanListen']).lower()}</div>
  <div class="badge"><strong>Branch Inherit</strong> {str(report['branchInheritanceReady']).lower()}</div>
  <div class="badge"><strong>Focus Windows</strong> {report['focusWindowCount']}</div>
  <div class="badge"><strong>Queue Items</strong> {report['listenPriorityQueueCount']}</div>
</div>
<section class="grid">{''.join(profile_cards)}</section>
<h2>Listen focus windows</h2>
<table><thead><tr><th>Time</th><th>Risk</th><th>Charlie</th><th>Homer</th><th>Queue guidance</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</main></body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    activity_path = output_path(outputs, "sourceActivity")
    automation_path = output_path(outputs, "speakerGapAutomation")
    bleed_path = output_path(outputs, "latestSpeakerBleedGapProofAudit")
    queue_path = output_path(outputs, "latestAudioListenPriorityQueue")
    required = {
        "sourceActivity": activity_path,
        "speakerGapAutomation": automation_path,
        "latestSpeakerBleedGapProofAudit": bleed_path,
        "latestAudioListenPriorityQueue": queue_path,
    }
    missing = [key for key, path in required.items() if not path or not path.exists()]
    if missing:
        raise SystemExit(f"Missing required speaker activity inputs: {', '.join(missing)}")

    activity = read_json(activity_path)  # type: ignore[arg-type]
    automation = read_json(automation_path)  # type: ignore[arg-type]
    bleed_audit = read_json(bleed_path)  # type: ignore[arg-type]
    queue_report = read_json(queue_path)  # type: ignore[arg-type]
    queue = queue_report.get("queue") if isinstance(queue_report.get("queue"), list) else []

    report = {
        "schema": "quipsly.audio-workbench.speaker-activity-review-board.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "activitySummary": activity.get("classificationSummary") or {},
        "retentionSummary": activity.get("retentionSummary") or {},
        "automationSummary": automation.get("automationSummary") or {},
        "automationProfiles": {key: compact_profile(value) for key, value in (automation.get("profiles") or {}).items()},
        "mixAutomation": automation.get("mixAutomation") or {},
        "flagCounts": bleed_audit.get("flagCounts") or {},
        "focusWindowCount": len(bleed_audit.get("focusWindows") or []),
        "listenPriorityQueueCount": len(queue),
        "focusRows": build_rows(bleed_audit, queue),
        "inputs": {key: str(path) for key, path in required.items()},
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    output_json = baseline_dir / f"audio-speaker-activity-review-board-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-speaker-activity-review-board-{slug}-{generated_at}.md"
    output_html = baseline_dir / f"audio-speaker-activity-review-board-{slug}-{generated_at}.html"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    report["html"] = str(output_html)

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    output_html.write_text(render_html(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSpeakerActivityReviewBoard"] = str(output_json)
    outputs["latestAudioSpeakerActivityReviewBoardMarkdown"] = str(output_md)
    outputs["latestAudioSpeakerActivityReviewBoardHtml"] = str(output_html)
    history = outputs.setdefault("audioSpeakerActivityReviewBoards", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSpeakerActivityReviewBoardCount"] = len(history)
    manifest["audioSpeakerActivityReviewBoardFocusWindowCount"] = report["focusWindowCount"]
    manifest["audioSpeakerActivityReviewBoardQueueItemCount"] = report["listenPriorityQueueCount"]
    manifest["audioSpeakerActivityReviewBoardOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "markdown": str(output_md),
        "html": str(output_html),
        "json": str(output_json),
        "focusWindowCount": report["focusWindowCount"],
        "listenPriorityQueueCount": report["listenPriorityQueueCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
