#!/usr/bin/env python3
"""Create a non-destructive technical audition audit for an audio baseline.

This is intentionally not an approval script. It gives the producer/editor a
full-spine visibility layer: loudness movement, quiet-floor behavior, channel
balance, and the first sections worth listening to before rendering branches.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import stat
import wave
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_VERSION = "2026-07-11.technical-audition-v001"
OUTPUT_STEM = "AUDIO_TECHNICAL_AUDITION_AUDIT"
NEG_INF = -120.0


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def value_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "wavPath",
            "audioPath",
            "masterPath",
            "filePath",
            "outputPath",
            "htmlPath",
            "markdownPath",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def resolve_master_wav(manifest: dict[str, Any], baseline_dir: Path) -> Path:
    outputs = manifest.get("outputs")
    if not isinstance(outputs, dict):
        outputs = {}

    candidates: list[Any] = [
        outputs.get("masterWav"),
        outputs.get("latestMasterWav"),
        outputs.get("latestMasteredAudioSpineWav"),
        outputs.get("latestAudioSpineWav"),
        manifest.get("masterWav"),
    ]

    for value in candidates:
        candidate = value_path(value)
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if not path.is_absolute():
            path = baseline_dir / path
        if path.exists():
            return path

    raise SystemExit(
        "No readable master WAV found in manifest outputs. Expected outputs.masterWav or a compatible audio spine path."
    )


def dbfs_from_rms(rms: float, max_abs: float) -> float:
    if rms <= 0 or max_abs <= 0:
        return NEG_INF
    return max(NEG_INF, 20.0 * math.log10(rms / max_abs))


def percentile(values: list[float], pct: float, default: float = 0.0) -> float:
    if not values:
        return default
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * pct
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return ordered[lo]
    frac = rank - lo
    return ordered[lo] * (1.0 - frac) + ordered[hi] * frac


def mean(values: list[float], default: float = 0.0) -> float:
    if not values:
        return default
    return sum(values) / len(values)


def seconds_label(seconds: float) -> str:
    seconds = max(0.0, seconds)
    whole = int(seconds)
    h = whole // 3600
    m = (whole % 3600) // 60
    s = whole % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def safe_slug(text: str) -> str:
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in text).strip("-")


def analyze_wav(path: Path, window_seconds: float, section_seconds: float) -> dict[str, Any]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()

        if sample_width != 2:
            raise SystemExit(
                f"Unsupported WAV sample width {sample_width * 8}-bit for technical audit. "
                "Render a PCM 16-bit review master or add a safe ffmpeg conversion step."
            )
        if channels < 1:
            raise SystemExit("WAV has no audio channels.")

        max_abs = float(2 ** (sample_width * 8 - 1))
        window_frames = max(1, int(sample_rate * window_seconds))
        windows: list[dict[str, Any]] = []
        total_frames_read = 0

        while total_frames_read < frame_count:
            start_frame = total_frames_read
            raw = wav.readframes(window_frames)
            if not raw:
                break
            samples = array("h")
            samples.frombytes(raw)
            if os.sys.byteorder != "little":
                samples.byteswap()

            frames_in_window = len(samples) // channels
            if frames_in_window <= 0:
                break

            channel_db: list[float] = []
            channel_rms: list[float] = []
            for ch in range(channels):
                channel_samples = samples[ch::channels]
                if not channel_samples:
                    channel_rms.append(0.0)
                    channel_db.append(NEG_INF)
                    continue
                square_mean = sum(float(v) * float(v) for v in channel_samples) / len(channel_samples)
                rms = math.sqrt(square_mean)
                channel_rms.append(rms)
                channel_db.append(dbfs_from_rms(rms, max_abs))

            square_mean_all = sum(float(v) * float(v) for v in samples) / len(samples)
            rms_all = math.sqrt(square_mean_all)
            dbfs_all = dbfs_from_rms(rms_all, max_abs)

            left_right_delta = 0.0
            if channels >= 2 and channel_db[0] > NEG_INF + 1 and channel_db[1] > NEG_INF + 1:
                left_right_delta = channel_db[0] - channel_db[1]

            windows.append(
                {
                    "index": len(windows),
                    "startSeconds": start_frame / sample_rate,
                    "endSeconds": min(frame_count, start_frame + frames_in_window) / sample_rate,
                    "dbfs": round(dbfs_all, 2),
                    "channelDbfs": [round(v, 2) for v in channel_db],
                    "leftRightDeltaDb": round(left_right_delta, 2),
                    "active": dbfs_all > -45.0,
                    "quiet": dbfs_all <= -50.0,
                    "loud": dbfs_all >= -16.0,
                    "veryLoud": dbfs_all >= -12.0,
                }
            )

            total_frames_read += frames_in_window

    sections_by_index: dict[int, list[dict[str, Any]]] = {}
    for item in windows:
        section_index = int(item["startSeconds"] // section_seconds)
        sections_by_index.setdefault(section_index, []).append(item)

    sections: list[dict[str, Any]] = []
    for section_index in sorted(sections_by_index):
        items = sections_by_index[section_index]
        db_values = [float(item["dbfs"]) for item in items if float(item["dbfs"]) > NEG_INF + 1]
        active_items = [item for item in items if item["active"]]
        active_db = [float(item["dbfs"]) for item in active_items if float(item["dbfs"]) > NEG_INF + 1]
        deltas = [abs(float(item["leftRightDeltaDb"])) for item in active_items]
        very_loud = [item for item in items if item["veryLoud"]]
        quiet = [item for item in items if item["quiet"]]

        active_ratio = len(active_items) / len(items) if items else 0.0
        quiet_ratio = len(quiet) / len(items) if items else 0.0
        very_loud_ratio = len(very_loud) / len(items) if items else 0.0
        lr_p95 = percentile(deltas, 0.95, 0.0)
        p90 = percentile(active_db or db_values, 0.90, NEG_INF)
        p50 = percentile(active_db or db_values, 0.50, NEG_INF)
        p10 = percentile(active_db or db_values, 0.10, NEG_INF)

        reasons: list[str] = []
        risk_score = 0.0
        if lr_p95 >= 5.0:
            reasons.append("channel balance needs a listen")
            risk_score += min(20.0, lr_p95 * 2.0)
        if very_loud_ratio >= 0.12:
            reasons.append("sustained loudness/fatigue check")
            risk_score += very_loud_ratio * 35.0
        if active_ratio >= 0.65 and p50 < -31.0:
            reasons.append("active speech may be underpowered")
            risk_score += 12.0
        if quiet_ratio >= 0.45 and active_ratio <= 0.35:
            reasons.append("long quiet or muted stretch")
            risk_score += quiet_ratio * 18.0
        if p90 >= -13.0:
            reasons.append("peaks may feel hot")
            risk_score += 10.0

        sections.append(
            {
                "index": section_index,
                "startSeconds": round(section_index * section_seconds, 3),
                "endSeconds": round(min((section_index + 1) * section_seconds, frame_count / sample_rate), 3),
                "activeRatio": round(active_ratio, 3),
                "quietRatio": round(quiet_ratio, 3),
                "veryLoudRatio": round(very_loud_ratio, 3),
                "p10Dbfs": round(p10, 2),
                "p50Dbfs": round(p50, 2),
                "p90Dbfs": round(p90, 2),
                "leftRightDeltaP95Db": round(lr_p95, 2),
                "riskScore": round(risk_score, 2),
                "reasons": reasons,
            }
        )

    active_dbfs = [float(item["dbfs"]) for item in windows if item["active"]]
    all_dbfs = [float(item["dbfs"]) for item in windows if float(item["dbfs"]) > NEG_INF + 1]
    quiet_dbfs = [float(item["dbfs"]) for item in windows if item["quiet"] and float(item["dbfs"]) > NEG_INF + 1]
    lr_deltas = [abs(float(item["leftRightDeltaDb"])) for item in windows if item["active"]]

    listen_moments = [
        section
        for section in sorted(sections, key=lambda item: (item["riskScore"], item["startSeconds"]), reverse=True)
        if section["riskScore"] > 0.0
    ][:24]

    return {
        "audio": {
            "path": str(path),
            "durationSeconds": round(frame_count / sample_rate, 3),
            "durationLabel": seconds_label(frame_count / sample_rate),
            "sampleRate": sample_rate,
            "channels": channels,
            "sampleWidthBits": sample_width * 8,
            "frameCount": frame_count,
        },
        "analysisSettings": {
            "windowSeconds": window_seconds,
            "sectionSeconds": section_seconds,
            "activeThresholdDbfs": -45.0,
            "quietThresholdDbfs": -50.0,
            "loudThresholdDbfs": -16.0,
            "veryLoudThresholdDbfs": -12.0,
        },
        "summary": {
            "windowCount": len(windows),
            "sectionCount": len(sections),
            "activeWindowRatio": round(len(active_dbfs) / len(windows), 3) if windows else 0.0,
            "activeMedianDbfs": round(percentile(active_dbfs, 0.50, NEG_INF), 2),
            "activeP90Dbfs": round(percentile(active_dbfs, 0.90, NEG_INF), 2),
            "globalP10Dbfs": round(percentile(all_dbfs, 0.10, NEG_INF), 2),
            "estimatedQuietFloorDbfs": round(percentile(quiet_dbfs or all_dbfs, 0.50, NEG_INF), 2),
            "leftRightDeltaP95Db": round(percentile(lr_deltas, 0.95, 0.0), 2),
            "listenMomentCount": len(listen_moments),
        },
        "sections": sections,
        "listenMoments": listen_moments,
    }


def markdown_report(report: dict[str, Any]) -> str:
    audio = report["audio"]
    summary = report["summary"]
    lines = [
        "# Audio Technical Audition Audit",
        "",
        f"- Status: `{report['status']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Master WAV: `{audio['path']}`",
        f"- Duration: `{audio['durationLabel']}` ({audio['durationSeconds']}s)",
        f"- Format: `{audio['sampleRate']} Hz`, `{audio['channels']}` channel(s), `{audio['sampleWidthBits']}` bit",
        f"- Generated: `{report['generatedAt']}`",
        "",
        "## What this is",
        "",
        "This is a non-destructive listen-priority map. It does not approve the master. It points a producer, editor, or agent toward sections where the spine deserves human attention before edit branches inherit it.",
        "",
        "## Summary",
        "",
        f"- Windows analyzed: `{summary['windowCount']}`",
        f"- Sections analyzed: `{summary['sectionCount']}`",
        f"- Active window ratio: `{summary['activeWindowRatio']}`",
        f"- Active median: `{summary['activeMedianDbfs']} dBFS`",
        f"- Active p90: `{summary['activeP90Dbfs']} dBFS`",
        f"- Estimated quiet floor: `{summary['estimatedQuietFloorDbfs']} dBFS`",
        f"- L/R balance p95: `{summary['leftRightDeltaP95Db']} dB`",
        f"- Listen-priority moments: `{summary['listenMomentCount']}`",
        "",
        "## First listen-priority sections",
        "",
        "| Time | Risk | Active | Quiet | P50 | P90 | L/R p95 | Why |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for item in report["listenMoments"][:16]:
        why = "; ".join(item["reasons"]) or "check"
        lines.append(
            "| "
            + " | ".join(
                [
                    f"{seconds_label(item['startSeconds'])}-{seconds_label(item['endSeconds'])}",
                    str(item["riskScore"]),
                    str(item["activeRatio"]),
                    str(item["quietRatio"]),
                    f"{item['p50Dbfs']} dB",
                    f"{item['p90Dbfs']} dB",
                    f"{item['leftRightDeltaP95Db']} dB",
                    why,
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Full section map",
            "",
            "| Time | Active | Quiet | P10 | P50 | P90 | L/R p95 | Flags |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
        ]
    )
    for item in report["sections"]:
        flags = "; ".join(item["reasons"])
        lines.append(
            "| "
            + " | ".join(
                [
                    f"{seconds_label(item['startSeconds'])}-{seconds_label(item['endSeconds'])}",
                    str(item["activeRatio"]),
                    str(item["quietRatio"]),
                    f"{item['p10Dbfs']} dB",
                    f"{item['p50Dbfs']} dB",
                    f"{item['p90Dbfs']} dB",
                    f"{item['leftRightDeltaP95Db']} dB",
                    flags,
                ]
            )
            + " |"
        )
    lines.append("")
    return "\n".join(lines)


def html_report(report: dict[str, Any], markdown_path: Path, json_path: Path) -> str:
    audio = report["audio"]
    summary = report["summary"]

    def e(value: Any) -> str:
        return html.escape(str(value))

    listen_rows = []
    for item in report["listenMoments"][:24]:
        why = "; ".join(item["reasons"]) or "check"
        listen_rows.append(
            "<tr>"
            f"<td>{e(seconds_label(item['startSeconds']))}-{e(seconds_label(item['endSeconds']))}</td>"
            f"<td>{e(item['riskScore'])}</td>"
            f"<td>{e(item['activeRatio'])}</td>"
            f"<td>{e(item['quietRatio'])}</td>"
            f"<td>{e(item['p50Dbfs'])} dB</td>"
            f"<td>{e(item['p90Dbfs'])} dB</td>"
            f"<td>{e(item['leftRightDeltaP95Db'])} dB</td>"
            f"<td>{e(why)}</td>"
            "</tr>"
        )

    section_rows = []
    for item in report["sections"]:
        flags = "; ".join(item["reasons"])
        section_rows.append(
            "<tr>"
            f"<td>{e(seconds_label(item['startSeconds']))}-{e(seconds_label(item['endSeconds']))}</td>"
            f"<td>{e(item['activeRatio'])}</td>"
            f"<td>{e(item['quietRatio'])}</td>"
            f"<td>{e(item['p10Dbfs'])} dB</td>"
            f"<td>{e(item['p50Dbfs'])} dB</td>"
            f"<td>{e(item['p90Dbfs'])} dB</td>"
            f"<td>{e(item['leftRightDeltaP95Db'])} dB</td>"
            f"<td>{e(flags)}</td>"
            "</tr>"
        )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Audio Technical Audition Audit</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101915;
      --panel: #17231d;
      --panel-2: #203126;
      --ink: #f8f0dc;
      --muted: #b8ac91;
      --gold: #f2c14e;
      --moss: #7fc47f;
      --clay: #cf6c4f;
      --line: rgba(248, 240, 220, 0.15);
    }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 10% -10%, rgba(127, 196, 127, .16), transparent 36rem),
        radial-gradient(circle at 90% 0%, rgba(242, 193, 78, .14), transparent 28rem),
        var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 44px 28px 72px; }}
    h1, h2 {{ font-family: Georgia, "Times New Roman", serif; letter-spacing: -.03em; }}
    h1 {{ font-size: clamp(36px, 5vw, 68px); line-height: .95; margin: 0 0 16px; }}
    h2 {{ font-size: 28px; margin-top: 36px; }}
    .eyebrow {{ color: var(--gold); font-weight: 800; letter-spacing: .22em; text-transform: uppercase; font-size: 12px; }}
    .hero, .card {{ background: linear-gradient(145deg, rgba(32,49,38,.94), rgba(23,35,29,.94)); border: 1px solid var(--line); border-radius: 28px; box-shadow: 0 28px 80px rgba(0,0,0,.28); }}
    .hero {{ padding: 32px; }}
    .subtle {{ color: var(--muted); max-width: 72ch; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 24px 0; }}
    .metric {{ background: rgba(16,25,21,.55); border: 1px solid var(--line); border-radius: 20px; padding: 16px; }}
    .metric b {{ display: block; color: var(--gold); font-size: 22px; }}
    .metric span {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .12em; font-weight: 800; }}
    .card {{ padding: 24px; margin-top: 20px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 780px; }}
    th, td {{ text-align: left; border-bottom: 1px solid var(--line); padding: 10px 12px; vertical-align: top; }}
    th {{ color: var(--gold); font-size: 12px; letter-spacing: .1em; text-transform: uppercase; }}
    tr:hover td {{ background: rgba(242, 193, 78, .05); }}
    code {{ color: #d4f2c4; }}
    .pill {{ display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; color: var(--muted); background: rgba(16,25,21,.45); margin: 4px 8px 4px 0; }}
    a {{ color: var(--gold); }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Quipsly Audio Workbench</div>
      <h1>Technical audition map</h1>
      <p class="subtle">This page does not approve the master. It gives Charlie, Mako, Homer, and Codex a calm producer map of where the Episode 4 audio spine deserves ears before any edit branch inherits it.</p>
      <p>
        <span class="pill">Status: <code>{e(report['status'])}</code></span>
        <span class="pill">Baseline: <code>{e(report['baselineId'])}</code></span>
        <span class="pill">Generated: <code>{e(report['generatedAt'])}</code></span>
      </p>
      <p class="subtle">Master WAV: <code>{e(audio['path'])}</code></p>
      <div class="grid">
        <div class="metric"><span>Duration</span><b>{e(audio['durationLabel'])}</b></div>
        <div class="metric"><span>Active median</span><b>{e(summary['activeMedianDbfs'])} dBFS</b></div>
        <div class="metric"><span>Active p90</span><b>{e(summary['activeP90Dbfs'])} dBFS</b></div>
        <div class="metric"><span>Quiet floor</span><b>{e(summary['estimatedQuietFloorDbfs'])} dBFS</b></div>
        <div class="metric"><span>L/R p95</span><b>{e(summary['leftRightDeltaP95Db'])} dB</b></div>
        <div class="metric"><span>Listen moments</span><b>{e(summary['listenMomentCount'])}</b></div>
      </div>
      <p><a href="{e(markdown_path.name)}">Markdown</a> · <a href="{e(json_path.name)}">JSON</a></p>
    </section>

    <section class="card">
      <h2>First listen-priority sections</h2>
      <table>
        <thead><tr><th>Time</th><th>Risk</th><th>Active</th><th>Quiet</th><th>P50</th><th>P90</th><th>L/R p95</th><th>Why</th></tr></thead>
        <tbody>{''.join(listen_rows) or '<tr><td colspan="8">No elevated listen-priority sections found by this technical audit.</td></tr>'}</tbody>
      </table>
    </section>

    <section class="card">
      <h2>Full section map</h2>
      <table>
        <thead><tr><th>Time</th><th>Active</th><th>Quiet</th><th>P10</th><th>P50</th><th>P90</th><th>L/R p95</th><th>Flags</th></tr></thead>
        <tbody>{''.join(section_rows)}</tbody>
      </table>
    </section>
  </main>
</body>
</html>
"""


