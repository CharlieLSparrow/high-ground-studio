#!/usr/bin/env python3
"""Generate full-length review assist evidence for selected Episode 1 artifacts.

This is deliberately not an approval engine. It creates review scaffolding:
ffprobe summaries, visual checkpoint stills, and a checklist page for the
currently selected artifact set.
"""

from __future__ import annotations

import html
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

EXPECTED_VIDEO = {
    "episode-16x9-master": (1920, 1080),
    "episode-9x16-master": (1080, 1920),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def find_binary(name: str) -> str:
    for prefix in ("/opt/homebrew/bin", "/usr/local/bin"):
        candidate = f"{prefix}/{name}"
        if os.path.exists(candidate):
            return candidate
    return name


def run(args: list[str], timeout: int = 120) -> dict[str, Any]:
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False, timeout=timeout)
        return {
            "command": args,
            "exitCode": result.returncode,
            "stdout": result.stdout[-12000:],
            "stderr": result.stderr[-12000:],
            "timedOut": False,
        }
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout if isinstance(error.stdout, str) else ""
        stderr = error.stderr if isinstance(error.stderr, str) else ""
        return {"command": args, "exitCode": None, "stdout": stdout[-12000:], "stderr": stderr[-12000:], "timedOut": True}


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def ffprobe(path: str | None) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {"exists": False, "path": path, "error": "missing file"}
    result = run([
        find_binary("ffprobe"),
        "-v",
        "error",
        "-show_entries",
        "format=duration,bit_rate:stream=index,codec_type,codec_name,width,height,avg_frame_rate",
        "-of",
        "json",
        path,
    ])
    if result["exitCode"] != 0:
        return {"exists": True, "path": path, "error": "ffprobe failed", "stderrTail": result["stderr"][-3000:]}
    try:
        payload = json.loads(result["stdout"] or "{}")
    except json.JSONDecodeError as error:
        return {"exists": True, "path": path, "error": f"ffprobe JSON parse failed: {error}"}
    streams = payload.get("streams") or []
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    return {
        "exists": True,
        "path": path,
        "durationSeconds": as_float((payload.get("format") or {}).get("duration")),
        "bitRate": as_float((payload.get("format") or {}).get("bit_rate")),
        "streams": streams,
        "videoStreamCount": len(video_streams),
        "audioStreamCount": len(audio_streams),
        "primaryVideo": video_streams[0] if video_streams else None,
        "primaryAudio": audio_streams[0] if audio_streams else None,
    }


def checkpoint_times(duration: float | None) -> list[dict[str, Any]]:
    if not duration or duration <= 0:
        return []
    raw = [
        ("opening", min(5.0, max(0.0, duration - 0.5))),
        ("quarter", duration * 0.25),
        ("midpoint", duration * 0.50),
        ("three-quarter", duration * 0.75),
        ("ending", max(0.0, duration - 1.0)),
    ]
    return [{"label": label, "seconds": round(seconds, 3)} for label, seconds in raw]


def create_still(path: str, output_dir: str, artifact_id: str, label: str, seconds: float) -> dict[str, Any]:
    safe_artifact = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in artifact_id)
    output_path = os.path.join(output_dir, f"{safe_artifact}-{label}-{int(round(seconds))}s.jpg")
    result = run([
        find_binary("ffmpeg"),
        "-hide_banner",
        "-y",
        "-ss",
        f"{seconds:.3f}",
        "-i",
        path,
        "-frames:v",
        "1",
        "-update",
        "1",
        output_path,
    ], timeout=120)
    return {
        "label": label,
        "seconds": seconds,
        "path": output_path,
        "exists": os.path.exists(output_path),
        "exitCode": result.get("exitCode"),
        "timedOut": result.get("timedOut"),
        "stderrTail": result.get("stderr", "")[-2000:],
    }


