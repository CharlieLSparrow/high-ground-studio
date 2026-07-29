#!/usr/bin/env python3
"""Audit spectral/listener-fatigue risk for the mastered audio spine.

This is a non-destructive quality method for the current Episode 4 audio spine.
It samples bounded proof windows, measures rough voice-band energy using ffmpeg
filters, and flags likely rumble, mud, thinness, harshness, hiss, or over-squash
risks before final episode and shorts branches inherit the spine.

It does not approve audio, unlock branches, render final episode/short branches,
upload, publish, or mutate source/original media.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import shlex
import statistics
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.audio-workbench.spectral-fatigue-audit.v1"
BASELINE_ID_FALLBACK = "episode-4-v006-audio-spine"

WINDOWS = [
    {
        "id": "long-silence-bridge",
        "label": "Long silence bridge",
        "startSeconds": 1760.0,
        "durationSeconds": 24.0,
        "reason": "Checks whether the quiet bridge has rumble, hiss, or dead-air fatigue.",
    },
    {
        "id": "post-wall-e-echo-check",
        "label": "Post Wall-E echo check",
        "startSeconds": 2062.0,
        "durationSeconds": 24.0,
        "reason": "Checks whether Charlie/Homer cleanup sounds thin, muddy, or harsh after source bleed management.",
    },
    {
        "id": "meetings-park-noise-check",
        "label": "Meetings park-noise check",
        "startSeconds": 4180.0,
        "durationSeconds": 24.0,
        "reason": "Checks Homer's outdoor recording texture for rumble, mud, and hiss fatigue.",
    },
    {
        "id": "camera-assistant-overlap-check",
        "label": "Camera assistant overlap check",
        "startSeconds": 5710.0,
        "durationSeconds": 24.0,
        "reason": "Checks overlap and reaction texture for harsh or over-gated spectral shape.",
    },
]

BANDS = [
    {"id": "sub-rumble", "label": "Sub/rumble", "lowHz": 20, "highHz": 80},
    {"id": "warmth", "label": "Warmth", "lowHz": 80, "highHz": 250},
    {"id": "mud", "label": "Mud", "lowHz": 250, "highHz": 500},
    {"id": "body", "label": "Body", "lowHz": 500, "highHz": 1000},
    {"id": "presence", "label": "Presence/intelligibility", "lowHz": 1000, "highHz": 4000},
    {"id": "harshness", "label": "Harshness", "lowHz": 4000, "highHz": 8000},
    {"id": "air-hiss", "label": "Air/hiss", "lowHz": 8000, "highHz": 14000},
]

MEAN_RE = re.compile(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")
MAX_RE = re.compile(r"max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio"


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def run_command(cmd: list[str], timeout: int = 120) -> tuple[int, str]:
    try:
        completed = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        return 127, str(exc)
    except subprocess.TimeoutExpired as exc:
        return 124, (exc.stdout or "") + "\n" + (exc.stderr or "")
    return completed.returncode, (completed.stdout or "") + "\n" + (completed.stderr or "")


def ffprobe_duration(path: str) -> tuple[float | None, str | None]:
    code, output = run_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        timeout=60,
    )
    if code != 0:
        return None, output.strip() or "ffprobe failed"
    try:
        duration = float(output.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return None, f"could not parse ffprobe duration: {output.strip()}"
    return duration if math.isfinite(duration) else None, None


def find_spine_paths(baseline_dir: Path, manifest: dict[str, Any]) -> dict[str, str | None]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    candidates: list[str] = []
    for value in outputs.values():
        path = output_path(value)
        if path:
            candidates.append(path)
    for key in (
        "audioMorningPublicationReadinessRecommendedAudioFile",
        "audioMorningPublicationReadinessRecommendedListeningFile",
    ):
        value = manifest.get(key)
        if isinstance(value, str) and value:
            candidates.append(value)
    candidates.extend(str(path) for path in baseline_dir.glob("*mastered-audio-spine-v006.*"))
    candidates.extend(str(path) for path in baseline_dir.glob("episode4-mastered-audio-spine-v006.*"))
    wav = next((path for path in candidates if path.endswith(".wav") and Path(path).exists()), None)
    m4a = next((path for path in candidates if path.endswith(".m4a") and Path(path).exists()), None)
    return {"wav": wav, "m4a": m4a}


def build_windows(duration: float | None) -> list[dict[str, Any]]:
    windows = [dict(window) for window in WINDOWS]
    if duration and duration > 1800:
        for fraction, label in ((0.18, "early broad sample"), (0.50, "middle broad sample"), (0.82, "late broad sample")):
            start = max(0.0, min(duration - 24.0, duration * fraction))
            windows.append(
                {
                    "id": safe_slug(label),
                    "label": label.title(),
                    "startSeconds": round(start, 3),
                    "durationSeconds": 24.0,
                    "reason": "Broad episode sample so the audit is not only checking the known proof windows.",
                }
            )
    if duration:
        filtered = []
        for window in windows:
            start = float(window["startSeconds"])
            dur = float(window["durationSeconds"])
            if start >= duration:
                continue
            window["durationSeconds"] = round(max(1.0, min(dur, duration - start)), 3)
            filtered.append(window)
        return filtered
    return windows


def parse_volumedetect(output: str) -> dict[str, float | None]:
    means = MEAN_RE.findall(output)
    maxes = MAX_RE.findall(output)
    mean = float(means[-1]) if means else None
    maximum = float(maxes[-1]) if maxes else None
    return {"meanDb": mean, "maxDb": maximum}


def measure_band(source_wav: str, window: dict[str, Any], band: dict[str, Any]) -> dict[str, Any]:
    low = int(band["lowHz"])
    high = int(band["highHz"])
    filters = f"highpass=f={low},lowpass=f={high},volumedetect"
    code, output = run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-ss",
            f"{float(window['startSeconds']):.3f}",
            "-t",
            f"{float(window['durationSeconds']):.3f}",
            "-i",
            source_wav,
            "-vn",
            "-af",
            filters,
            "-f",
            "null",
            "-",
        ],
        timeout=120,
    )
    parsed = parse_volumedetect(output)
    return {
        "bandId": band["id"],
        "label": band["label"],
        "lowHz": low,
        "highHz": high,
        "exitCode": code,
        "meanDb": parsed["meanDb"],
        "maxDb": parsed["maxDb"],
        "ok": code == 0 and parsed["meanDb"] is not None,
        "errorTail": "\n".join(output.strip().splitlines()[-4:]) if code != 0 or parsed["meanDb"] is None else "",
    }


def measure_broadband(source_wav: str, window: dict[str, Any]) -> dict[str, Any]:
    code, output = run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-ss",
            f"{float(window['startSeconds']):.3f}",
            "-t",
            f"{float(window['durationSeconds']):.3f}",
            "-i",
            source_wav,
            "-vn",
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        timeout=120,
    )
    parsed = parse_volumedetect(output)
    mean = parsed["meanDb"]
    maximum = parsed["maxDb"]
    crest = maximum - mean if mean is not None and maximum is not None else None
    return {
        "exitCode": code,
        "meanDb": mean,
        "maxDb": maximum,
        "crestApproxDb": round(crest, 3) if crest is not None else None,
        "ok": code == 0 and mean is not None,
        "errorTail": "\n".join(output.strip().splitlines()[-4:]) if code != 0 or mean is None else "",
    }


def add_risk(risks: list[dict[str, Any]], *, window: dict[str, Any], code: str, severity: str, evidence: str, guidance: str) -> None:
    risks.append(
        {
            "windowId": window["id"],
            "windowLabel": window["label"],
            "startSeconds": window["startSeconds"],
            "durationSeconds": window["durationSeconds"],
            "code": code,
            "severity": severity,
            "evidence": evidence,
            "guidance": guidance,
        }
    )


def evaluate_window(window: dict[str, Any], broadband: dict[str, Any], measurements: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    risks: list[dict[str, Any]] = []
    notes: list[str] = []
    by_id = {row["bandId"]: row for row in measurements if row.get("ok")}
    presence = by_id.get("presence", {}).get("meanDb")
    warmth = by_id.get("warmth", {}).get("meanDb")
    rumble = by_id.get("sub-rumble", {}).get("meanDb")
    mud = by_id.get("mud", {}).get("meanDb")
    harsh = by_id.get("harshness", {}).get("meanDb")
    air = by_id.get("air-hiss", {}).get("meanDb")
    crest = broadband.get("crestApproxDb")

    if presence is None:
        add_risk(risks, window=window, code="missing-presence-measurement", severity="hard-stop", evidence="No usable 1k-4k presence-band measurement.", guidance="Do not treat this spectral audit as valid until ffmpeg measurement succeeds.")
        return risks, notes

    if presence < -55:
        add_risk(risks, window=window, code="very-low-presence", severity="review", evidence=f"Presence band mean {presence:.1f} dBFS.", guidance="Listen for unintelligible or over-gated dialogue in this window.")
    if rumble is not None and rumble - presence > -10:
        add_risk(risks, window=window, code="rumble-competes-with-voice", severity="review", evidence=f"Rumble is {rumble - presence:.1f} dB relative to presence.", guidance="Listen on headphones for HVAC/table/park rumble. Consider a scoped high-pass repair only if audible.")
    if mud is not None and mud - presence > -4:
        add_risk(risks, window=window, code="mud-competes-with-presence", severity="review", evidence=f"Mud band is {mud - presence:.1f} dB relative to presence.", guidance="Listen for boxy or muffled speech before changing EQ.")
    if harsh is not None and harsh - presence > -8:
        add_risk(risks, window=window, code="harshness-close-to-presence", severity="review", evidence=f"Harshness band is {harsh - presence:.1f} dB relative to presence.", guidance="Listen for brittle S sounds or fatigue, especially after compression/device translation.")
    if air is not None and air - presence > -13:
        add_risk(risks, window=window, code="air-hiss-elevated", severity="review", evidence=f"Air/hiss band is {air - presence:.1f} dB relative to presence.", guidance="Listen for hiss or codec fizz before de-noising; avoid killing natural room tone.")
    if warmth is not None and warmth - presence < -24:
        add_risk(risks, window=window, code="thin-voice-risk", severity="review", evidence=f"Warmth is {warmth - presence:.1f} dB relative to presence.", guidance="Listen for thin, over-filtered voices before adding warmth.")
    if crest is not None and crest < 6:
        add_risk(risks, window=window, code="low-crest-over-squash-risk", severity="review", evidence=f"Broadband crest approximation {crest:.1f} dB.", guidance="Listen for over-compression or lifeless cadence.")
    if crest is not None and crest > 32:
        add_risk(risks, window=window, code="high-crest-uneven-risk", severity="review", evidence=f"Broadband crest approximation {crest:.1f} dB.", guidance="Listen for sudden pokes, laugh spikes, or unbalanced reactions.")

    if not risks:
        notes.append("No spectral fatigue risk rule fired for this window.")
    return risks, notes


def summarize_bands(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for band in BANDS:
        values = []
        for window in windows:
            for measurement in window.get("bandMeasurements", []):
                if measurement.get("bandId") == band["id"] and isinstance(measurement.get("meanDb"), (int, float)):
                    values.append(float(measurement["meanDb"]))
        rows.append(
            {
                "bandId": band["id"],
                "label": band["label"],
                "lowHz": band["lowHz"],
                "highHz": band["highHz"],
                "sampleCount": len(values),
                "medianMeanDb": round(statistics.median(values), 3) if values else None,
                "minMeanDb": round(min(values), 3) if values else None,
                "maxMeanDb": round(max(values), 3) if values else None,
            }
        )
    return rows


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Spectral Fatigue Audit: {report['baselineId']}",
        "",
        "This is machine evidence for listener-fatigue risk in the mastered audio spine. It does not approve the spine, unlock branches, render final episode/short files, upload, publish, or mutate original media.",
        "",
        f"- Status: `{report['status']}`",
        f"- Windows measured: `{report['windowCount']}`",
        f"- Bands measured per window: `{report['bandCount']}`",
        f"- Measurements: `{report['measurementCount']}`",
        f"- Failed measurements: `{report['failedMeasurementCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        "",
        "## Band summary",
        "",
        "| Band | Range | Median mean | Min | Max | Samples |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in report["bandSummaries"]:
        lines.append(
            f"| {row['label']} | {row['lowHz']}-{row['highHz']} Hz | {row['medianMeanDb']} | {row['minMeanDb']} | {row['maxMeanDb']} | {row['sampleCount']} |"
        )
    lines.extend(["", "## Review risks", ""])
    if report["risks"]:
        for risk in report["risks"]:
            lines.append(f"- `{risk['severity']}` `{risk['code']}` at {risk['startSeconds']:.2f}s ({risk['windowLabel']}): {risk['evidence']} {risk['guidance']}")
    else:
        lines.append("- No spectral fatigue review risk rules fired.")
    lines.extend(["", "## Windows", ""])
    for window in report["windows"]:
        lines.append(f"### {window['label']} ({window['startSeconds']:.2f}s)")
        lines.append(f"- Reason: {window['reason']}")
        lines.append(f"- Broadband mean/max/crest: `{window['broadband'].get('meanDb')}` / `{window['broadband'].get('maxDb')}` / `{window['broadband'].get('crestApproxDb')}`")
        lines.append("- Notes: " + ("; ".join(window.get("notes") or []) or "See risks above."))
        lines.append("")
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    risk_items = "".join(
        f"<li><strong>{escape(r['severity'])}</strong> <code>{escape(r['code'])}</code> at {r['startSeconds']:.2f}s: {escape(r['evidence'])} {escape(r['guidance'])}</li>"
        for r in report["risks"]
    ) or "<li>No spectral fatigue review risk rules fired.</li>"
    band_rows = "".join(
        "<tr>"
        f"<td>{escape(row['label'])}</td>"
        f"<td>{row['lowHz']}-{row['highHz']} Hz</td>"
        f"<td>{row['medianMeanDb']}</td>"
        f"<td>{row['minMeanDb']}</td>"
        f"<td>{row['maxMeanDb']}</td>"
        f"<td>{row['sampleCount']}</td>"
        "</tr>"
        for row in report["bandSummaries"]
    )
    window_cards = []
    for window in report["windows"]:
        measurements = "".join(
            f"<tr><td>{escape(m['label'])}</td><td>{m['lowHz']}-{m['highHz']} Hz</td><td>{m.get('meanDb')}</td><td>{m.get('maxDb')}</td><td>{'yes' if m.get('ok') else 'no'}</td></tr>"
            for m in window.get("bandMeasurements", [])
        )
        window_cards.append(
            f"<section><h3>{escape(window['label'])} <span>{window['startSeconds']:.2f}s</span></h3>"
            f"<p>{escape(window['reason'])}</p>"
            f"<p>Broadband mean/max/crest: <code>{window['broadband'].get('meanDb')}</code> / <code>{window['broadband'].get('maxDb')}</code> / <code>{window['broadband'].get('crestApproxDb')}</code></p>"
            f"<table><thead><tr><th>Band</th><th>Range</th><th>Mean dBFS</th><th>Max dBFS</th><th>OK</th></tr></thead><tbody>{measurements}</tbody></table>"
            "</section>"
        )
    return f"""<!doctype html>
