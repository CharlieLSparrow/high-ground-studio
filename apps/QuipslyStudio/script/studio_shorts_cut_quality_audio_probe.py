#!/usr/bin/env python3
"""Create source-safe audio/cadence evidence for one recommended native short.

The probe reads the existing cut-quality workbench, analyzes one selected short
with ffprobe/ffmpeg, and writes versioned local review artifacts. It measures
pause/loudness/waveform evidence; it does not judge the edit, transcribe,
approve, publish, export, or mutate media.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-audio-probes"
SCHEMA = "quipsly.studio.shorts-cut-quality-audio-probe.v1"
VERSION = "2026-07-02.v1"

SILENCE_START_RE = re.compile(r"silence_start:\s*([0-9.]+)")
SILENCE_END_RE = re.compile(r"silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)")
MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*(-?[0-9.]+)\s*dB")
MAX_VOLUME_RE = re.compile(r"max_volume:\s*(-?[0-9.]+)\s*dB")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def safe_slug(value: Any) -> str:
    text = str(value or "short")
    clean = "".join(ch.lower() if ch.isalnum() else "-" for ch in text)
    while "--" in clean:
        clean = clean.replace("--", "-")
    return clean.strip("-")[:96] or "short"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object at {path}")
    return data


def workbench_items(board: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in board.get("items", []) if isinstance(item, dict)]


def choose_item(items: list[dict[str, Any]], short_id: str, rank: int, readiness: str) -> dict[str, Any]:
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in cut-quality workbench: {short_id}")
    if rank > 0:
        for item in items:
            if int(item.get("rank") or -1) == rank:
                return item
        raise SystemExit(f"Rank not found in cut-quality workbench: {rank}")
    if readiness:
        for item in items:
            if str(item.get("readinessLevel") or "") == readiness:
                return item
        raise SystemExit(f"No cut-quality item has readiness level: {readiness}")
    for level in ("watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"):
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def require_tool(name: str) -> str:
    tool = shutil.which(name)
    if not tool:
        raise SystemExit(f"{name} is not installed or not on PATH. Cannot create honest audio/cadence evidence.")
    return tool


def run_command(command: list[str], timeout: int = 90) -> tuple[int, str]:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "command timed out"
    return completed.returncode, (completed.stderr or "") + (completed.stdout or "")


def ffprobe_media(path: Path) -> dict[str, Any]:
    ffprobe = require_tool("ffprobe")
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    code, output = run_command(command, timeout=45)
    if code != 0:
        raise SystemExit(f"ffprobe failed for {path}: {output.strip()[-1200:]}")
    try:
        data = json.loads(output or "{}")
    except json.JSONDecodeError as error:
        raise SystemExit(f"ffprobe returned invalid JSON for {path}: {error}") from error
    streams = [stream for stream in data.get("streams", []) if isinstance(stream, dict)]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    try:
        duration = float((data.get("format") or {}).get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    return {
        "durationSeconds": duration,
        "hasAudio": bool(audio_streams),
        "hasVideo": bool(video_streams),
        "audioCodecs": sorted({str(stream.get("codec_name") or "") for stream in audio_streams if stream.get("codec_name")}),
        "videoCodecs": sorted({str(stream.get("codec_name") or "") for stream in video_streams if stream.get("codec_name")}),
        "sampleRates": sorted({str(stream.get("sample_rate") or "") for stream in audio_streams if stream.get("sample_rate")}),
        "channels": sorted({int(stream.get("channels") or 0) for stream in audio_streams if stream.get("channels")}),
        "streamCount": len(streams),
    }


def detect_silences(path: Path, noise: str, minimum_silence: float) -> tuple[list[dict[str, float]], str]:
    ffmpeg = require_tool("ffmpeg")
    command = [
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        f"silencedetect=noise={noise}:d={minimum_silence:.3f}",
        "-f",
        "null",
        "-",
    ]
    code, output = run_command(command, timeout=120)
    if code != 0 and "silence_" not in output:
        return [], output.strip()[-1200:]
    silences: list[dict[str, float]] = []
    pending_start: float | None = None
    for line in output.splitlines():
        start_match = SILENCE_START_RE.search(line)
        if start_match:
            pending_start = float(start_match.group(1))
            continue
        end_match = SILENCE_END_RE.search(line)
        if end_match:
            end = float(end_match.group(1))
            duration = float(end_match.group(2))
            start = pending_start if pending_start is not None else max(0.0, end - duration)
            silences.append({"start": round(start, 3), "end": round(end, 3), "duration": round(duration, 3)})
            pending_start = None
    return silences, ""


def volume_stats(path: Path) -> tuple[dict[str, float], str]:
    ffmpeg = require_tool("ffmpeg")
    command = [
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ]
    code, output = run_command(command, timeout=120)
    mean_match = MEAN_VOLUME_RE.search(output)
    max_match = MAX_VOLUME_RE.search(output)
    stats = {
        "meanVolumeDb": float(mean_match.group(1)) if mean_match else None,
        "maxVolumeDb": float(max_match.group(1)) if max_match else None,
    }
    if code != 0 and not mean_match and not max_match:
        return stats, output.strip()[-1200:]
    return stats, ""


def create_waveform(path: Path, output: Path) -> tuple[str, str]:
    ffmpeg = require_tool("ffmpeg")
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(path),
        "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1800x320:colors=8EDC89",
        "-frames:v",
        "1",
        str(output),
    ]
    code, text = run_command(command, timeout=90)
    if output.exists():
        return str(output), ""
    return "", text.strip()[-1200:] if code else "waveform was not written"


def assessment(duration: float, silences: list[dict[str, float]], stats: dict[str, float]) -> dict[str, Any]:
    total_silence = sum(float(item.get("duration") or 0) for item in silences)
    meaningful = [item for item in silences if float(item.get("duration") or 0) >= 0.35]
    long_pauses = [item for item in silences if float(item.get("duration") or 0) >= 0.75]
    silence_fraction = total_silence / duration if duration > 0 else 0.0
    pauses_per_minute = len(meaningful) / max(duration / 60.0, 0.001)
    warnings: list[str] = []
    strengths: list[str] = []
    reviewer_questions: list[str] = [
        "Do these detected pauses feel like dead air, emphasis, or human thinking time?",
        "Would a J-cut or L-cut make any pause feel more natural than a hard trim?",
        "Is the short over-compressed, or does the cadence still sound like Charlie/Homer?",
        "Does the loudness feel platform-ready without sounding harsh?",
    ]
    if not silences:
        warnings.append("No silences were detected at this threshold. Listen for over-tight robotic cadence before marking Keep.")
    if long_pauses:
        warnings.append(f"{len(long_pauses)} pause(s) are >= 0.75s. Review before tightening; some may be emphasis.")
    if 0.03 <= silence_fraction <= 0.18:
        strengths.append(f"Silence fraction is plausible for human cadence at {silence_fraction:.0%}.")
    elif silence_fraction > 0.22:
        warnings.append(f"Silence fraction is high at {silence_fraction:.0%}. Check for drag or quiet dead air.")
    if stats.get("maxVolumeDb") is not None and float(stats["maxVolumeDb"]) > -0.2:
        warnings.append("Max volume is very close to clipping. Listen for harshness.")
    if stats.get("meanVolumeDb") is not None and float(stats["meanVolumeDb"]) < -32:
        warnings.append("Mean volume is low. Listen before platform handoff.")
    label = "cadence-review" if warnings else "rhythm-plausible"
    return {
        "label": label,
        "silenceCount": len(silences),
        "meaningfulPauseCount": len(meaningful),
        "longPauseCount": len(long_pauses),
        "totalSilenceSeconds": round(total_silence, 3),
        "silenceFraction": round(silence_fraction, 4),
        "pausesPerMinute": round(pauses_per_minute, 2),
        "longestPauseSeconds": max((float(item.get("duration") or 0) for item in silences), default=0.0),
        "warnings": warnings,
        "strengths": strengths,
        "reviewerQuestions": reviewer_questions,
        "truth": "Measurement only. A human or agent still needs to listen before recording a cut-quality outcome.",
    }


def note_templates(short_id: str) -> dict[str, str]:
    return {
        "cadence": (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field cadence "
            "--note '<what pause/loudness evidence proves after listening>'"
        ),
        "jCutLCut": (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field jCutLCut "
            "--note '<where an audio lead or tail would improve flow>'"
        ),
        "audioFeel": (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field audioFeel "
            "--note '<specific loudness/noise/cadence observation>'"
        ),
        "riskTradeoff": (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field riskTradeoff "
            "--note '<what we preserve versus tighten>'"
        ),
    }


def build_probe(
    workbench_path: Path,
    item: dict[str, Any],
    output_dir: Path,
    noise: str,
    minimum_silence: float,
) -> tuple[dict[str, Any], Path]:
    short_id = str(item.get("shortId") or "short")
    media_path = Path(str(item.get("mediaPath") or item.get("path") or "")).expanduser()
    if not media_path.exists():
        raise SystemExit(f"Selected short media is missing: {media_path}")
    probe = ffprobe_media(media_path)
    if not probe.get("hasAudio"):
        raise SystemExit(f"Selected short has no audio stream: {media_path}")
    folder = output_dir / safe_slug(short_id) / f"{stamp()}-{safe_slug(short_id)}-audio-probe"
    folder.mkdir(parents=True, exist_ok=False)
    silences, silence_warning = detect_silences(media_path, noise, minimum_silence)
    volume, volume_warning = volume_stats(media_path)
    waveform_path, waveform_warning = create_waveform(media_path, folder / "waveform.png")
    warnings = [warning for warning in [silence_warning, volume_warning, waveform_warning] if warning]
    cadence = assessment(float(probe.get("durationSeconds") or 0), silences, volume)
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceWorkbenchJson": str(workbench_path),
        "shortId": short_id,
        "episode": item.get("episode"),
        "episodeVersion": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "readinessLevel": item.get("readinessLevel"),
        "mediaPath": str(media_path),
        "mediaUri": file_uri(media_path),
        "probe": probe,
        "analysisSettings": {
            "silenceNoise": noise,
            "minimumSilenceSeconds": minimum_silence,
        },
        "silences": silences,
        "volume": volume,
        "cadenceAssessment": cadence,
        "toolWarnings": warnings,
        "waveformPath": waveform_path,
        "waveformUri": file_uri(waveform_path) if waveform_path else "",
        "noteCommandTemplates": note_templates(short_id),
        "safeCommands": {
            "openShort": f"open {shell_quote(str(media_path))}",
            "revealShort": f"open -R {shell_quote(str(media_path))}",
            "worksheet": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(short_id)}",
            "recordCadenceNoteExample": (
                "script/agentctl.sh studio-shorts-cut-quality-note "
                f"--short-id {shell_quote(short_id)} --field cadence "
                "--note '<listen-backed cadence evidence from this audio probe>'"
            ),
        },
        "artifactDir": str(folder),
        "truth": (
            "Audio/cadence probe only. It records no review decision, edits no timeline, exports no media, "
            "publishes nothing, uploads nothing, transcribes nothing, mutates no media, overwrites no prior artifacts, "
            "deletes nothing, and creates no receipt truth."
        ),
    }
    return payload, folder


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def render_markdown(payload: dict[str, Any]) -> str:
    cadence = payload.get("cadenceAssessment") if isinstance(payload.get("cadenceAssessment"), dict) else {}
    probe = payload.get("probe") if isinstance(payload.get("probe"), dict) else {}
    volume = payload.get("volume") if isinstance(payload.get("volume"), dict) else {}
    lines = [
        "# Shorts cut-quality audio probe",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Title: {payload.get('title')}",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('episodeVersion')}`",
        f"- Media: `{payload.get('mediaPath')}`",
        f"- Duration: `{float(probe.get('durationSeconds') or 0):.2f}s`",
        f"- Audio codecs: `{', '.join(probe.get('audioCodecs') or [])}`",
        f"- Assessment: `{cadence.get('label')}`",
        "",
        payload.get("truth", ""),
        "",
        "## Cadence facts",
        "",
        f"- Silence count: `{cadence.get('silenceCount')}`",
        f"- Meaningful pauses: `{cadence.get('meaningfulPauseCount')}`",
        f"- Long pauses: `{cadence.get('longPauseCount')}`",
        f"- Silence fraction: `{cadence.get('silenceFraction')}`",
        f"- Pauses per minute: `{cadence.get('pausesPerMinute')}`",
        f"- Mean volume: `{volume.get('meanVolumeDb')}` dB",
        f"- Max volume: `{volume.get('maxVolumeDb')}` dB",
        f"- Waveform: `{payload.get('waveformPath')}`",
        "",
        "## Reviewer questions",
        "",
    ]
    for question in cadence.get("reviewerQuestions", []):
        lines.append(f"- {question}")
    lines.extend(["", "## Warnings", ""])
    for warning in cadence.get("warnings", []):
        lines.append(f"- {warning}")
    if not cadence.get("warnings"):
        lines.append("- None from measurement. Still listen before recording intent.")
    lines.extend(["", "## Useful commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cadence = payload.get("cadenceAssessment") if isinstance(payload.get("cadenceAssessment"), dict) else {}
    probe = payload.get("probe") if isinstance(payload.get("probe"), dict) else {}
    volume = payload.get("volume") if isinstance(payload.get("volume"), dict) else {}
    silence_cards = "".join(
        f"<li><strong>{esc(item.get('start'))}s - {esc(item.get('end'))}s</strong><span>{esc(item.get('duration'))}s</span></li>"
        for item in payload.get("silences", [])[:20]
        if isinstance(item, dict)
    )
    questions = "".join(f"<li>{esc(question)}</li>" for question in cadence.get("reviewerQuestions", []))
    warnings = "".join(f"<li>{esc(warning)}</li>" for warning in cadence.get("warnings", [])) or "<li>No measurement warnings. Still listen before recording intent.</li>"
    commands = "".join(
        f"<div class='command'><strong>{esc(label)}</strong><code>{esc(command)}</code></div>"
        for label, command in (payload.get("safeCommands") or {}).items()
    )
    waveform = f"<img src='{esc(payload.get('waveformUri'))}' alt='audio waveform'>" if payload.get("waveformUri") else "<p>No waveform generated.</p>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts audio probe</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#1d3121; --leaf:#8edc89; --honey:#f3ce54; --water:#79d7e2; --cream:#fff1d4; --clay:#d86f57; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 12% -8%,rgba(121,215,226,.22),transparent 28rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.panel,.command {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.5rem,7vw,5.8rem); line-height:.9; }}
    h2 {{ margin:0 0 12px; }}
    p,li {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:minmax(360px,.9fr) minmax(480px,1.3fr); gap:16px; align-items:start; }}
    .panel {{ padding:20px; margin-bottom:16px; }}
    img {{ display:block; width:100%; border-radius:18px; border:1px solid var(--line); background:#050505; }}
    .silences {{ list-style:none; margin:0; padding:0; display:grid; gap:7px; }}
    .silences li {{ display:flex; justify-content:space-between; gap:10px; border:1px solid var(--line); border-radius:14px; padding:8px 10px; background:rgba(0,0,0,.22); }}
    .warning li {{ color:#ffd2bf; }}
    .command {{ display:grid; grid-template-columns:160px minmax(0,1fr); gap:10px; align-items:start; padding:12px 14px; margin-bottom:8px; }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    @media (max-width:900px) {{ .grid,.command {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · audio cadence evidence</p>
    <h1>Audio probe for {esc(payload.get('shortId'))}</h1>
    <p>{esc(payload.get('truth'))}</p>
    <div class="metrics">
      <div><strong>{esc(cadence.get('label'))}</strong><span>measurement label</span></div>
      <div><strong>{float(probe.get('durationSeconds') or 0):.1f}s</strong><span>duration</span></div>
      <div><strong>{esc(cadence.get('meaningfulPauseCount'))}</strong><span>meaningful pauses</span></div>
      <div><strong>{esc(volume.get('meanVolumeDb'))}</strong><span>mean dB</span></div>
    </div>
  </header>
  <section class="grid">
    <aside>
      <section class="panel"><p class="eyebrow">Reviewer questions</p><ul>{questions}</ul></section>
      <section class="panel warning"><p class="eyebrow">Measurement warnings</p><ul>{warnings}</ul></section>
      <section class="panel"><p class="eyebrow">Safe commands</p>{commands}</section>
    </aside>
    <section>
      <section class="panel"><p class="eyebrow">Waveform</p>{waveform}</section>
      <section class="panel"><p class="eyebrow">Detected silences</p><ul class="silences">{silence_cards or '<li>No silences detected at this threshold.</li>'}</ul></section>
    </section>
  </section>
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], folder: Path, basename: str) -> dict[str, str]:
    basename = safe_slug(basename or f"{payload.get('shortId')}-audio-probe")
    paths = {
        "json": folder / f"{basename}.json",
        "markdown": folder / f"{basename}.md",
        "html": folder / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an audio/cadence probe for one cut-quality short.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--noise", default="-42dB", help="silencedetect noise threshold.")
    parser.add_argument("--minimum-silence", type=float, default=0.35, help="Minimum silence duration in seconds.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Root folder for audio probe artifacts.")
    parser.add_argument("--basename", default="", help="Optional output basename inside the timestamped folder.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    workbench_path = Path(args.workbench).expanduser()
    board = read_json(workbench_path)
    item = choose_item(workbench_items(board), args.short_id, args.rank, args.readiness)
    payload, folder = build_probe(
        workbench_path=workbench_path,
        item=item,
        output_dir=Path(args.output_dir).expanduser(),
        noise=args.noise,
        minimum_silence=args.minimum_silence,
    )
    basename = args.basename or f"{payload.get('shortId')}-audio-probe"
    written = write_outputs(payload, folder, basename)
    payload["artifactPaths"] = written
    Path(written["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(written["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