def register_outputs(manifest_path: Path, report: dict[str, Any], paths: dict[str, Path]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    run_record = {
        "status": report["status"],
        "generatedAt": report["generatedAt"],
        "scriptVersion": SCRIPT_VERSION,
        "baselineId": report["baselineId"],
        "jsonPath": str(paths["json"]),
        "markdownPath": str(paths["markdown"]),
        "htmlPath": str(paths["html"]),
        "openCommandPath": str(paths["openCommand"]),
        "masterWavPath": report["audio"]["path"],
        "sectionCount": report["summary"]["sectionCount"],
        "listenMomentCount": report["summary"]["listenMomentCount"],
        "missingEvidenceCount": report["missingEvidenceCount"],
    }
    outputs["latestAudioTechnicalAuditionAudit"] = run_record
    outputs["latestAudioTechnicalAuditionAuditJson"] = str(paths["json"])
    outputs["latestAudioTechnicalAuditionAuditMarkdown"] = str(paths["markdown"])
    outputs["latestAudioTechnicalAuditionAuditHtml"] = str(paths["html"])
    outputs["latestAudioTechnicalAuditionAuditOpenCommand"] = str(paths["openCommand"])
    outputs["audioTechnicalAuditionAuditLatestStatus"] = report["status"]
    outputs["audioTechnicalAuditionAuditSectionCount"] = report["summary"]["sectionCount"]
    outputs["audioTechnicalAuditionAuditListenMomentCount"] = report["summary"]["listenMomentCount"]
    outputs["audioTechnicalAuditionAuditMissingEvidenceCount"] = report["missingEvidenceCount"]
    outputs["audioTechnicalAuditionAuditCount"] = int(outputs.get("audioTechnicalAuditionAuditCount") or 0) + 1
    write_json(manifest_path, manifest)


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text(f'#!/bin/zsh\nopen "{html_path}"\n', encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, help="Episode 4 conformed production baseline directory.")
    parser.add_argument("--window-seconds", type=float, default=1.0)
    parser.add_argument("--section-seconds", type=float, default=60.0)
    args = parser.parse_args()

    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = read_json(manifest_path)
    master_wav = resolve_master_wav(manifest, baseline_dir)
    analysis = analyze_wav(master_wav, args.window_seconds, args.section_seconds)
    baseline_id = str(manifest.get("baselineId") or baseline_dir.name)
    status = "ready-for-human-technical-audition"

    report = {
        "status": status,
        "generatedAt": utc_now(),
        "scriptVersion": SCRIPT_VERSION,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "sourcePolicy": {
            "nonDestructive": True,
            "mutatesOriginalMedia": False,
            "approvesAudioMaster": False,
            "branchRenderUnlocked": False,
        },
        "missingEvidenceCount": 0,
        **analysis,
    }

    paths = {
        "json": baseline_dir / f"{OUTPUT_STEM}.json",
        "markdown": baseline_dir / f"{OUTPUT_STEM}.md",
        "html": baseline_dir / f"{OUTPUT_STEM}.html",
        "openCommand": baseline_dir / f"OPEN_{OUTPUT_STEM}.command",
    }

    write_json(paths["json"], report)
    paths["markdown"].write_text(markdown_report(report), encoding="utf-8")
    paths["html"].write_text(html_report(report, paths["markdown"], paths["json"]), encoding="utf-8")
    write_open_command(paths["openCommand"], paths["html"])
    register_outputs(manifest_path, report, paths)

    print(json.dumps({
        "status": status,
        "baselineId": baseline_id,
        "masterWav": str(master_wav),
        "sectionCount": report["summary"]["sectionCount"],
        "listenMomentCount": report["summary"]["listenMomentCount"],
        "html": str(paths["html"]),
    }, indent=2))


if __name__ == "__main__":
    main()