def inspect_artifact(artifact: dict[str, Any], output_dir: str) -> dict[str, Any]:
    artifact_id = str(artifact.get("artifactId") or "unknown-artifact")
    path = artifact.get("path")
    probe = ffprobe(path)
    warnings: list[str] = []
    errors: list[str] = []
    stills: list[dict[str, Any]] = []

    if not probe.get("exists"):
        errors.append("selected artifact file missing")
    if probe.get("error"):
        errors.append(str(probe.get("error")))

    expected_duration = as_float(artifact.get("durationSeconds"))
    actual_duration = as_float(probe.get("durationSeconds"))
    if expected_duration and actual_duration and abs(expected_duration - actual_duration) > 1.5:
        warnings.append(f"probe duration differs from selected packet by {abs(expected_duration - actual_duration):.3f}s")

    if artifact_id in EXPECTED_VIDEO:
        video = probe.get("primaryVideo") or {}
        expected_width, expected_height = EXPECTED_VIDEO[artifact_id]
        if not video:
            errors.append("selected video artifact has no video stream")
        else:
            width = video.get("width")
            height = video.get("height")
            if (width, height) != (expected_width, expected_height):
                warnings.append(f"video resolution is {width}x{height}; expected {expected_width}x{expected_height}")
        if not probe.get("audioStreamCount"):
            warnings.append("selected video artifact has no audio stream")
        if path and os.path.exists(path) and actual_duration:
            for checkpoint in checkpoint_times(actual_duration):
                still = create_still(path, output_dir, artifact_id, checkpoint["label"], checkpoint["seconds"])
                stills.append(still)
                if not still.get("exists"):
                    warnings.append(f"checkpoint still failed for {checkpoint['label']}")
    elif artifact_id == "podcast-audio-master":
        if probe.get("videoStreamCount"):
            warnings.append("podcast audio artifact has an unexpected video stream")
        if not probe.get("audioStreamCount"):
            errors.append("podcast audio artifact has no audio stream")

    return {
        "artifactId": artifact_id,
        "path": path,
        "selectedDurationSeconds": artifact.get("durationSeconds"),
        "probe": probe,
        "checkpoints": checkpoint_times(actual_duration),
        "checkpointStills": stills,
        "endingReviewSamplePath": artifact.get("endingReviewSamplePath"),
        "endingReviewSampleExists": artifact.get("endingReviewSampleExists"),
        "warnings": warnings,
        "errors": errors,
        "status": "error" if errors else ("warning" if warnings else "ok"),
    }


def artifact_html(item: dict[str, Any]) -> str:
    stills = "\n".join(
        f"""
        <a class="still" href="{file_url(still.get('path'))}">
          <img src="{file_url(still.get('path'))}" alt="{esc(item.get('artifactId'))} {esc(still.get('label'))}">
          <span>{esc(still.get('label'))} · {esc(still.get('seconds'))}s</span>
        </a>
        """
        for still in item.get("checkpointStills") or []
        if still.get("exists")
    )
    warnings = "".join(f"<li>{esc(warning)}</li>" for warning in item.get("warnings") or [])
    errors = "".join(f"<li>{esc(error)}</li>" for error in item.get("errors") or [])
    probe = item.get("probe") or {}
    video = probe.get("primaryVideo") or {}
    audio = probe.get("primaryAudio") or {}
    return f"""
    <article class="artifact {esc(item.get('status'))}">
      <div class="artifact-head">
        <div>
          <h2>{esc(item.get('artifactId'))}</h2>
          <p>{esc(round(float(probe.get('durationSeconds') or 0), 3))}s · V{esc(probe.get('videoStreamCount'))}/A{esc(probe.get('audioStreamCount'))}</p>
        </div>
        <span class="pill {esc(item.get('status'))}">{esc(item.get('status'))}</span>
      </div>
      <p class="spec">video: {esc(video.get('codec_name'))} {esc(video.get('width'))}x{esc(video.get('height'))} · audio: {esc(audio.get('codec_name'))}</p>
      <code>{esc(item.get('path'))}</code>
      <div class="still-grid">{stills or '<p>No visual checkpoint stills for this artifact.</p>'}</div>
      <details>
        <summary>Warnings and errors</summary>
        <h3>Warnings</h3>
        <ul>{warnings or '<li>None.</li>'}</ul>
        <h3>Errors</h3>
        <ul>{errors or '<li>None.</li>'}</ul>
      </details>
    </article>
    """


