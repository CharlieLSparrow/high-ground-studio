#!/usr/bin/env python3
"""Create a full-length speaker contribution ledger for an audio baseline.

This is an inspection and quality-control artifact. It uses the existing source
activity CSV/report plus machine audits to answer the practical producer
question: where do Charlie, Homer, and reference material actually survive in
the mastered spine, and which windows need human listening?

It does not approve audio, fail audio, render audio/video, unlock branches,
upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SPEAKERS = {
    "charlie": {
        "label": "Charlie",
        "aligned": "charlieAlignedDbfs",
        "contribution": "charlieContributionDbfs",
        "lossFlag": "charlie_loss_or_overgate_risk",
        "bleedFlag": "charlie_echo_bleed_may_remain_under_homer",
    },
    "homer": {
        "label": "Homer",
        "aligned": "homerAlignedDbfs",
        "contribution": "homerContributionDbfs",
        "lossFlag": "homer_loss_or_overgate_risk",
        "bleedFlag": "homer_noise_bleed_may_remain_under_charlie",
    },
    "reference": {
        "label": "Reference",
        "aligned": "referenceAlignedDbfs",
        "contribution": "referenceContributionDbfs",
        "lossFlag": "reference_loss_or_overgate_risk",
        "bleedFlag": "reference_bleed_may_remain",
    },
}


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
        for key in ("path", "markdownPath", "htmlPath", "jsonPath", "openCommand", "csvPath"):
            sub = value.get(key)
            if isinstance(sub, str) and sub:
                return sub
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path: Path | None) -> str:
    if path is None:
        return ""
    return path.resolve().as_uri()


def float_or_none(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def float_value(value: Any, default: float = 0.0) -> float:
    parsed = float_or_none(value)
    return default if parsed is None else parsed


def int_value(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def format_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def split_flags(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in str(value).replace(";", ",").split(",") if item.strip()]


def load_csv_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            flags = split_flags(row.get("flags"))
            parsed = dict(row)
            parsed["flags"] = flags
            for key in ("start", "end", "priority"):
                parsed[key] = float_or_none(row.get(key))
            for spec in SPEAKERS.values():
                parsed[spec["aligned"]] = float_or_none(row.get(spec["aligned"]))
                parsed[spec["contribution"]] = float_or_none(row.get(spec["contribution"]))
            rows.append(parsed)
    return rows


def load_report(outputs: dict[str, Any], key: str) -> tuple[Path | None, dict[str, Any]]:
    path_text = output_path(outputs.get(key))
    if not path_text:
        return None, {}
    path = Path(path_text)
    if not path.exists() or path.suffix.lower() != ".json":
        return path, {}
    try:
        return path, read_json(path)
    except json.JSONDecodeError:
        return path, {}


def row_duration(row: dict[str, Any], fallback: float) -> float:
    start = float_value(row.get("start"))
    end = float_value(row.get("end"))
    duration = end - start
    return duration if duration > 0 else fallback


def summarize_speaker(rows: list[dict[str, Any]], speaker: str, thresholds: dict[str, Any], window_seconds: float) -> dict[str, Any]:
    spec = SPEAKERS[speaker]
    active_dbfs = float_value(thresholds.get("activeDbfs"), -42.0)
    audible_dbfs = float_value(thresholds.get("deadAirDbfs"), -50.0)
    loss_delta = float_value(thresholds.get("lossDeltaDb"), 18.0)

    active = retained = quiet_active = loss_risk = bleed_risk = 0
    active_seconds = retained_seconds = loss_seconds = 0.0
    deltas: list[float] = []
    worst_rows: list[dict[str, Any]] = []

    for row in rows:
        aligned = row.get(spec["aligned"])
        contribution = row.get(spec["contribution"])
        flags = row.get("flags") or []
        duration = row_duration(row, window_seconds)
        is_active = aligned is not None and aligned >= active_dbfs
        is_audible = contribution is not None and contribution >= audible_dbfs
        delta = None if aligned is None or contribution is None else aligned - contribution
        has_loss = bool(is_active and (not is_audible or (delta is not None and delta >= loss_delta))) or spec["lossFlag"] in flags
        has_bleed = spec["bleedFlag"] in flags

        if is_active:
            active += 1
            active_seconds += duration
            if is_audible:
                retained += 1
                retained_seconds += duration
            else:
                quiet_active += 1
            if delta is not None:
                deltas.append(delta)
        if has_loss:
            loss_risk += 1
            loss_seconds += duration
            worst_rows.append(
                {
                    "start": float_value(row.get("start")),
                    "end": float_value(row.get("end")),
                    "timecode": row.get("timecode") or format_time(float_value(row.get("start"))),
                    "alignedDbfs": aligned,
                    "contributionDbfs": contribution,
                    "deltaDb": delta,
                    "flags": flags,
                    "priority": int_value(row.get("priority")),
                }
            )
        if has_bleed:
            bleed_risk += 1

    def pct(part: int, total: int) -> float:
        return round((part / total) * 100.0, 3) if total else 0.0

    worst_rows.sort(key=lambda row: (float_value(row.get("deltaDb"), -999.0), int_value(row.get("priority"))), reverse=True)
    median_delta = None
    if deltas:
        ordered = sorted(deltas)
        median_delta = ordered[len(ordered) // 2]

    return {
        "speaker": speaker,
        "label": spec["label"],
        "activeWindowCount": active,
        "activeSeconds": round(active_seconds, 3),
        "retainedWindowCount": retained,
        "retainedSeconds": round(retained_seconds, 3),
        "retainedActivePercent": pct(retained, active),
        "quietActiveWindowCount": quiet_active,
        "lossRiskWindowCount": loss_risk,
        "lossRiskSeconds": round(loss_seconds, 3),
        "bleedRiskWindowCount": bleed_risk,
        "medianAlignedMinusContributionDb": None if median_delta is None else round(median_delta, 3),
        "worstLossWindows": worst_rows[:12],
        "thresholds": {
            "activeDbfs": active_dbfs,
            "audibleDbfs": audible_dbfs,
            "lossDeltaDb": loss_delta,
        },
    }


def group_flag_spans(rows: list[dict[str, Any]], flag: str, window_seconds: float, limit: int = 12) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for row in rows:
        flags = row.get("flags") or []
        start = float_value(row.get("start"))
        end = float_value(row.get("end"), start + window_seconds)
        if flag in flags:
            if current and abs(start - float_value(current.get("end"))) <= 0.01:
                current["end"] = end
                current["windowCount"] += 1
            else:
                if current:
                    spans.append(current)
                current = {"flag": flag, "start": start, "end": end, "windowCount": 1}
        else:
            if current:
                spans.append(current)
                current = None
    if current:
        spans.append(current)
    for span in spans:
        span["durationSec"] = round(float_value(span.get("end")) - float_value(span.get("start")), 3)
        span["timecode"] = format_time(float_value(span.get("start")))
    spans.sort(key=lambda span: (float_value(span.get("durationSec")), int_value(span.get("windowCount"))), reverse=True)
    return spans[:limit]


def normalize_marker(row: dict[str, Any], source: str, category: str, default_priority: int = 2) -> dict[str, Any]:
    start = float_value(row.get("start") if row.get("start") is not None else row.get("startSec"))
    end = float_value(row.get("end") if row.get("end") is not None else row.get("endSec"), start + 2.0)
    flags = row.get("flags") or []
    if isinstance(flags, str):
        flags = split_flags(flags)
    charlie_delta = None
    homer_delta = None
    if row.get("charlieAlignedDbfs") is not None and row.get("charlieContributionDbfs") is not None:
        charlie_delta = float_value(row.get("charlieAlignedDbfs")) - float_value(row.get("charlieContributionDbfs"))
    if row.get("homerAlignedDbfs") is not None and row.get("homerContributionDbfs") is not None:
        homer_delta = float_value(row.get("homerAlignedDbfs")) - float_value(row.get("homerContributionDbfs"))
    guidance = row.get("reason") or row.get("nearestQueueTitle") or "Listen for speaker presence, bleed, gating, and natural overlap."
    return {
        "start": round(start, 3),
        "end": round(end, 3),
        "timecode": row.get("timecode") or row.get("time") or format_time(start),
        "priority": int_value(row.get("priority"), default_priority),
        "source": source,
        "category": category,
        "flags": flags,
        "charlieAlignedDbfs": row.get("charlieAlignedDbfs"),
        "charlieContributionDbfs": row.get("charlieContributionDbfs"),
        "charlieDeltaDb": None if charlie_delta is None else round(charlie_delta, 3),
        "homerAlignedDbfs": row.get("homerAlignedDbfs"),
        "homerContributionDbfs": row.get("homerContributionDbfs"),
        "homerDeltaDb": None if homer_delta is None else round(homer_delta, 3),
        "guidance": str(guidance),
    }


def collect_review_markers(
    rows: list[dict[str, Any]],
    source_activity: dict[str, Any],
    source_balance: dict[str, Any],
    speaker_activity: dict[str, Any],
    bleed_gap: dict[str, Any],
) -> list[dict[str, Any]]:
    markers: list[dict[str, Any]] = []
    for row in source_activity.get("reviewWindows") or []:
        if isinstance(row, dict):
            markers.append(normalize_marker(row, "source-activity", "source-contribution-risk", 4))
    for row in source_balance.get("focusRows") or []:
        if isinstance(row, dict):
            markers.append(normalize_marker(row, "source-balance", "master-source-warning", int_value(row.get("severity"), 3)))
    for row in speaker_activity.get("focusRows") or []:
        if isinstance(row, dict):
            markers.append(normalize_marker(row, "speaker-activity", "speaker-cleanup-risk", 4))
    for window in bleed_gap.get("focusWindows") or []:
        if isinstance(window, dict):
            row = window.get("row") if isinstance(window.get("row"), dict) else window
            marker = normalize_marker(row, "bleed-gap", "bleed-gap-proof", 4)
            marker["guidance"] = str(window.get("reason") or marker["guidance"])
            markers.append(marker)

    deduped: dict[tuple[int, str], dict[str, Any]] = {}
    for marker in markers:
        key = (round(float_value(marker.get("start")) / 2.0), str(marker.get("category")))
        existing = deduped.get(key)
        if not existing or int_value(marker.get("priority")) > int_value(existing.get("priority")):
            deduped[key] = marker
    result = list(deduped.values())
    result.sort(key=lambda marker: (-int_value(marker.get("priority")), float_value(marker.get("start")), str(marker.get("source"))))
    return result[:80]


def write_marker_csv(path: Path, markers: list[dict[str, Any]]) -> None:
    fields = [
        "start",
        "end",
        "timecode",
        "priority",
        "source",
        "category",
        "flags",
        "charlieAlignedDbfs",
        "charlieContributionDbfs",
        "charlieDeltaDb",
        "homerAlignedDbfs",
        "homerContributionDbfs",
        "homerDeltaDb",
        "guidance",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for marker in markers:
            row = dict(marker)
            row["flags"] = ";".join(str(flag) for flag in marker.get("flags") or [])
            writer.writerow({field: row.get(field) for field in fields})


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Contribution Ledger: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is an audio QC X-ray. It shows where each speaker is active, retained, quiet, or risky in the current mastered spine. It does not approve the spine or unlock branch renders.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Speaker retention summary",
        "",
        "| Speaker | Active time | Retained time | Retained active % | Quiet active windows | Loss-risk windows | Bleed-risk windows | Median aligned-contribution delta |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["speakerSummaries"]:
        lines.append(
            f"| {row['label']} | `{row['activeSeconds']}s` | `{row['retainedSeconds']}s` | `{row['retainedActivePercent']}%` | `{row['quietActiveWindowCount']}` | `{row['lossRiskWindowCount']}` | `{row['bleedRiskWindowCount']}` | `{row['medianAlignedMinusContributionDb']}` |"
        )
    lines.extend(["", "## Warning family spans", ""])
    for flag, spans in report["longestFlagSpans"].items():
        if not spans:
            lines.append(f"- `{flag}`: no spans")
            continue
        preview = ", ".join(f"{span['timecode']} ({span['durationSec']}s)" for span in spans[:5])
        lines.append(f"- `{flag}`: {preview}")
    lines.extend(
        [
            "",
            "## Top review markers",
            "",
            "| Time | Priority | Category | Source | Flags | Guidance |",
            "|---|---:|---|---|---|---|",
        ]
    )
    for marker in report["reviewMarkers"][:30]:
        flags = ", ".join(marker.get("flags") or [])
        lines.append(
            f"| `{marker['timecode']}` | `{marker['priority']}` | {marker['category']} | {marker['source']} | {flags} | {marker['guidance']} |"
        )
    lines.extend(
        [
            "",
            "## Output files",
            "",
            f"- JSON: `{report['json']}`",
            f"- Markdown: `{report['markdown']}`",
            f"- HTML: `{report['html']}`",
            f"- Review marker CSV: `{report['reviewMarkerCsv']}`",
            "",
            "## Meaning",
            "",
            "This ledger does not replace a human listen. It narrows the listen pass by proving where each speaker is expected to be present and by naming the exact windows where contribution, bleed, or gating deserves attention.",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    summary_cards = []
    for row in report["speakerSummaries"]:
        summary_cards.append(
            f"""
            <article class="card">
              <h3>{html.escape(row['label'])}</h3>
              <p class="metric">{row['retainedActivePercent']}%</p>
              <p>retained while active</p>
              <dl>
                <dt>Active</dt><dd>{row['activeSeconds']}s</dd>
                <dt>Retained</dt><dd>{row['retainedSeconds']}s</dd>
                <dt>Loss risk</dt><dd>{row['lossRiskWindowCount']} windows</dd>
                <dt>Bleed risk</dt><dd>{row['bleedRiskWindowCount']} windows</dd>
              </dl>
            </article>
            """
        )
    marker_rows = []
    for marker in report["reviewMarkers"][:60]:
        flags = ", ".join(str(flag) for flag in marker.get("flags") or [])
        marker_rows.append(
            f"<tr><td>{html.escape(str(marker['timecode']))}</td><td>{marker['priority']}</td><td>{html.escape(str(marker['category']))}</td><td>{html.escape(str(marker['source']))}</td><td>{html.escape(flags)}</td><td>{html.escape(str(marker['guidance']))}</td></tr>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Speaker Contribution Ledger</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101713; --panel:#1b2922; --ink:#f6edd9; --muted:#bdb298; --gold:#f1c94b; --green:#64d17a; --clay:#d56b4b; --line:rgba(246,237,217,.16); }}
    body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; background:radial-gradient(circle at 10% 0%,rgba(100,209,122,.18),transparent 35rem),var(--bg); color:var(--ink); }}
    main {{ max-width:1200px; margin:0 auto; padding:32px; }}
    header,.card,section {{ background:rgba(27,41,34,.9); border:1px solid var(--line); border-radius:24px; padding:22px; box-shadow:0 20px 60px rgba(0,0,0,.28); }}
    h1 {{ font-size:clamp(34px,5vw,58px); margin:.1em 0; letter-spacing:-.045em; }}
    h2 {{ color:var(--gold); letter-spacing:.12em; text-transform:uppercase; font-size:13px; margin-top:32px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:16px; }}
    .metric {{ font-size:44px; color:var(--green); margin:.2em 0; font-weight:800; }}
    dl {{ display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; }} dt {{ color:var(--muted); }} dd {{ margin:0; text-align:right; }}
    table {{ width:100%; border-collapse:collapse; }} td,th {{ border-bottom:1px solid var(--line); padding:10px; vertical-align:top; }} th {{ color:var(--muted); text-align:left; }}
    a {{ color:var(--gold); }} code {{ color:var(--gold); }}
  </style>
</head>
<body><main>
<header>
  <p><strong>Quipsly Audio Workbench</strong></p>
  <h1>Speaker contribution ledger</h1>
  <p>This is a non-destructive QC X-ray for v006. It shows where Charlie, Homer, and reference material are active, retained, risky, or worth listening to before approval.</p>
  <p>Approval: <code>{html.escape(str(report['approvalStatus']))}</code> · Branch inheritance: <code>{str(report['branchInheritanceReady']).lower()}</code> · Branch render: <code>{str(report['branchRenderReady']).lower()}</code></p>
</header>
<h2>Speaker retention</h2>
<div class="grid">{''.join(summary_cards)}</div>
<h2>Review markers</h2>
<section>
  <p>Use these as listen targets. They are ranked by risk and deduped across source activity, source-balance, speaker activity, and bleed/gap proof reports.</p>
  <table><thead><tr><th>Time</th><th>Priority</th><th>Category</th><th>Source</th><th>Flags</th><th>Guidance</th></tr></thead><tbody>{''.join(marker_rows)}</tbody></table>
</section>
<h2>Files</h2>
<section>
  <p><a href="{html.escape(file_uri(Path(report['reviewMarkerCsv'])))}">Review marker CSV</a></p>
  <p><a href="{html.escape(file_uri(Path(report['markdown'])))}">Markdown report</a></p>
</section>
</main></body></html>
"""


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\nset -e\nopen " + shell_quote(str(html_path)) + "\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    source_activity_path, source_activity = load_report(outputs, "sourceActivity")
    if not source_activity_path or not source_activity:
        raise FileNotFoundError("Missing sourceActivity JSON report in manifest outputs")
    csv_path_text = output_path(outputs.get("sourceActivityCsv")) or output_path(source_activity.get("outputs", {}).get("csv"))
    if not csv_path_text or not Path(csv_path_text).exists():
        raise FileNotFoundError("Missing source activity CSV in manifest outputs")
    source_activity_csv = Path(csv_path_text)
    rows = load_csv_rows(source_activity_csv)
    if not rows:
        raise ValueError("Source activity CSV had no rows")

    _, source_balance = load_report(outputs, "latestAudioMasterSourceBalanceAudit")
    _, speaker_activity = load_report(outputs, "latestAudioSpeakerActivityReviewBoard")
    _, bleed_gap = load_report(outputs, "latestSpeakerBleedGapProofAudit")
    _, spine_sanity = load_report(outputs, "latestAudioSpineListenSanityCheck")

    thresholds = source_activity.get("thresholds") if isinstance(source_activity.get("thresholds"), dict) else {}
    window_seconds = float_value(source_activity.get("windowSeconds"), 2.0)
    speaker_summaries = [summarize_speaker(rows, speaker, thresholds, window_seconds) for speaker in SPEAKERS]
    flag_counter: Counter[str] = Counter()
    for row in rows:
        flag_counter.update(row.get("flags") or [])
    flag_span_keys = [
        "charlie_loss_or_overgate_risk",
        "homer_loss_or_overgate_risk",
        "charlie_echo_bleed_may_remain_under_homer",
        "homer_noise_bleed_may_remain_under_charlie",
        "charlie_homer_overlap_present",
        "dead_air_or_between_sources",
        "master_loud_without_registered_source",
        "master_loud_with_aligned_source_but_no_contribution",
    ]
    longest_flag_spans = {flag: group_flag_spans(rows, flag, window_seconds) for flag in flag_span_keys}
    review_markers = collect_review_markers(rows, source_activity, source_balance, speaker_activity, bleed_gap)

    out_dir = baseline_dir / f"audio-speaker-contribution-ledger-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=False)
    json_path = out_dir / "speaker-contribution-ledger.json"
    md_path = out_dir / "speaker-contribution-ledger.md"
    html_path = out_dir / "speaker-contribution-ledger.html"
    marker_csv = out_dir / "speaker-contribution-review-markers.csv"
    open_command = out_dir / "open-speaker-contribution-ledger.command"

    report = {
        "schema": "quipsly.audio-workbench.speaker-contribution-ledger.v1",
        "generatedAt": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "sourceActivityJson": str(source_activity_path),
        "sourceActivityCsv": str(source_activity_csv),
        "windowSeconds": window_seconds,
        "rowCount": len(rows),
        "flagCounts": dict(sorted(flag_counter.items())),
        "speakerSummaries": speaker_summaries,
        "longestFlagSpans": longest_flag_spans,
        "reviewMarkers": review_markers,
        "reviewMarkerCount": len(review_markers),
        "spineSanityPassed": spine_sanity.get("passed") if spine_sanity else None,
        "humanListenStillRequired": manifest_before.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
        "reviewMarkerCsv": str(marker_csv),
        "openCommand": str(open_command),
    }
    write_marker_csv(marker_csv, review_markers)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_open_command(open_command, html_path)
    write_json(json_path, report)

    manifest_after = read_json(manifest_path)
    outputs_after = manifest_after.setdefault("outputs", {})
    outputs_after["latestAudioSpeakerContributionLedger"] = str(json_path)
    outputs_after["latestAudioSpeakerContributionLedgerMarkdown"] = str(md_path)
    outputs_after["latestAudioSpeakerContributionLedgerHtml"] = str(html_path)
    outputs_after["latestAudioSpeakerContributionLedgerCsv"] = str(marker_csv)
    outputs_after["latestAudioSpeakerContributionLedgerOpenCommand"] = str(open_command)
    outputs_after.setdefault("audioSpeakerContributionLedgers", []).append(str(json_path))
    outputs_after.setdefault("audioSpeakerContributionLedgerMarkdowns", []).append(str(md_path))
    outputs_after.setdefault("audioSpeakerContributionLedgerHtmls", []).append(str(html_path))
    outputs_after.setdefault("audioSpeakerContributionLedgerCsvs", []).append(str(marker_csv))
    write_json(manifest_path, manifest_after)

    manifest_reloaded = read_json(manifest_path)
    report["approvalStateChanged"] = manifest_reloaded.get("approvalStatus") != manifest_before.get("approvalStatus")
    report["branchStateChanged"] = (
        manifest_reloaded.get("branchInheritanceReady") != manifest_before.get("branchInheritanceReady")
        or manifest_reloaded.get("branchRenderReady") != manifest_before.get("branchRenderReady")
    )
    write_json(json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()
    report = build_report(resolve_baseline_dir(args.baseline_dir))
    print(json.dumps({
        "json": report["json"],
        "markdown": report["markdown"],
        "html": report["html"],
        "reviewMarkerCsv": report["reviewMarkerCsv"],
        "reviewMarkerCount": report["reviewMarkerCount"],
        "approvalStateChanged": report["approvalStateChanged"],
        "branchStateChanged": report["branchStateChanged"],
        "renderAttempted": report["renderAttempted"],
        "originalMediaMutated": report["originalMediaMutated"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
