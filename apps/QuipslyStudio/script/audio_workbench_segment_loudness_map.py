#!/usr/bin/env python3
"""Generate a segment-level audio energy map for Episode 4.

This is a lightweight visibility layer over the current mastered spine and the
source-aware stems. It computes RMS dBFS and sample-peak dBFS by time window so
reviewers and agents can find loud, quiet, or unexplained sections without
rendering media or changing source files. It is not a BS.1770 LUFS replacement;
it is a fast control-plane map that routes ears.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import math
import wave
from array import array
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)

EDITOR_AUDIO_TRUTH_RULE = (
    "The editor-grade truth is aligned, source-aware refined stems plus a mix recipe; "
    "the combined mastered spine is a review/export convenience artifact."
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = output_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def dbfs_from_linear(value: float) -> float:
    if value <= 0:
        return -96.0
    return round(20.0 * math.log10(max(value, 1e-12) / 32768.0), 2)


def seconds_label(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def summarize_values(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"min": None, "max": None, "mean": None}
    return {
        "min": round(min(values), 2),
        "max": round(max(values), 2),
        "mean": round(sum(values) / len(values), 2),
    }


def analyze_wav(path: Path, role_id: str, label: str, window_seconds: float) -> dict[str, Any]:
    if not path.exists():
        return {
            "roleId": role_id,
            "label": label,
            "path": str(path),
            "exists": False,
            "status": "missing",
            "windows": [],
            "summary": {"windowCount": 0},
        }
    windows: list[dict[str, Any]] = []
    with wave.open(str(path), "rb") as wf:
        channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        frame_rate = wf.getframerate()
        frame_count = wf.getnframes()
        duration = frame_count / frame_rate if frame_rate else 0.0
        if sample_width != 2:
            return {
                "roleId": role_id,
                "label": label,
                "path": str(path),
                "exists": True,
                "status": "unsupported-sample-width",
                "sampleWidth": sample_width,
                "windows": [],
                "summary": {"windowCount": 0},
            }
        frames_per_window = max(1, int(frame_rate * window_seconds))
        start_frame = 0
        while start_frame < frame_count:
            to_read = min(frames_per_window, frame_count - start_frame)
            raw = wf.readframes(to_read)
            samples = array("h")
            samples.frombytes(raw)
            if samples.itemsize != 2:
                raise RuntimeError("Unexpected sample size while reading WAV")
            if not samples:
                break
            peak = max(abs(int(sample)) for sample in samples)
            square_sum = sum(int(sample) * int(sample) for sample in samples)
            rms = math.sqrt(square_sum / len(samples)) if samples else 0.0
            start_sec = start_frame / frame_rate
            end_sec = (start_frame + to_read) / frame_rate
            windows.append(
                {
                    "index": len(windows) + 1,
                    "startSeconds": round(start_sec, 3),
                    "endSeconds": round(end_sec, 3),
                    "time": seconds_label(start_sec),
                    "durationSeconds": round(end_sec - start_sec, 3),
                    "rmsDbfs": dbfs_from_linear(rms),
                    "samplePeakDbfs": dbfs_from_linear(float(peak)),
                }
            )
            start_frame += to_read
    rms_values = [w["rmsDbfs"] for w in windows]
    peak_values = [w["samplePeakDbfs"] for w in windows]
    return {
        "roleId": role_id,
        "label": label,
        "path": str(path),
        "exists": True,
        "status": "ready",
        "channels": channels,
        "sampleRate": frame_rate,
        "sampleWidth": sample_width,
        "durationSeconds": round(duration, 3),
        "windowSeconds": window_seconds,
        "windows": windows,
        "summary": {
            "windowCount": len(windows),
            "rmsDbfs": summarize_values(rms_values),
            "samplePeakDbfs": summarize_values(peak_values),
            "quietWindowCount": sum(1 for value in rms_values if value <= -46.0),
            "veryQuietWindowCount": sum(1 for value in rms_values if value <= -55.0),
            "hotPeakWindowCount": sum(1 for value in peak_values if value >= -1.0),
            "nearHotPeakWindowCount": sum(1 for value in peak_values if value >= -3.0),
            "activeWindowCount": sum(1 for value in rms_values if value > -50.0),
        },
    }


def load_source_stem_manifest(baseline_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    path = output_path(outputs.get("latestAudioSourceAwareStemManifest")) or str(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json")
    p = Path(path)
    if p.exists():
        return read_json(p)
    return {}


def build_tracks(baseline_dir: Path, manifest: dict[str, Any], stem_manifest: dict[str, Any], window_seconds: float) -> list[dict[str, Any]]:
    outputs = manifest.get("outputs") or {}
    master_wav = output_path(outputs.get("masterWav")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")
    tracks = [analyze_wav(Path(master_wav), "master", "Mastered v006 spine", window_seconds)]
    for role in stem_manifest.get("roles") or []:
        refined = role.get("selectedRefinedStem") if isinstance(role.get("selectedRefinedStem"), dict) else {}
        path = refined.get("path")
        if path:
            tracks.append(analyze_wav(Path(path), str(role.get("roleId") or "stem"), str(role.get("label") or role.get("roleId") or "Stem"), window_seconds))
    return tracks


def build_outliers(tracks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_role = {track["roleId"]: track for track in tracks}
    master = by_role.get("master") or {}
    windows = master.get("windows") if isinstance(master.get("windows"), list) else []
    outliers: list[dict[str, Any]] = []
    for window in windows:
        flags: list[str] = []
        if window["samplePeakDbfs"] >= -1.0:
            flags.append("near-digital-peak")
        if window["rmsDbfs"] <= -55.0:
            flags.append("very-quiet-master-window")
        elif window["rmsDbfs"] <= -46.0:
            flags.append("quiet-master-window")
        if window["rmsDbfs"] >= -14.0:
            flags.append("very-loud-master-window")
        idx = int(window["index"]) - 1
        stem_values = {}
        active_stems = []
        for role_id in ("charlie", "homer", "clip-source"):
            track = by_role.get(role_id) or {}
            role_windows = track.get("windows") if isinstance(track.get("windows"), list) else []
            if idx < len(role_windows):
                rms = role_windows[idx]["rmsDbfs"]
                stem_values[role_id] = rms
                if rms > -50.0:
                    active_stems.append(role_id)
        if window["rmsDbfs"] > -38.0 and not active_stems:
            flags.append("master-energy-without-active-stem")
        if flags:
            outliers.append(
                {
                    "time": window["time"],
                    "startSeconds": window["startSeconds"],
                    "endSeconds": window["endSeconds"],
                    "masterRmsDbfs": window["rmsDbfs"],
                    "masterSamplePeakDbfs": window["samplePeakDbfs"],
                    "activeStems": active_stems,
                    "stemRmsDbfs": stem_values,
                    "flags": flags,
                    "listenQuestion": "Does this segment sound natural and intelligible, or should it route to a scoped v007 proof/repair window?",
                }
            )
    return outliers[:120]


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str, window_seconds: float) -> dict[str, Any]:
    stem_manifest = load_source_stem_manifest(baseline_dir, manifest)
    tracks = build_tracks(baseline_dir, manifest, stem_manifest, window_seconds)
    outliers = build_outliers(tracks)
    missing_tracks = [track["roleId"] for track in tracks if not track.get("exists")]
    status = "segment-audio-map-ready-human-listen-gated"
    if missing_tracks:
        status = "segment-audio-map-needs-attention"
    elif outliers:
        status = "segment-audio-map-ready-with-review-windows-human-listen-gated"
    safety = {
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    return {
        "schema": "quipsly.audio.segmentLoudnessMap.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "editorAudioTruthRule": EDITOR_AUDIO_TRUTH_RULE,
        "measurementCaveat": "This is windowed RMS/sample-peak dBFS visibility, not a full BS.1770 LUFS/true-peak measurement. It routes review attention; it does not approve audio.",
        "windowSeconds": window_seconds,
        "trackCount": len(tracks),
        "missingTrackCount": len(missing_tracks),
        "outlierCount": len(outliers),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "approvalStatus": manifest.get("approvalStatus"),
        "tracks": tracks,
        "outliers": outliers,
        "safety": safety,
        **safety,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Segment Audio Map",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        f"Status: `{report['status']}`",
        "",
        report["measurementCaveat"],
        "",
        f"Window size: `{report['windowSeconds']}` seconds",
        "",
        "## Track summary",
        "",
        "| Track | Status | Duration | Windows | RMS mean | Peak max | Quiet | Hot peak |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for track in report["tracks"]:
        summary = track.get("summary") or {}
        rms = summary.get("rmsDbfs") or {}
        peak = summary.get("samplePeakDbfs") or {}
        lines.append(
            "| "
            + " | ".join(
                [
                    track.get("label", track.get("roleId", "track")),
                    f"`{track.get('status')}`",
                    str(track.get("durationSeconds") or "unknown"),
                    str(summary.get("windowCount") or 0),
                    str(rms.get("mean")),
                    str(peak.get("max")),
                    str(summary.get("quietWindowCount") or 0),
                    str(summary.get("hotPeakWindowCount") or 0),
                ]
            )
            + " |"
        )
    lines.extend([
        "",
        "## Review windows",
        "",
        "| Time | Master RMS | Peak | Active stems | Flags |",
        "| --- | ---: | ---: | --- | --- |",
    ])
    for row in report["outliers"][:40]:
        lines.append(
            f"| {row['time']} | {row['masterRmsDbfs']} | {row['masterSamplePeakDbfs']} | {', '.join(row['activeStems']) or 'none'} | {', '.join(row['flags'])} |"
        )
    if len(report["outliers"]) > 40:
        lines.append(f"| ... | ... | ... | ... | {len(report['outliers']) - 40} more in JSON/CSV |")
    lines.extend(["", "## Safety", ""])
    for key, value in report["safety"].items():
        lines.append(f"- `{key}`: `{str(value).lower()}`")
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for track in report["tracks"]:
        summary = track.get("summary") or {}
        rms = summary.get("rmsDbfs") or {}
        peak = summary.get("samplePeakDbfs") or {}
        rows.append(
            f"<tr><td>{html.escape(str(track.get('label')))}</td><td><code>{html.escape(str(track.get('status')))}</code></td><td>{html.escape(str(track.get('durationSeconds')))}</td><td>{html.escape(str(summary.get('windowCount')))}</td><td>{html.escape(str(rms.get('mean')))}</td><td>{html.escape(str(peak.get('max')))}</td><td>{html.escape(str(summary.get('quietWindowCount')))}</td><td>{html.escape(str(summary.get('hotPeakWindowCount')))}</td></tr>"
        )
    outlier_rows = []
    for row in report["outliers"][:80]:
        outlier_rows.append(
            f"<tr><td>{html.escape(row['time'])}</td><td>{row['masterRmsDbfs']}</td><td>{row['masterSamplePeakDbfs']}</td><td>{html.escape(', '.join(row['activeStems']) or 'none')}</td><td>{html.escape(', '.join(row['flags']))}</td></tr>"
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episode 4 Segment Audio Map</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; background: #f8f2e7; color: #2f261d; }}
    .hero, section {{ background: #fffaf0; border: 1px solid #dbc79b; border-radius: 18px; padding: 22px; margin-bottom: 18px; box-shadow: 0 12px 36px rgba(88,65,32,.10); }}
    .pill {{ display:inline-block; padding: 6px 10px; border-radius:999px; background:#244d3a; color:#f6ffe8; font-weight:700; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border-bottom: 1px solid #dfcfad; padding: 8px; text-align: left; vertical-align: top; }}
    code {{ background: rgba(65,43,25,.10); padding: 2px 5px; border-radius: 6px; }}
  </style>
</head>
<body>
  <div class=\"hero\"><p class=\"pill\">{html.escape(report['status'])}</p><h1>Episode 4 Segment Audio Map</h1><p>{html.escape(report['measurementCaveat'])}</p></div>
  <section><h2>Track summary</h2><table><thead><tr><th>Track</th><th>Status</th><th>Duration</th><th>Windows</th><th>RMS mean</th><th>Peak max</th><th>Quiet</th><th>Hot peak</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>
  <section><h2>Review windows</h2><table><thead><tr><th>Time</th><th>Master RMS</th><th>Peak</th><th>Active stems</th><th>Flags</th></tr></thead><tbody>{''.join(outlier_rows)}</tbody></table></section>
</body>
</html>
"""


