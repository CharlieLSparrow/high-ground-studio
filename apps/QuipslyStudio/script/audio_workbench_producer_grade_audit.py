#!/usr/bin/env python3
"""Create a producer-grade machine audit for an Episode audio baseline.

This consolidates existing machine evidence into a practical producer review
surface: speaker preservation, smoothness risk, source-balance warnings,
reviewability, and next listen moments.

It is not human listen approval. It does not approve audio, fail audio, unlock
branches, render branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PRODUCER_NOTES_SCHEMA = "quipsly.audio-workbench.producer-grade-notes.v1"


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "jsonPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def load_report(outputs: dict[str, Any], key: str) -> tuple[str | None, dict[str, Any]]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return path, {}
    try:
        return path, read_json(Path(path))
    except json.JSONDecodeError:
        return path, {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def format_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    ms = int(round((seconds - total) * 1000.0))
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
    return f"{m:02d}:{s:02d}.{ms:03d}"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path: str | None) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except ValueError:
        return ""


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def float_value(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def score_baseline(
    manifest: dict[str, Any],
    smoothness: dict[str, Any],
    source_balance: dict[str, Any],
    spine_sanity: dict[str, Any],
    handoff: dict[str, Any],
    parameter_sweep_inbox_smoke: dict[str, Any],
) -> tuple[int, list[str], list[str]]:
    score = 100
    strengths: list[str] = []
    risks: list[str] = []

    if manifest.get("packageReadyForHumanListen"):
        strengths.append("Package is ready for human listen review.")
    else:
        score -= 20
        risks.append("Package is not marked ready for human listen.")

    if spine_sanity.get("passed"):
        strengths.append("Machine sanity confirms Charlie and Homer remain materially audible.")
    else:
        score -= 18
        risks.append("Speaker audibility sanity is missing or failed.")

    missing_artifacts = int_value(handoff.get("missingArtifactCount"))
    if missing_artifacts == 0 and handoff:
        strengths.append("Handoff index reports no missing linked artifacts.")
    else:
        score -= 12
        risks.append(f"Handoff index missing artifact count is {missing_artifacts}.")

    long_spans = smoothness.get("longSilenceSpans") if isinstance(smoothness.get("longSilenceSpans"), list) else []
    longest_silence = max((float_value(row.get("durationSec")) for row in long_spans if isinstance(row, dict)), default=0.0)
    if longest_silence >= 20.0:
        score -= 8
        risks.append(f"Longest low-level span is {longest_silence:.1f}s and needs human context.")
    elif longest_silence >= 8.0:
        score -= 4
        risks.append(f"Longest low-level span is {longest_silence:.1f}s.")
    else:
        strengths.append("No long low-level span over 8 seconds is present in the smoothness audit.")

    classification_counts = smoothness.get("classificationCounts") if isinstance(smoothness.get("classificationCounts"), dict) else {}
    hard_edges = int_value(classification_counts.get("hard-silence-edge-listen-check"))
    large_edges = int_value(classification_counts.get("large-level-jump-listen-check"))
    if hard_edges or large_edges:
        penalty = min(8, 2 + (hard_edges // 500) + (large_edges // 700))
        score -= penalty
        risks.append(f"Smoothness audit reports {hard_edges} hard-silence edges and {large_edges} large level jumps.")
    else:
        strengths.append("Smoothness audit reports no hard silence edges or large jumps.")

    flag_counts = source_balance.get("flagCounts") if isinstance(source_balance.get("flagCounts"), dict) else {}
    if flag_counts:
        warning_total = sum(int_value(value) for value in flag_counts.values())
        if warning_total:
            score -= min(6, max(2, warning_total // 400))
            risks.append(f"Source-balance audit carries {warning_total} warning-family observations for human sampling.")
    else:
        score -= 4
        risks.append("Source-balance audit is missing warning-family counts.")

    if parameter_sweep_inbox_smoke.get("passed"):
        strengths.append("Parameter-sweep notes inbox smoke passes, so reviewer sweep choices have a safe return path.")
    else:
        score -= 6
        risks.append("Parameter-sweep notes inbox smoke is missing or failed.")

    score = max(0, min(100, score))
    return score, strengths, risks


def risk_level(score: int) -> str:
    if score >= 85:
        return "medium-review-risk"
    if score >= 70:
        return "high-review-risk"
    return "repair-before-review-risk"


def moment(label: str, time_sec: float, severity: str, reason: str, source: str) -> dict[str, Any]:
    return {
        "label": label,
        "timeSec": round(float_value(time_sec), 3),
        "time": format_time(float_value(time_sec)),
        "severity": severity,
        "reason": reason,
        "source": source,
    }


def build_moments(
    smoothness: dict[str, Any],
    source_balance: dict[str, Any],
    listen_queue: dict[str, Any],
) -> list[dict[str, Any]]:
    moments: list[dict[str, Any]] = []
    for row in (listen_queue.get("queue") if isinstance(listen_queue.get("queue"), list) else [])[:12]:
        if not isinstance(row, dict):
            continue
        moments.append(
            moment(
                str(row.get("title") or "Listen-priority queue item"),
                float_value(row.get("timeSec")),
                "high" if int_value(row.get("riskPriority")) <= 1 else "medium",
                "; ".join(str(reason) for reason in (row.get("reasons") or [])[:2]),
                "listen-priority queue",
            )
        )

    for row in (smoothness.get("longSilenceSpans") if isinstance(smoothness.get("longSilenceSpans"), list) else [])[:8]:
        if not isinstance(row, dict):
            continue
        duration = float_value(row.get("durationSec"))
        if duration < 8.0:
            continue
        moments.append(
            moment(
                f"Low-level span {duration:.1f}s",
                float_value(row.get("startSec")),
                "high" if duration >= 15.0 else "medium",
                "Check whether this is intentional silence, a skipped section, or over-gating.",
                "smoothness audit",
            )
        )

    for row in (smoothness.get("largestTransitions") if isinstance(smoothness.get("largestTransitions"), list) else [])[:12]:
        if not isinstance(row, dict):
            continue
        classification = str(row.get("classification") or "")
        if "hard" not in classification and "large" not in classification:
            continue
        moments.append(
            moment(
                str(row.get("classification") or "Envelope transition"),
                float_value(row.get("timeSec")),
                "medium",
                f"Envelope changed by {float_value(row.get('absDeltaDb')):.1f}dB.",
                "smoothness audit",
            )
        )

    focus_rows = source_balance.get("focusRows") if isinstance(source_balance.get("focusRows"), list) else []
    sorted_focus = sorted(
        [row for row in focus_rows if isinstance(row, dict)],
        key=lambda row: int_value(row.get("severity")),
        reverse=True,
    )
    for row in sorted_focus[:12]:
        flags = ", ".join(str(flag) for flag in (row.get("flags") or []))
        moments.append(
            moment(
                "Source-balance focus row",
                float_value(row.get("startSec")),
                "medium" if int_value(row.get("severity")) < 5 else "high",
                f"Flags: {flags or 'source-balance context'}; master {float_value(row.get('masterDbfs')):.1f} dBFS.",
                "source-balance audit",
            )
        )

    by_key: dict[str, dict[str, Any]] = {}
    severity_rank = {"high": 0, "medium": 1, "low": 2}
    for item in moments:
        bucket = round(float_value(item["timeSec"]) / 5.0) * 5
        key = f"{bucket}:{item['label'][:24]}"
        existing = by_key.get(key)
        if not existing or severity_rank.get(item["severity"], 9) < severity_rank.get(existing["severity"], 9):
            by_key[key] = item
    return sorted(by_key.values(), key=lambda row: (severity_rank.get(row["severity"], 9), row["timeSec"]))[:48]


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Producer-Grade Audio Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a machine producer-readiness map, not human listen approval. It consolidates existing evidence so a reviewer knows where to listen first and what failure would mean.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['status']}`",
        f"- Score: `{report['producerScore']}` / 100",
        f"- Risk level: `{report['riskLevel']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Strengths",
        "",
    ]
    lines.extend(f"- {item}" for item in report["strengths"])
    lines.extend(["", "## Risks to listen for", ""])
    lines.extend(f"- {item}" for item in report["risks"])
    lines.extend(
        [
            "",
            "## Producer listen moments",
            "",
            "| Severity | Time | Source | Moment | Why listen |",
            "|---|---:|---|---|---|",
        ]
    )
    for item in report["producerListenMoments"]:
        lines.append(
            f"| `{item['severity']}` | `{item['time']}` | {item['source']} | {item['label']} | {item['reason']} |"
        )
    lines.extend(
        [
            "",
            "## Speaker sanity",
            "",
            "| Speaker | Passed | Active seconds | Audible while active | Quiet active windows |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for item in report["speakerChecks"]:
        lines.append(
            f"| {item.get('speaker')} | `{str(item.get('passed')).lower()}` | `{item.get('activeSeconds')}` | `{item.get('masterAudibleWhenActivePercent')}%` | `{item.get('masterQuietWhenActiveWindowCount')}` |"
        )
    lines.extend(
        [
            "",
            "## Meaning",
            "",
            "A high machine score means the workbench has coherent evidence, speaker audibility, review surfaces, and safe return paths. It still cannot prove the edit feels human. Use this audit to focus human listening, then record pass, needs-proof, or needs-repair through the guarded notes flow.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    audio_src = file_uri(report.get("masterM4a")) or file_uri(report.get("masterWav"))
    moments = report["producerListenMoments"]
    notes_seed = json.dumps(
        {
            "schema": PRODUCER_NOTES_SCHEMA,
            "baselineId": report["baselineId"],
            "sourceAuditJson": report.get("json"),
            "sourceAuditMarkdown": report.get("markdown"),
            "sourceAuditHtml": report.get("html"),
            "items": [
                {
                    "momentId": f"producer-{index:02d}-{safe_slug(str(item.get('label') or 'moment'))}",
                    "index": index,
                    "timeSec": item.get("timeSec"),
                    "time": item.get("time"),
                    "severity": item.get("severity"),
                    "source": item.get("source"),
                    "label": item.get("label"),
                    "reason": item.get("reason"),
                    "decision": "undecided",
                    "notes": "",
                }
                for index, item in enumerate(moments, start=1)
            ],
        },
        sort_keys=True,
    )
    rows = "\n".join(
        "<tr>"
        f"<td><span class='badge {html.escape(item['severity'])}'>{html.escape(item['severity'])}</span></td>"
        f"<td><button onclick='seek({float_value(item['timeSec']):.3f})'>{html.escape(item['time'])}</button></td>"
        f"<td>{html.escape(item['source'])}</td>"
        f"<td>{html.escape(item['label'])}</td>"
        f"<td>{html.escape(item['reason'])}</td>"
        f"<td><select id='decision-{index}'><option value='undecided'>Undecided</option><option value='pass'>Pass</option><option value='needs-proof'>Needs proof</option><option value='needs-repair'>Needs repair</option></select></td>"
        f"<td><textarea id='notes-{index}' placeholder='What did you hear?'></textarea></td>"
        "</tr>"
        for index, item in enumerate(moments)
    )
    strengths = "\n".join(f"<li>{html.escape(item)}</li>" for item in report["strengths"])
    risks = "\n".join(f"<li>{html.escape(item)}</li>" for item in report["risks"])
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Producer-Grade Audio Audit</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #151913;
      --panel: #222a1f;
      --ink: #f5efd8;
      --muted: #c9b98e;
      --gold: #f1c84b;
      --moss: #77b36a;
      --clay: #d66f45;
      --bark: #3b2b1d;
    }}
    body {{ margin: 0; font-family: Avenir Next, Helvetica, sans-serif; background: radial-gradient(circle at top left, #31402e, var(--bg) 42%); color: var(--ink); }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
    h1 {{ font-size: 34px; margin: 0 0 8px; letter-spacing: -0.03em; }}
    .lede {{ color: var(--muted); max-width: 860px; line-height: 1.55; }}
    .cards {{ display: grid; grid-template-columns: repeat(5, minmax(120px, 1fr)); gap: 12px; margin: 24px 0; }}
    .card {{ background: color-mix(in srgb, var(--panel) 88%, black); border: 1px solid rgba(241,200,75,.2); border-radius: 18px; padding: 16px; box-shadow: 0 18px 40px rgba(0,0,0,.25); }}
    .card small {{ display: block; color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }}
    .card strong {{ display: block; font-size: 24px; margin-top: 6px; }}
    audio {{ width: 100%; margin: 14px 0 26px; }}
    section {{ background: rgba(34,42,31,.86); border: 1px solid rgba(245,239,216,.11); border-radius: 22px; padding: 20px; margin: 18px 0; }}
    table {{ border-collapse: collapse; width: 100%; font-size: 14px; }}
    th, td {{ border-bottom: 1px solid rgba(245,239,216,.1); padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; }}
    button {{ border: 0; border-radius: 999px; padding: 7px 12px; color: #19150f; background: var(--gold); font-weight: 800; cursor: pointer; }}
    select, textarea, input {{ width: 100%; box-sizing: border-box; border: 1px solid rgba(245,239,216,.18); border-radius: 12px; background: rgba(0,0,0,.22); color: var(--ink); padding: 8px; }}
    textarea {{ min-height: 52px; resize: vertical; }}
    .actions {{ display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 16px; }}
    .badge {{ border-radius: 999px; padding: 4px 9px; font-size: 11px; font-weight: 800; text-transform: uppercase; }}
    .badge.high {{ background: rgba(214,111,69,.24); color: #ffb08f; }}
    .badge.medium {{ background: rgba(241,200,75,.2); color: #ffe27b; }}
    .badge.low {{ background: rgba(119,179,106,.2); color: #a9ee9a; }}
    ul {{ line-height: 1.55; }}
    code {{ color: #ffe27b; }}
  </style>
</head>
<body>
<main>
  <h1>Producer-Grade Audio Audit</h1>
  <p class="lede">Machine evidence for where Episode 4 should be listened to first. This does not approve the audio. It keeps branch rendering locked until a real human listen decision is recorded.</p>
  <div class="cards">
    <div class="card"><small>Score</small><strong>{report['producerScore']}/100</strong></div>
    <div class="card"><small>Risk</small><strong>{html.escape(report['riskLevel'])}</strong></div>
    <div class="card"><small>Approval</small><strong>{html.escape(str(report['approvalStatus']))}</strong></div>
    <div class="card"><small>Moments</small><strong>{len(moments)}</strong></div>
    <div class="card"><small>Branches</small><strong>{'locked' if not report['branchRenderReady'] else 'ready'}</strong></div>
  </div>
  <audio id="player" controls src="{html.escape(audio_src)}"></audio>
  <section>
    <h2>Strengths</h2>
    <ul>{strengths}</ul>
  </section>
  <section>
    <h2>Risks to listen for</h2>
    <ul>{risks}</ul>
  </section>
  <section>
    <h2>Producer listen moments</h2>
    <p class="lede">Mark each moment as pass, needs proof, or needs repair. Exported notes are evidence for the inbox; they do not approve the whole spine by themselves.</p>
    <div class="actions">
      <label>Reviewer <input id="reviewer" placeholder="Charlie, Mako, Homer..." /></label>
      <button onclick="exportNotes()">Export producer notes JSON</button>
      <a href="{html.escape(file_uri(report.get('notesTemplate')))}">Open blank notes template</a>
    </div>
    <table>
      <thead><tr><th>Severity</th><th>Jump</th><th>Source</th><th>Moment</th><th>Why listen</th><th>Decision</th><th>Notes</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </section>
</main>
<script>
const notesSeed = {notes_seed};
function seek(seconds) {{
  const player = document.getElementById('player');
  player.currentTime = seconds;
  player.play();
}}
function exportNotes() {{
  const packet = {{
    ...notesSeed,
    exportedAt: new Date().toISOString(),
    reviewer: document.getElementById('reviewer').value || '',
    items: notesSeed.items.map((item, index) => ({{
      ...item,
      decision: document.getElementById(`decision-${{index}}`).value,
      notes: document.getElementById(`notes-${{index}}`).value || ''
    }}))
  }};
  const blob = new Blob([JSON.stringify(packet, null, 2) + '\\n'], {{type: 'application/json'}});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `{safe_slug(str(report['baselineId']))}-producer-grade-notes-${{new Date().toISOString().replace(/[:.]/g, '-')}}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}}
</script>
</body>
</html>
"""


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

    smoothness_path, smoothness = load_report(outputs, "latestAudioMasterSmoothnessAudit")
    source_balance_path, source_balance = load_report(outputs, "latestAudioMasterSourceBalanceAudit")
    spine_sanity_path, spine_sanity = load_report(outputs, "latestAudioSpineListenSanityCheck")
    listen_queue_path, listen_queue = load_report(outputs, "latestAudioListenPriorityQueue")
    handoff_path, handoff = load_report(outputs, "latestReviewHandoffIndex")
    sweep_inbox_path, sweep_inbox = load_report(outputs, "latestAudioWorkbenchParameterSweepNotesInbox")
    sweep_smoke_path, sweep_smoke = load_report(outputs, "latestAudioWorkbenchParameterSweepNotesInboxSmoke")

    score, strengths, risks = score_baseline(manifest, smoothness, source_balance, spine_sanity, handoff, sweep_smoke)
    moments = build_moments(smoothness, source_balance, listen_queue)
    master_wav = output_path(outputs.get("masterWav"))
    master_m4a = output_path(outputs.get("masterM4a"))
    status = "machine-producer-review-ready-human-listen-required" if score >= 70 and spine_sanity.get("passed") else "machine-producer-repair-recommended-before-approval"

    work_dir = baseline_dir / f"audio-producer-grade-audit-{slug}-{generated_at}"
    work_dir.mkdir(parents=True, exist_ok=True)
    output_json = work_dir / "producer-grade-audio-audit.json"
    output_md = work_dir / "producer-grade-audio-audit.md"
    output_html = work_dir / "producer-grade-audio-audit.html"
    notes_template = work_dir / "producer-grade-notes-template.json"
    open_command = work_dir / "open-producer-grade-audio-audit.command"

    report = {
        "schema": "quipsly.audio-workbench.producer-grade-audit.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "producerScore": score,
        "riskLevel": risk_level(score),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "masterWav": master_wav,
        "masterM4a": master_m4a,
        "sourceReports": {
            "smoothness": smoothness_path,
            "sourceBalance": source_balance_path,
            "spineSanity": spine_sanity_path,
            "listenPriorityQueue": listen_queue_path,
            "handoff": handoff_path,
            "parameterSweepNotesInbox": sweep_inbox_path,
            "parameterSweepNotesInboxSmoke": sweep_smoke_path,
        },
        "strengths": strengths,
        "risks": risks,
        "producerListenMoments": moments,
        "speakerChecks": spine_sanity.get("speakerChecks") if isinstance(spine_sanity.get("speakerChecks"), list) else [],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
        "html": str(output_html),
        "notesSchema": PRODUCER_NOTES_SCHEMA,
        "notesTemplate": str(notes_template),
        "openCommand": str(open_command),
    }
    write_json(
        notes_template,
        {
            "schema": PRODUCER_NOTES_SCHEMA,
            "baselineId": baseline_id,
            "exportedAt": "",
            "reviewer": "",
            "sourceAuditJson": str(output_json),
            "sourceAuditMarkdown": str(output_md),
            "sourceAuditHtml": str(output_html),
            "items": [
                {
                    "momentId": f"producer-{index:02d}-{safe_slug(str(item.get('label') or 'moment'))}",
                    "index": index,
                    "timeSec": item.get("timeSec"),
                    "time": item.get("time"),
                    "severity": item.get("severity"),
                    "source": item.get("source"),
                    "label": item.get("label"),
                    "reason": item.get("reason"),
                    "decision": "undecided",
                    "notes": "",
                }
                for index, item in enumerate(moments, start=1)
            ],
        },
    )
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")
    output_html.write_text(render_html(report), encoding="utf-8")
    open_command.write_text("#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(output_html)) + "\n", encoding="utf-8")
    os.chmod(open_command, 0o755)

    previous_approval = manifest.get("approvalStatus")
    previous_branch_inheritance = bool(manifest.get("branchInheritanceReady"))
    previous_branch_render = bool(manifest.get("branchRenderReady"))
    outputs["latestAudioProducerGradeAudit"] = str(output_json)
    outputs["latestAudioProducerGradeAuditMarkdown"] = str(output_md)
    outputs["latestAudioProducerGradeAuditHtml"] = str(output_html)
    outputs["latestAudioProducerGradeNotesTemplate"] = str(notes_template)
    outputs["latestAudioProducerGradeAuditOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioProducerGradeAuditHistory", [])
    if isinstance(history, list):
        history.append(str(output_json))
    manifest["audioProducerGradeAuditCount"] = int(manifest.get("audioProducerGradeAuditCount") or 0) + 1
    manifest["audioProducerGradeAuditScore"] = score
    manifest["audioProducerGradeAuditStatus"] = status
    manifest["approvalStatus"] = previous_approval
    manifest["packageReadyForHumanListen"] = bool(manifest.get("packageReadyForHumanListen"))
    manifest["branchInheritanceReady"] = previous_branch_inheritance
    manifest["branchRenderReady"] = previous_branch_render
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "status": status,
        "producerScore": score,
        "riskLevel": risk_level(score),
        "momentCount": len(moments),
        "json": str(output_json),
        "markdown": str(output_md),
        "html": str(output_html),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
