#!/usr/bin/env python3
"""Generate a visual overview for the mastered Episode audio spine.

This creates full-spine and proof-window waveform images plus a small local
HTML/Markdown review packet. It is evidence only: it does not approve audio,
fail audio, render edit branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Window:
    slug: str
    label: str
    center_sec: float
    duration_sec: float = 30.0

    @property
    def start_sec(self) -> float:
        return max(0.0, self.center_sec - (self.duration_sec / 2.0))


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


def format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True)


def ffprobe_audio(path: Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name,sample_rate,channels:format=duration,size",
            "-of",
            "json",
            str(path),
        ]
    )
    if result.returncode != 0:
        return {
            "exists": path.exists(),
            "path": str(path),
            "probeOk": False,
            "error": result.stderr.strip() or result.stdout.strip(),
        }
    payload = json.loads(result.stdout)
    stream = (payload.get("streams") or [{}])[0]
    fmt = payload.get("format") or {}
    return {
        "exists": path.exists(),
        "path": str(path),
        "probeOk": True,
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "durationSeconds": float(fmt.get("duration") or 0.0),
        "sizeBytes": int(fmt.get("size") or 0),
    }


def render_waveform(
    *,
    source: Path,
    destination: Path,
    width: int,
    height: int,
    start_sec: float | None = None,
    duration_sec: float | None = None,
) -> dict[str, Any]:
    command = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if start_sec is not None:
        command.extend(["-ss", f"{start_sec:.3f}"])
    command.extend(["-i", str(source)])
    if duration_sec is not None:
        command.extend(["-t", f"{duration_sec:.3f}"])
    command.extend(
        [
            "-filter_complex",
            f"aformat=channel_layouts=stereo,showwavespic=s={width}x{height}:colors=0xD6B85C",
            "-frames:v",
            "1",
            str(destination),
        ]
    )
    result = run(command)
    return {
        "path": str(destination),
        "exists": destination.exists(),
        "sizeBytes": destination.stat().st_size if destination.exists() else 0,
        "returncode": result.returncode,
        "stderr": result.stderr.strip(),
        "stdout": result.stdout.strip(),
        "command": command,
    }


def detect_silences(source: Path) -> dict[str, Any]:
    result = run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(source),
            "-af",
            "silencedetect=noise=-45dB:d=2",
            "-f",
            "null",
            "-",
        ]
    )
    text = "\n".join(part for part in [result.stdout, result.stderr] if part)
    starts: list[float] = []
    ends: list[dict[str, float]] = []
    for line in text.splitlines():
        start = re.search(r"silence_start:\s*([0-9.]+)", line)
        if start:
            starts.append(float(start.group(1)))
            continue
        end = re.search(r"silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)", line)
        if end:
            ends.append({"endSec": float(end.group(1)), "durationSec": float(end.group(2))})
    pairs: list[dict[str, float]] = []
    for index, item in enumerate(ends):
        start_sec = starts[index] if index < len(starts) else max(0.0, item["endSec"] - item["durationSec"])
        pairs.append(
            {
                "startSec": start_sec,
                "endSec": item["endSec"],
                "durationSec": item["durationSec"],
            }
        )
    longest = sorted(pairs, key=lambda item: item["durationSec"], reverse=True)[:10]
    return {
        "returncode": result.returncode,
        "silenceCount": len(pairs),
        "longestSilences": longest,
        "stderrTail": "\n".join(text.splitlines()[-20:]),
    }


def default_windows() -> list[Window]:
    return [
        Window(slug="long-silence", label="Long silence review marker", center_sec=1760.001, duration_sec=40.0),
        Window(slug="camera-assistant-overlap", label="Camera assistant overlap proof window", center_sec=2062.0),
        Window(slug="office-clip-transition", label="Office clip and reaction proof window", center_sec=4180.0),
        Window(slug="late-episode-proof", label="Late episode proof window", center_sec=5710.0),
    ]


def render_html(report: dict[str, Any]) -> str:
    def esc(value: Any) -> str:
        return html.escape(str(value))

    window_cards = []
    for window in report["windows"]:
        img = Path(window["waveform"]["path"]).name
        window_cards.append(
            f"""
            <section class="card">
              <h2>{esc(window['label'])}</h2>
              <p><strong>Center:</strong> {esc(window['centerTime'])} · <strong>Range:</strong> {esc(window['startTime'])} to {esc(window['endTime'])}</p>
              <audio controls src="{esc(Path(report['reviewAudioPath']).name)}"></audio>
              <img src="{esc(img)}" alt="{esc(window['label'])} waveform">
            </section>
            """
        )
    silences = "\n".join(
        f"<li>{esc(format_time(item['startSec']))} to {esc(format_time(item['endSec']))} ({item['durationSec']:.2f}s)</li>"
        for item in report["silenceScan"]["longestSilences"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Episode 4 Audio Master Visual Overview</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101713;
      --card: #17241d;
      --ink: #f5ecd4;
      --muted: #b9ae92;
      --gold: #d6b85c;
      --moss: #5d7d4d;
    }}
    body {{
      margin: 0;
      padding: 32px;
      background: radial-gradient(circle at top left, #243922, var(--bg) 44rem);
      color: var(--ink);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }}
    h1, h2 {{ margin: 0 0 8px; }}
    .card {{
      margin: 18px 0;
      padding: 18px;
      border: 1px solid rgba(214, 184, 92, 0.25);
      border-radius: 18px;
      background: color-mix(in srgb, var(--card) 88%, black);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
    }}
    .meta {{ color: var(--muted); }}
    img {{
      display: block;
      width: 100%;
      margin-top: 12px;
      border-radius: 12px;
      background: #050705;
    }}
    audio {{ width: 100%; margin: 8px 0; }}
    code {{ color: var(--gold); }}
  </style>
</head>
<body>
  <h1>Episode 4 Audio Master Visual Overview</h1>
  <p class="meta">Generated: <code>{esc(report['generatedAt'])}</code></p>
  <section class="card">
    <h2>Full mastered spine</h2>
    <p><strong>Candidate:</strong> {esc(report['baselineId'])}</p>
    <p><strong>Approval:</strong> {esc(report['approvalStatus'])} · <strong>Branch render ready:</strong> {esc(report['branchRenderReady'])}</p>
    <audio controls src="{esc(Path(report['reviewAudioPath']).name)}"></audio>
    <img src="{esc(Path(report['fullWaveform']['path']).name)}" alt="Full mastered audio waveform">
  </section>
  <section class="card">
    <h2>Longest detected silences</h2>
    <ul>{silences}</ul>
  </section>
  {''.join(window_cards)}
</body>
</html>
"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Master Visual Overview: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet gives humans and agents a visual map of the mastered audio spine. It does not approve audio, fail audio, render branches, upload files, or mutate source media.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Review audio: `{report['reviewAudioPath']}`",
        f"- Full waveform: `{report['fullWaveform']['path']}`",
        f"- HTML overview: `{report['htmlPath']}`",
        f"- Long silence count at -45dB/2s: `{report['silenceScan']['silenceCount']}`",
        "",
        "## Proof windows",
        "",
        "| Window | Center | Range | Waveform | Rendered |",
        "|---|---:|---:|---|---:|",
    ]
    for window in report["windows"]:
        lines.append(
            f"| {window['label']} | `{window['centerTime']}` | `{window['startTime']} to {window['endTime']}` | "
            f"`{window['waveform']['path']}` | `{str(window['waveform']['exists']).lower()}` |"
        )
    lines.extend(
        [
            "",
            "## Longest detected silences",
            "",
            "| Start | End | Duration |",
            "|---:|---:|---:|",
        ]
    )
    for item in report["silenceScan"]["longestSilences"]:
        lines.append(
            f"| `{format_time(item['startSec'])}` | `{format_time(item['endSec'])}` | `{item['durationSec']:.3f}s` |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "Use this to orient human listening and future repair decisions. It is not a substitute for listening, and it does not unlock branch inheritance.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--width", type=int, default=2400)
    parser.add_argument("--height", type=int, default=360)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    output_dir = baseline_dir / f"audio-master-visual-overview-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=False)

    review_audio_path = output_path(outputs_before.get("masterM4a")) or output_path(outputs_before.get("masterWav"))
    if not review_audio_path:
        raise SystemExit("No masterM4a or masterWav registered in manifest outputs.")
    review_audio = Path(review_audio_path)
    if not review_audio.exists():
        raise SystemExit(f"Review audio is missing: {review_audio}")

    local_audio = output_dir / review_audio.name
    if local_audio.resolve() != review_audio.resolve():
        local_audio.symlink_to(review_audio)

    probe = ffprobe_audio(review_audio)
    full_waveform_path = output_dir / "episode4-mastered-audio-spine-v006-full-waveform.png"
    full_waveform = render_waveform(
        source=review_audio,
        destination=full_waveform_path,
        width=args.width,
        height=args.height,
    )

    windows = []
    duration_seconds = float(probe.get("durationSeconds") or 0.0)
    for window in default_windows():
        start = min(window.start_sec, max(0.0, duration_seconds - window.duration_sec))
        end = min(duration_seconds, start + window.duration_sec) if duration_seconds else start + window.duration_sec
        path = output_dir / f"{window.slug}-waveform.png"
        waveform = render_waveform(
            source=review_audio,
            destination=path,
            width=1400,
            height=260,
            start_sec=start,
            duration_sec=max(0.1, end - start),
        )
        windows.append(
            {
                "slug": window.slug,
                "label": window.label,
                "centerSec": window.center_sec,
                "centerTime": format_time(window.center_sec),
                "startSec": start,
                "startTime": format_time(start),
                "endSec": end,
                "endTime": format_time(end),
                "waveform": waveform,
            }
        )

    silence_scan = detect_silences(review_audio)
    report = {
        "schema": "quipsly.audio-workbench.master-visual-overview.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_iso,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "reviewAudioPath": str(review_audio),
        "localReviewAudioSymlink": str(local_audio),
        "probe": probe,
        "fullWaveform": full_waveform,
        "windows": windows,
        "silenceScan": silence_scan,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    report["passed"] = bool(
        probe.get("probeOk")
        and full_waveform.get("exists")
        and all(window["waveform"].get("exists") for window in windows)
        and not report["approvalStateChanged"]
        and not report["branchStateChanged"]
        and not report["renderAttempted"]
        and not report["originalMediaMutated"]
    )

    json_path = output_dir / f"audio-master-visual-overview-{slug}-{generated_at}.json"
    markdown_path = output_dir / f"audio-master-visual-overview-{slug}-{generated_at}.md"
    html_path = output_dir / "audio-master-visual-overview.html"
    report["jsonPath"] = str(json_path)
    report["markdownPath"] = str(markdown_path)
    report["htmlPath"] = str(html_path)
    html_path.write_text(render_html(report), encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    write_json(json_path, report)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioMasterVisualOverview"] = str(json_path)
    outputs["latestAudioMasterVisualOverviewMarkdown"] = str(markdown_path)
    outputs["latestAudioMasterVisualOverviewHtml"] = str(html_path)
    outputs["latestAudioMasterVisualOverviewFullWaveformPng"] = str(full_waveform_path)
    overview_entries = outputs.setdefault("audioMasterVisualOverviews", [])
    overview_entries.append(
        {
            "path": str(json_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "fullWaveformPath": str(full_waveform_path),
            "generatedAt": generated_iso,
            "passed": report["passed"],
            "windowCount": len(windows),
            "silenceCount": silence_scan["silenceCount"],
        }
    )
    manifest["audioMasterVisualOverviewCount"] = len(overview_entries)
    manifest["updatedAt"] = generated_iso
    write_json(manifest_path, manifest)

    print(str(markdown_path))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