def write_csv(path: Path, report: dict[str, Any]) -> None:
    tracks = {track["roleId"]: track for track in report["tracks"]}
    master_windows = tracks.get("master", {}).get("windows") or []
    role_ids = [role for role in tracks if role != "master"]
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        header = ["index", "time", "startSeconds", "endSeconds", "masterRmsDbfs", "masterSamplePeakDbfs"]
        for role_id in role_ids:
            header.extend([f"{role_id}RmsDbfs", f"{role_id}SamplePeakDbfs"])
        writer.writerow(header)
        for i, window in enumerate(master_windows):
            row = [window["index"], window["time"], window["startSeconds"], window["endSeconds"], window["rmsDbfs"], window["samplePeakDbfs"]]
            for role_id in role_ids:
                role_windows = tracks[role_id].get("windows") or []
                if i < len(role_windows):
                    row.extend([role_windows[i]["rmsDbfs"], role_windows[i]["samplePeakDbfs"]])
                else:
                    row.extend(["", ""])
            writer.writerow(row)


def update_manifest(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, csv_path: Path, open_command: Path, versioned: dict[str, str]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "schema": report["schema"],
        "status": report["status"],
        "generatedAt": report["generatedAt"],
        "path": str(json_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "openCommand": str(open_command),
        "versionedPath": versioned["json"],
        "versionedJsonPath": versioned["json"],
        "versionedMarkdownPath": versioned["markdown"],
        "versionedHtmlPath": versioned["html"],
        "versionedCsvPath": versioned["csv"],
        "versionedOpenCommand": versioned["openCommand"],
        "windowSeconds": report["windowSeconds"],
        "trackCount": report["trackCount"],
        "outlierCount": report["outlierCount"],
        "humanListenStillRequired": report["humanListenStillRequired"],
        **report["safety"],
    }
    outputs["latestAudioSegmentLoudnessMap"] = entry
    outputs["latestAudioSegmentLoudnessMapMarkdown"] = str(md_path)
    outputs["latestAudioSegmentLoudnessMapHtml"] = str(html_path)
    outputs["latestAudioSegmentLoudnessMapCsv"] = str(csv_path)
    outputs["latestAudioSegmentLoudnessMapOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioSegmentLoudnessMaps", [])
    if isinstance(history, list):
        history.append(entry)
    else:
        outputs["audioSegmentLoudnessMaps"] = [entry]
    manifest["audioSegmentLoudnessMapLatestStatus"] = report["status"]
    manifest["audioSegmentLoudnessMapLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioSegmentLoudnessMapWindowSeconds"] = report["windowSeconds"]
    manifest["audioSegmentLoudnessMapTrackCount"] = report["trackCount"]
    manifest["audioSegmentLoudnessMapMissingTrackCount"] = report["missingTrackCount"]
    manifest["audioSegmentLoudnessMapOutlierCount"] = report["outlierCount"]
    manifest["audioSegmentLoudnessMapHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioSegmentLoudnessMapLatestMarkdown"] = str(md_path)
    for key, value in report["safety"].items():
        manifest["audioSegmentLoudnessMap" + key[0].upper() + key[1:]] = value
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    parser.add_argument("--window-seconds", type=float, default=10.0)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = iso_now()
    stamp = utc_stamp()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))

    report = build_report(manifest, baseline_dir, generated_at, args.window_seconds)
    markdown = render_markdown(report)
    html_doc = render_html(report)

    json_path = baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json"
    md_path = baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.md"
    html_path = baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.html"
    csv_path = baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.csv"
    open_command = baseline_dir / "OPEN_AUDIO_SEGMENT_LOUDNESS_MAP.command"
    version_json = baseline_dir / f"audio-segment-loudness-map-{baseline_slug}-{stamp}.json"
    version_md = baseline_dir / f"audio-segment-loudness-map-{baseline_slug}-{stamp}.md"
    version_html = baseline_dir / f"audio-segment-loudness-map-{baseline_slug}-{stamp}.html"
    version_csv = baseline_dir / f"audio-segment-loudness-map-{baseline_slug}-{stamp}.csv"
    version_open = baseline_dir / f"open-audio-segment-loudness-map-{baseline_slug}-{stamp}.command"

    write_json(json_path, report)
    md_path.write_text(markdown + "\n", encoding="utf-8")
    html_path.write_text(html_doc, encoding="utf-8")
    write_csv(csv_path, report)
    write_json(version_json, report)
    version_md.write_text(markdown + "\n", encoding="utf-8")
    version_html.write_text(html_doc, encoding="utf-8")
    write_csv(version_csv, report)
    command_text = "#!/bin/zsh\nopen " + shell_quote(str(html_path)) + "\n"
    open_command.write_text(command_text, encoding="utf-8")
    version_open.write_text(command_text.replace(str(html_path), str(version_html)), encoding="utf-8")
    open_command.chmod(0o755)
    version_open.chmod(0o755)

    update_manifest(
        manifest_path,
        report,
        json_path,
        md_path,
        html_path,
        csv_path,
        open_command,
        {"json": str(version_json), "markdown": str(version_md), "html": str(version_html), "csv": str(version_csv), "openCommand": str(version_open)},
    )
    print(json.dumps({
        "status": report["status"],
        "trackCount": report["trackCount"],
        "outlierCount": report["outlierCount"],
        "windowSeconds": report["windowSeconds"],
        "json": str(json_path),
        "html": str(html_path),
        "csv": str(csv_path),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