def html_page(packet: dict[str, Any]) -> str:
    cards = "\n".join(artifact_html(item) for item in packet.get("artifacts") or [])
    checklist = "\n".join(f"<li>{esc(item)}</li>" for item in packet["reviewChecklist"])
    blocked = "\n".join(f"<li>{esc(item)}</li>" for item in packet["blockedClaims"])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Artifact Review Assist</title>
  <style>
    :root {{
      --bg: #f4efe2;
      --paper: #fffaf0;
      --ink: #392a20;
      --muted: #75685b;
      --line: rgba(73, 53, 37, 0.16);
      --fern: #2f7657;
      --gold: #d4a62e;
      --clay: #9d4d37;
      --sky: #2f6f84;
      --shadow: 0 22px 70px rgba(42, 32, 22, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 14% 0%, rgba(212, 166, 46, 0.24), transparent 32rem),
        radial-gradient(circle at 88% 4%, rgba(47, 118, 87, 0.18), transparent 34rem),
        linear-gradient(135deg, #fbf6e9, var(--bg));
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header, main {{ padding-inline: clamp(22px, 5vw, 80px); }}
    header {{ padding-top: 52px; padding-bottom: 20px; }}
    .hero, .panel, .artifact {{
      background: rgba(255, 250, 240, 0.88);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
    }}
    .hero {{ padding: 34px; }}
    .kicker {{ color: #b17b27; font-size: .78rem; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; }}
    h1 {{ margin: 10px 0 12px; font-size: clamp(2rem, 5vw, 4.5rem); line-height: .95; letter-spacing: -.055em; }}
    h2 {{ margin: 0; }}
    p, li {{ color: var(--muted); line-height: 1.55; }}
    main {{ padding-bottom: 80px; }}
    .status-row {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }}
    .pill {{ display: inline-flex; border-radius: 999px; padding: 7px 10px; font-size: .74rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #fff; background: var(--sky); }}
    .pill.ok {{ background: var(--fern); }}
    .pill.warning {{ background: var(--gold); color: #2f2618; }}
    .pill.error {{ background: var(--clay); }}
    .artifact-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; margin-top: 24px; }}
    .artifact {{ padding: 20px; overflow: hidden; }}
    .artifact-head {{ display: flex; align-items: start; justify-content: space-between; gap: 16px; }}
    code {{ display: block; white-space: pre-wrap; overflow-wrap: anywhere; padding: 11px; border-radius: 14px; background: rgba(47, 118, 87, .10); border: 1px solid rgba(47, 118, 87, .16); color: #274235; font-size: .8rem; }}
    .still-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-top: 14px; }}
    .still {{ display: block; color: var(--ink); text-decoration: none; }}
    .still img {{ display: block; width: 100%; border-radius: 16px; border: 1px solid var(--line); background: #111; }}
    .still span {{ display: block; margin-top: 5px; font-size: .78rem; font-weight: 800; color: var(--muted); }}
    .panel {{ margin-top: 24px; padding: 24px; }}
    details {{ margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }}
    summary {{ cursor: pointer; font-weight: 900; color: #476240; }}
  </style>
</head>
<body>
  <header>
    <section class="hero">
      <div class="kicker">Quipsly Studio review assist</div>
      <h1>Selected files, sampled across the whole episode.</h1>
      <p>This page helps reviewers catch obvious whole-artifact problems before or during full watch/listen review. It is evidence, not approval.</p>
      <div class="status-row">
        <span class="pill {esc(packet['statusClass'])}">{esc(packet['status'])}</span>
        <span class="pill">{esc(packet['artifactCount'])} artifacts</span>
        <span class="pill warning">{esc(packet['warningCount'])} warnings</span>
        <span class="pill error">{esc(packet['errorCount'])} errors</span>
      </div>
    </section>
  </header>
  <main>
    <section class="artifact-grid">{cards}</section>
    <section class="panel">
      <h2>Full watch/listen checklist</h2>
      <ul>{checklist}</ul>
    </section>
    <section class="panel">
      <h2>Blocked claims</h2>
      <ul>{blocked}</ul>
      <p>{esc(packet['truth'])}</p>
    </section>
  </main>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 selected artifact review assist",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Status: `{packet['status']}`",
        f"HTML: `{packet['html']}`",
        "",
        "## Artifacts",
        "",
    ]
    for item in packet["artifacts"]:
        lines.extend([
            f"### {item['artifactId']}",
            f"- Status: `{item['status']}`",
            f"- Path: `{item['path']}`",
            f"- Duration: `{(item.get('probe') or {}).get('durationSeconds')}`",
            f"- Streams: V`{(item.get('probe') or {}).get('videoStreamCount')}` A`{(item.get('probe') or {}).get('audioStreamCount')}`",
            f"- Checkpoint stills: `{len(item.get('checkpointStills') or [])}`",
            f"- Warnings: `{len(item.get('warnings') or [])}`",
            f"- Errors: `{len(item.get('errors') or [])}`",
            "",
        ])
    lines.extend(["## Review checklist", ""])
    for item in packet["reviewChecklist"]:
        lines.append(f"- [ ] {item}")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 6:
        print(
            "usage: episode1_selected_artifact_review_assist.py selected-station.json output-dir output.html output.json output.md",
            file=sys.stderr,
        )
        return 2

    station_path, output_dir, output_html, output_json, output_md = sys.argv[1:6]
    station = load_json(station_path)
    os.makedirs(output_dir, exist_ok=True)
    artifacts = [inspect_artifact(item, output_dir) for item in station.get("selectedArtifacts") or []]
    error_count = sum(len(item.get("errors") or []) for item in artifacts)
    warning_count = sum(len(item.get("warnings") or []) for item in artifacts)
    status = "selected-artifact-review-assist-ready"
    status_class = "ok"
    if error_count:
        status = "selected-artifact-review-assist-has-errors"
        status_class = "error"
    elif warning_count:
        status = "selected-artifact-review-assist-has-warnings"
        status_class = "warning"

    packet = {
        "packetType": "quipsly-episode1-selected-artifact-review-assist",
        "version": "2026-06-20.selected-artifact-review-assist.v1",
        "projectSlug": station.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": station.get("episodeSlug", "episode-1"),
        "generatedAt": now_iso(),
        "status": status,
        "statusClass": status_class,
        "sourceSelectedReviewStation": station_path,
        "html": output_html,
        "markdown": output_md,
        "outputDir": output_dir,
        "artifactCount": len(artifacts),
        "warningCount": warning_count,
        "errorCount": error_count,
        "artifacts": artifacts,
        "reviewChecklist": [
            "Watch the full 16:9 selected master for wrong-file, sync, visual continuity, unexpected black, ending, and audio issues.",
            "Watch the full 9:16 selected master for crop, framing, wrong-file, sync, visual continuity, ending, and platform-safe composition issues.",
            "Listen through the podcast audio candidate or review it in a DAW/player for sync drift, long silence, clipping, missing tail, and abrupt ending.",
            "Compare the selected ending samples to the full artifact ending before deciding pass/needs-fix/reject.",
            "Record the decision with `episode1-artifact-watch-review-decision`; do not claim publication readiness from this assist packet.",
        ],
        "blockedClaims": station.get("blockedClaims") or [
            "Do not claim artifact-ready until full watch/listen review passes.",
            "Do not claim publication-ready until Tower destination state and receipt targets are reviewed.",
            "Do not claim published until external receipts exist.",
        ],
        "truth": "This assist packet creates full-artifact review scaffolding. It does not approve artifacts, publish, upload, schedule, or capture receipts.",
    }
    os.makedirs(os.path.dirname(output_html) or ".", exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))

    print(json.dumps({
        "packetType": "quipsly-episode1-selected-artifact-review-assist-result",
        "status": status,
        "artifactCount": len(artifacts),
        "warningCount": warning_count,
        "errorCount": error_count,
        "html": output_html,
        "json": output_json,
        "markdown": output_md,
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