<html><head><meta charset=\"utf-8\"><title>Audio Spectral Fatigue Audit</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#171c18; color:#f5ecd8; margin:0; padding:32px; }}
main {{ max-width:1180px; margin:auto; }}
h1 {{ color:#f4c84a; letter-spacing:.04em; }}
.card, section {{ background:#22291f; border:1px solid #4d5b3f; border-radius:18px; padding:20px; margin:16px 0; box-shadow:0 12px 40px #0005; }}
.badge {{ display:inline-block; padding:8px 12px; border-radius:999px; background:#314a32; color:#8df097; margin:4px; font-weight:700; }}
.warn {{ background:#554321; color:#ffd166; }}
.stop {{ background:#5d2525; color:#ff9b9b; }}
table {{ border-collapse:collapse; width:100%; margin-top:12px; }}
th,td {{ border-bottom:1px solid #3f4739; padding:8px; text-align:left; }}
code {{ color:#9ee6ff; }}
span {{ color:#d2b26d; font-size:.8em; }}
</style></head><body><main>
<h1>Audio Spectral Fatigue Audit</h1>
<div class=\"card\">
<p>This is machine evidence for listener-fatigue risk in the mastered audio spine. It does not approve the spine, unlock branches, render final episode/short files, upload, publish, or mutate original media.</p>
<span class=\"badge\">{escape(report['status'])}</span>
<span class=\"badge\">{report['windowCount']} windows</span>
<span class=\"badge\">{report['measurementCount']} measurements</span>
<span class=\"badge warn\">{report['reviewRiskCount']} review risks</span>
<span class=\"badge stop\">{report['hardStopCount']} hard stops</span>
</div>
<section><h2>Band summary</h2><table><thead><tr><th>Band</th><th>Range</th><th>Median mean</th><th>Min</th><th>Max</th><th>Samples</th></tr></thead><tbody>{band_rows}</tbody></table></section>
<section><h2>Review risks</h2><ul>{risk_items}</ul></section>
{''.join(window_cards)}
</main></body></html>"""


def write_open_command(path: Path, targets: list[Path]) -> None:
    lines = ["#!/bin/zsh", "set -euo pipefail"]
    for target in targets:
        lines.append(f"open {shell_quote(str(target))}")
    write_text(path, "\n".join(lines) + "\n")
    path.chmod(0o755)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate spectral/listener-fatigue audit for a mastered audio spine.")
    parser.add_argument("--baseline-dir", required=True, help="Baseline directory containing manifest.json")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(Path(args.baseline_dir))
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or BASELINE_ID_FALLBACK)
    slug = safe_slug(baseline_id)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    spine_paths = find_spine_paths(baseline_dir, manifest)
    source_wav = spine_paths["wav"]
    source_m4a = spine_paths["m4a"]

    hard_stops: list[str] = []
    if not source_wav:
        hard_stops.append("Missing mastered WAV spine for spectral measurement.")
    duration, duration_error = ffprobe_duration(source_wav) if source_wav else (None, "missing wav")
    if duration_error:
        hard_stops.append(f"Could not probe WAV duration: {duration_error}")

    window_reports: list[dict[str, Any]] = []
    all_risks: list[dict[str, Any]] = []
    failed_measurements = 0
    measurement_count = 0

    if source_wav and not duration_error:
        for window in build_windows(duration):
            broadband = measure_broadband(source_wav, window)
            if not broadband.get("ok"):
                failed_measurements += 1
            band_measurements = []
            for band in BANDS:
                measurement = measure_band(source_wav, window, band)
                measurement_count += 1
                if not measurement.get("ok"):
                    failed_measurements += 1
                band_measurements.append(measurement)
            risks, notes = evaluate_window(window, broadband, band_measurements)
            all_risks.extend(risks)
            window_reports.append(
                {
                    **window,
                    "broadband": broadband,
                    "bandMeasurements": band_measurements,
                    "riskCount": len(risks),
                    "notes": notes,
                }
            )

    hard_stop_risks = [risk for risk in all_risks if risk.get("severity") == "hard-stop"]
    hard_stop_count = len(hard_stops) + len(hard_stop_risks)
    review_risks = [risk for risk in all_risks if risk.get("severity") != "hard-stop"]
    if hard_stop_count:
        status = "spectral-fatigue-hard-stop"
    elif review_risks:
        status = "spectral-fatigue-ready-with-review-risks"
    else:
        status = "spectral-fatigue-ready"

    out_dir = baseline_dir / f"audio-spectral-fatigue-audit-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "spectral-fatigue-audit.json"
    md_path = out_dir / "spectral-fatigue-audit.md"
    html_path = out_dir / "spectral-fatigue-audit.html"
    open_path = out_dir / "open-spectral-fatigue-audit.command"
    stable_json = baseline_dir / "AUDIO_SPECTRAL_FATIGUE_AUDIT.json"
    stable_md = baseline_dir / "AUDIO_SPECTRAL_FATIGUE_AUDIT.md"
    stable_html = baseline_dir / "AUDIO_SPECTRAL_FATIGUE_AUDIT.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SPECTRAL_FATIGUE_AUDIT.command"

    report: dict[str, Any] = {
        "schema": SCHEMA,
        "baselineId": baseline_id,
        "generatedAt": generated_at,
        "status": status,
        "sourceWav": source_wav,
        "sourceM4a": source_m4a,
        "durationSeconds": round(duration, 3) if duration is not None else None,
        "windowCount": len(window_reports),
        "bandCount": len(BANDS),
        "measurementCount": measurement_count,
        "failedMeasurementCount": failed_measurements,
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": len(review_risks),
        "hardStops": hard_stops,
        "risks": all_risks,
        "bandSummaries": summarize_bands(window_reports),
        "windows": window_reports,
        "machineReadyForHumanListen": hard_stop_count == 0,
        "humanListenRequired": True,
        "publicationReady": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "path": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "openCommand": str(open_path),
        "stableJsonPath": str(stable_json),
        "stableMarkdownPath": str(stable_md),
        "stableHtmlPath": str(stable_html),
        "stableOpenCommand": str(stable_open),
    }

    markdown = render_markdown(report)
    html = render_html(report)
    write_json(json_path, report)
    write_text(md_path, markdown)
    write_text(html_path, html)
    write_open_command(open_path, [html_path])
    write_json(stable_json, report)
    write_text(stable_md, markdown)
    write_text(stable_html, html)
    write_open_command(stable_open, [stable_html])

    outputs["latestAudioSpectralFatigueAudit"] = str(stable_json)
    outputs["latestAudioSpectralFatigueAuditMarkdown"] = str(stable_md)
    outputs["latestAudioSpectralFatigueAuditHtml"] = str(stable_html)
    outputs["latestAudioSpectralFatigueAuditOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioSpectralFatigueAudits", [])
    history.append(str(json_path))
    del history[:-20]

    manifest["audioSpectralFatigueAuditLatestStatus"] = status
    manifest["audioSpectralFatigueAuditWindowCount"] = report["windowCount"]
    manifest["audioSpectralFatigueAuditBandCount"] = report["bandCount"]
    manifest["audioSpectralFatigueAuditMeasurementCount"] = report["measurementCount"]
    manifest["audioSpectralFatigueAuditFailedMeasurementCount"] = report["failedMeasurementCount"]
    manifest["audioSpectralFatigueAuditHardStopCount"] = report["hardStopCount"]
    manifest["audioSpectralFatigueAuditReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioSpectralFatigueAuditMachineReadyForHumanListen"] = report["machineReadyForHumanListen"]
    manifest["audioSpectralFatigueAuditHumanListenRequired"] = report["humanListenRequired"]
    manifest["audioSpectralFatigueAuditPublicationReady"] = report["publicationReady"]
    manifest["audioSpectralFatigueAuditApprovalStateChanged"] = False
    manifest["audioSpectralFatigueAuditBranchStateChanged"] = False
    manifest["audioSpectralFatigueAuditRenderAttempted"] = False
    manifest["audioSpectralFatigueAuditBranchRenderAttempted"] = False
    manifest["audioSpectralFatigueAuditUploadAttempted"] = False
    manifest["audioSpectralFatigueAuditPublicationAttempted"] = False
    manifest["audioSpectralFatigueAuditOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)

    print(str(stable_html))
    return 0 if hard_stop_count == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
